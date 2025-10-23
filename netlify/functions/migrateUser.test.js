import test from 'node:test';
import assert from 'node:assert/strict';

const originalFetch = globalThis.fetch;
const fetchCalls = [];
const responseQueue = [];

const queueResponse = (body, init = {}) => {
  responseQueue.push({ body, init });
};

const resetFetchMock = () => {
  fetchCalls.length = 0;
  responseQueue.length = 0;
};

globalThis.fetch = async (input, options = {}) => {
  const url = typeof input === 'string' ? input : input.toString();
  const method = options.method ?? 'GET';
  const headers = options.headers ? { ...options.headers } : {};
  const body = options.body ?? undefined;

  fetchCalls.push({ url, method, headers, body });

  if (!responseQueue.length) {
    throw new Error(`Unexpected fetch call: ${method} ${url}`);
  }

  const next = responseQueue.shift();
  const status = next.init?.status ?? 200;
  const responseHeaders = next.init?.headers ?? {};

  if (status === 204) {
    return new Response(null, { status, headers: responseHeaders });
  }

  const payload =
    typeof next.body === 'string' ? next.body : JSON.stringify(next.body ?? {});

  const headersWithType = {
    'content-type': 'application/json',
    ...responseHeaders,
  };

  return new Response(payload, { status, headers: headersWithType });
};

test.after(() => {
  globalThis.fetch = originalFetch;
});

process.env.APPWRITE_ENDPOINT = 'https://example.com/v1';
process.env.APPWRITE_PROJECT = 'proj';
process.env.APPWRITE_API_KEY = 'api-key';
process.env.APPWRITE_DB_ID = 'test-db';
process.env.COL_PROGRESS_ID = 'progress';
process.env.COL_EVENTS_ID = 'events';

const {
  Query,
  documentPermissions,
  eventPermissions,
  handler,
  listAllDocuments,
  parseTimestamp,
  shouldPreferSource,
} = await import('./migrateUser.js');

test('shouldPreferSource prioritizes higher percent progress', () => {
  assert.equal(
    shouldPreferSource({ percent: 70, updatedAt: '2024-01-01T00:00:00Z' }, { percent: 40 }),
    true,
  );
  assert.equal(
    shouldPreferSource({ percent: 20, updatedAt: '2024-01-01T00:00:00Z' }, { percent: 50 }),
    false,
  );
});

test('shouldPreferSource breaks ties by most recent timestamp', () => {
  assert.equal(
    shouldPreferSource(
      { percent: 50, updatedAt: '2024-02-01T00:00:00Z' },
      { percent: 50, updatedAt: '2024-01-01T00:00:00Z' },
    ),
    true,
  );
  assert.equal(
    shouldPreferSource(
      { percent: 50, updatedAt: '2023-12-01T00:00:00Z' },
      { percent: 50, updatedAt: '2024-01-01T00:00:00Z' },
    ),
    false,
  );
});

test('documentPermissions returns full CRUD permissions for a user', () => {
  assert.deepEqual(documentPermissions('user123'), [
    'read("user:user123")',
    'update("user:user123")',
    'delete("user:user123")',
  ]);
});

test('eventPermissions returns read-only permission', () => {
  assert.deepEqual(eventPermissions('abc'), ['read("user:abc")']);
});

test('parseTimestamp normalizes values safely', () => {
  assert.equal(parseTimestamp('2024-01-01T00:00:00Z'), Date.parse('2024-01-01T00:00:00Z'));
  assert.equal(parseTimestamp(undefined), 0);
  assert.equal(parseTimestamp('not-a-date'), 0);
});

test('listAllDocuments paginates until the entire collection is loaded', async () => {
  const filter = Query.equal('userId', 'user123');
  const recordedCalls = [];
  const responses = [
    {
      documents: [
        { $id: 'a', value: 1 },
        { $id: 'b', value: 2 },
      ],
      total: 3,
    },
    {
      documents: [{ $id: 'c', value: 3 }],
      total: 3,
    },
  ];

  const databases = {
    listDocuments: async (databaseId, collectionId, queries) => {
      recordedCalls.push({ databaseId, collectionId, queries });
      return responses.shift();
    },
  };

  const docs = await listAllDocuments(databases, 'progress', [filter]);

  assert.equal(docs.length, 3);
  assert.deepEqual(
    docs.map((doc) => doc.$id),
    ['a', 'b', 'c'],
  );

  assert.equal(recordedCalls[0].databaseId, 'test-db');
  assert.equal(recordedCalls[0].collectionId, 'progress');
  assert.deepEqual(recordedCalls[0].queries, [filter, 'limit(100)']);
  assert.deepEqual(recordedCalls[1].queries, [filter, 'limit(100)', 'cursorAfter("b")']);
});

test('handler migrates documents and events to the target user', async () => {
  resetFetchMock();

  queueResponse({
    documents: [
      {
        $id: 'target-doc',
        journeySlug: 'journey-a',
        percent: 10,
        step: 1,
        state: null,
        updatedAt: '2024-01-01T00:00:00Z',
      },
    ],
    total: 1,
  });

  queueResponse({
    documents: [
      {
        $id: 'source-doc',
        journeySlug: 'journey-a',
        percent: 60,
        step: 2,
        state: '{"foo":"bar"}',
        updatedAt: '2024-02-01T00:00:00Z',
      },
      {
        $id: 'source-new',
        journeySlug: 'journey-b',
        percent: 20,
        step: 1,
        state: null,
        updatedAt: '2024-01-15T00:00:00Z',
      },
    ],
    total: 2,
  });

  queueResponse({ $id: 'target-doc' });
  queueResponse(null, { status: 204 });
  queueResponse({ $id: 'source-new' });

  queueResponse({
    documents: [
      { $id: 'event-1' },
      { $id: 'event-2' },
    ],
    total: 2,
  });

  queueResponse({ $id: 'event-1' });
  queueResponse({ $id: 'event-2' });

  const result = await handler({
    httpMethod: 'POST',
    body: JSON.stringify({ fromUserId: 'anon-user', toUserId: 'member-1' }),
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.headers['Content-Type'], 'application/json');

  const payload = JSON.parse(result.body);
  assert.deepEqual(payload, { migrated: 1, merged: 1, events: 2 });

  assert.equal(responseQueue.length, 0);

  const getCalls = fetchCalls.filter((call) => call.method === 'GET');
  assert.equal(getCalls.length, 3);

  const targetQueries = new URL(getCalls[0].url).searchParams.getAll('queries[]');
  assert.deepEqual(targetQueries, [
    'equal("userId", ["member-1"])',
    'limit(100)',
  ]);

  const sourceQueries = new URL(getCalls[1].url).searchParams.getAll('queries[]');
  assert.deepEqual(sourceQueries, [
    'equal("userId", ["anon-user"])',
    'limit(100)',
  ]);

  const eventQueries = new URL(getCalls[2].url).searchParams.getAll('queries[]');
  assert.deepEqual(eventQueries, [
    'equal("userId", ["anon-user"])',
    'limit(100)',
  ]);

  const deleteCalls = fetchCalls.filter((call) => call.method === 'DELETE');
  assert.equal(deleteCalls.length, 1);
  assert.ok(deleteCalls[0].url.endsWith('/progress/documents/source-doc'));

  const patchCalls = fetchCalls.filter((call) => call.method === 'PATCH');
  assert.equal(patchCalls.length, 4);

  const patchMap = new Map();
  patchCalls.forEach((call) => {
    patchMap.set(new URL(call.url).pathname, JSON.parse(call.body));
  });

  const progressPath = (docId) =>
    `/v1/databases/${process.env.APPWRITE_DB_ID}/collections/${process.env.COL_PROGRESS_ID}/documents/${docId}`;
  const eventsPath = (docId) =>
    `/v1/databases/${process.env.APPWRITE_DB_ID}/collections/${process.env.COL_EVENTS_ID}/documents/${docId}`;

  assert.deepEqual(
    patchMap.get(progressPath('target-doc')),
    {
      userId: 'member-1',
      step: 2,
      percent: 60,
      state: '{"foo":"bar"}',
      updatedAt: '2024-02-01T00:00:00Z',
      permissions: [
        'read("user:member-1")',
        'update("user:member-1")',
        'delete("user:member-1")',
      ],
    },
  );

  assert.deepEqual(
    patchMap.get(progressPath('source-new')),
    {
      userId: 'member-1',
      permissions: [
        'read("user:member-1")',
        'update("user:member-1")',
        'delete("user:member-1")',
      ],
    },
  );

  assert.deepEqual(
    patchMap.get(eventsPath('event-1')),
    {
      userId: 'member-1',
      permissions: ['read("user:member-1")'],
    },
  );

  assert.deepEqual(
    patchMap.get(eventsPath('event-2')),
    {
      userId: 'member-1',
      permissions: ['read("user:member-1")'],
    },
  );

  const headerCheck = fetchCalls[0].headers;
  assert.equal(headerCheck['X-Appwrite-Project'], 'proj');
  assert.equal(headerCheck['X-Appwrite-Key'], 'api-key');
});

