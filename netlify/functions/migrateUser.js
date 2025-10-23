import {
  Client,
  Databases,
  Permission,
  Query,
  Role,
} from "node-appwrite";

const {
  APPWRITE_ENDPOINT,
  APPWRITE_PROJECT,
  APPWRITE_API_KEY,
  APPWRITE_DB_ID,
  COL_PROGRESS_ID,
  COL_EVENTS_ID,
} = process.env;

const jsonResponse = (statusCode, body) => ({
  statusCode,
  headers: {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
  },
  body: JSON.stringify(body),
});

const createClient = () => {
  if (!APPWRITE_ENDPOINT || !APPWRITE_PROJECT || !APPWRITE_API_KEY) {
    throw new Error("Missing Appwrite configuration");
  }
  const client = new Client();
  client.setEndpoint(APPWRITE_ENDPOINT);
  client.setProject(APPWRITE_PROJECT);
  client.setKey(APPWRITE_API_KEY);
  return client;
};

const listAllDocuments = async (databases, collectionId, filters = []) => {
  const docs = [];
  let cursor = undefined;
  let hasMore = true;

  while (hasMore) {
    const queries = [...filters, Query.limit(100)];
    if (cursor) {
      queries.push(Query.cursorAfter(cursor));
    }
    const response = await databases.listDocuments(
      APPWRITE_DB_ID,
      collectionId,
      queries
    );
    docs.push(...response.documents);
    if (response.documents.length === 0 || docs.length >= response.total) {
      hasMore = false;
    } else {
      cursor = response.documents[response.documents.length - 1].$id;
    }
  }

  return docs;
};

const parseTimestamp = (value) => {
  if (!value) return 0;
  const time = Date.parse(value);
  return Number.isNaN(time) ? 0 : time;
};

const shouldPreferSource = (source, target) => {
  const sourcePercent = Number(source.percent ?? 0);
  const targetPercent = Number(target.percent ?? 0);
  if (sourcePercent > targetPercent) return true;
  if (sourcePercent < targetPercent) return false;
  return (
    parseTimestamp(source.updatedAt ?? source.$updatedAt) >=
    parseTimestamp(target.updatedAt ?? target.$updatedAt)
  );
};

const documentPermissions = (userId) => [
  Permission.read(Role.user(userId)),
  Permission.update(Role.user(userId)),
  Permission.delete(Role.user(userId)),
];

const eventPermissions = (userId) => [
  Permission.read(Role.user(userId)),
];

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(200, { ok: true });
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method Not Allowed" });
  }

  if (!APPWRITE_DB_ID || !COL_PROGRESS_ID || !COL_EVENTS_ID) {
    return jsonResponse(500, { error: "Appwrite collections are not configured" });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (error) {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  const { fromUserId, toUserId } = payload || {};

  if (!fromUserId || !toUserId) {
    return jsonResponse(400, {
      error: "Both fromUserId and toUserId are required",
    });
  }

  if (fromUserId === toUserId) {
    return jsonResponse(200, {
      message: "No migration necessary",
      migrated: 0,
      merged: 0,
      events: 0,
    });
  }

  const client = createClient();
  const databases = new Databases(client);

  try {
    const targetDocs = await listAllDocuments(databases, COL_PROGRESS_ID, [
      Query.equal("userId", toUserId),
    ]);
    const targetMap = new Map(targetDocs.map((doc) => [doc.journeySlug, doc]));

    const sourceDocs = await listAllDocuments(databases, COL_PROGRESS_ID, [
      Query.equal("userId", fromUserId),
    ]);

    let migrated = 0;
    let merged = 0;

    for (const doc of sourceDocs) {
      const existing = targetMap.get(doc.journeySlug);
      if (existing) {
        if (shouldPreferSource(doc, existing)) {
          await databases.updateDocument(
            APPWRITE_DB_ID,
            COL_PROGRESS_ID,
            existing.$id,
            {
              userId: toUserId,
              step: doc.step ?? existing.step ?? 0,
              percent: doc.percent ?? existing.percent ?? 0,
              state: doc.state ?? existing.state ?? null,
              updatedAt: doc.updatedAt ?? doc.$updatedAt ?? existing.updatedAt,
            },
            documentPermissions(toUserId)
          );
        }

        await databases.deleteDocument(
          APPWRITE_DB_ID,
          COL_PROGRESS_ID,
          doc.$id
        );
        merged += 1;
      } else {
        await databases.updateDocument(
          APPWRITE_DB_ID,
          COL_PROGRESS_ID,
          doc.$id,
          {
            userId: toUserId,
          },
          documentPermissions(toUserId)
        );
        migrated += 1;
      }
    }

    const eventDocs = await listAllDocuments(databases, COL_EVENTS_ID, [
      Query.equal("userId", fromUserId),
    ]);

    for (const doc of eventDocs) {
      await databases.updateDocument(
        APPWRITE_DB_ID,
        COL_EVENTS_ID,
        doc.$id,
        {
          userId: toUserId,
        },
        eventPermissions(toUserId)
      );
    }

    return jsonResponse(200, {
      migrated,
      merged,
      events: eventDocs.length,
    });
  } catch (error) {
    console.error("Migration failed", error);
    return jsonResponse(500, {
      error: "Migration failed",
      details: error.message,
    });
  }
};
