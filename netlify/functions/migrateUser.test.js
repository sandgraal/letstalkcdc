import test from 'node:test';
import assert from 'node:assert/strict';

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

