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

test('shouldPreferSource considers step when percent is equal', () => {
  assert.equal(
    shouldPreferSource(
      { percent: 50, step: 4, updatedAt: '2023-12-01T00:00:00Z' },
      { percent: 50, step: 2, updatedAt: '2024-02-01T00:00:00Z' },
    ),
    true,
  );
  assert.equal(
    shouldPreferSource(
      { percent: '50', step: '1', updatedAt: '2024-05-01T00:00:00Z' },
      { percent: 50, step: 3, updatedAt: '2024-01-01T00:00:00Z' },
    ),
    false,
  );
});

test('shouldPreferSource considers created timestamps when updates are missing', () => {
  assert.equal(
    shouldPreferSource(
      { percent: 50, step: 2, $createdAt: '2024-03-01T00:00:00Z' },
      { percent: 50, step: 2, $createdAt: '2024-01-01T00:00:00Z' },
    ),
    true,
  );
  assert.equal(
    shouldPreferSource(
      { percent: 50, step: 2, $createdAt: '2023-10-01T00:00:00Z' },
      { percent: 50, step: 2, $createdAt: '2024-04-01T00:00:00Z' },
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

test('listAllDocuments continues without total metadata using page length heuristics', async () => {
  const firstPage = Array.from({ length: 100 }, (_, index) => ({
    $id: `doc-${index}`,
  }));
  const secondPage = [{ $id: 'doc-100' }];
  const responses = [
    { documents: firstPage },
    { documents: secondPage },
  ];

  const recordedCalls = [];
  const databases = {
    listDocuments: async (databaseId, collectionId, queries) => {
      recordedCalls.push({ databaseId, collectionId, queries });
      return responses.shift();
    },
  };

  const docs = await listAllDocuments(databases, 'progress');

  assert.equal(docs.length, 101);
  assert.equal(recordedCalls.length, 2);
  assert.deepEqual(
    docs.map((doc) => doc.$id),
    [...Array.from({ length: 100 }, (_, index) => `doc-${index}`), 'doc-100'],
  );
  assert.deepEqual(recordedCalls[0].queries, ['limit(100)']);
  assert.deepEqual(recordedCalls[1].queries, ['limit(100)', 'cursorAfter("doc-99")']);
});

test('listAllDocuments tolerates missing document arrays', async () => {
  const responses = [
    { documents: [{ $id: 'doc-1' }], total: 5 },
    { documents: null, total: 5 },
  ];

  const recordedCalls = [];
  const databases = {
    listDocuments: async (databaseId, collectionId, queries) => {
      recordedCalls.push({ databaseId, collectionId, queries });
      return responses.shift();
    },
  };

  const docs = await listAllDocuments(databases, 'progress');

  assert.equal(docs.length, 1);
  assert.equal(recordedCalls.length, 2);
  assert.deepEqual(recordedCalls[0].queries, ['limit(100)']);
  assert.deepEqual(recordedCalls[1].queries, ['limit(100)', 'cursorAfter("doc-1")']);
});

test('handler returns early when migrating to the same user', async () => {
  resetFetchMock();

  const result = await handler({
    httpMethod: 'POST',
    body: JSON.stringify({ fromUserId: 'user-1', toUserId: 'user-1' }),
  });

  assert.equal(result.statusCode, 200);
  assert.deepEqual(JSON.parse(result.body), {
    message: 'No migration necessary',
    migrated: 0,
    merged: 0,
    events: 0,
    details: { progress: [], events: [] },
  });

  assert.equal(fetchCalls.length, 0);
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
        $id: 'source-winner',
        journeySlug: 'journey-a',
        percent: 75,
        step: 4,
        state: '{"foo":"bar"}',
        updatedAt: '2024-03-01T00:00:00Z',
      },
      {
        $id: 'source-weaker',
        journeySlug: 'journey-a',
        percent: 40,
        step: 2,
        state: null,
        updatedAt: '2024-01-15T00:00:00Z',
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
    total: 3,
  });

  queueResponse({ $id: 'target-doc' });
  queueResponse(null, { status: 204 });
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
  assert.deepEqual(payload, {
    migrated: 1,
    merged: 2,
    events: 2,
    details: {
      progress: [
        {
          action: 'merged',
          winner: 'source',
          journeySlug: 'journey-a',
          sourceDocumentId: 'source-winner',
          targetDocumentId: 'target-doc',
        },
        {
          action: 'merged',
          winner: 'target',
          journeySlug: 'journey-a',
          sourceDocumentId: 'source-weaker',
          targetDocumentId: 'target-doc',
        },
        {
          action: 'migrated',
          journeySlug: 'journey-b',
          documentId: 'source-new',
        },
      ],
      events: [
        { action: 'transferred', eventId: 'event-1', journeySlug: null },
        { action: 'transferred', eventId: 'event-2', journeySlug: null },
      ],
    },
  });

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
  assert.equal(deleteCalls.length, 2);
  const deletePaths = new Set(deleteCalls.map((call) => new URL(call.url).pathname));
  assert.ok(deletePaths.has(
    `/v1/databases/${process.env.APPWRITE_DB_ID}/collections/${process.env.COL_PROGRESS_ID}/documents/source-winner`
  ));
  assert.ok(deletePaths.has(
    `/v1/databases/${process.env.APPWRITE_DB_ID}/collections/${process.env.COL_PROGRESS_ID}/documents/source-weaker`
  ));

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
      step: 4,
      percent: 75,
      state: '{"foo":"bar"}',
      updatedAt: '2024-03-01T00:00:00Z',
      permissions: [
        'read("user:member-1")',
        'update("user:member-1")',
        'delete("user:member-1")',
      ],
    },
  );

  assert.equal(patchMap.has(progressPath('source-weaker')), false);

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

