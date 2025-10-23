const fetchFn = globalThis.fetch?.bind(globalThis);

if (!fetchFn) {
  throw new Error("Global fetch API is not available in this runtime");
}

class AppwriteClient {
  constructor(endpoint, project, apiKey) {
    this.endpoint = endpoint.replace(/\/$/, "");
    this.project = project;
    this.apiKey = apiKey;
  }

  async request(path, { method = "GET", queries = [], body } = {}) {
    const base = this.endpoint.endsWith("/")
      ? this.endpoint
      : `${this.endpoint}/`;
    const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
    const url = new URL(normalizedPath, base);

    for (const query of queries) {
      if (query !== undefined && query !== null) {
        url.searchParams.append("queries[]", query);
      }
    }

    const response = await fetchFn(url.toString(), {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Appwrite-Project": this.project,
        "X-Appwrite-Key": this.apiKey,
        "X-Appwrite-Mode": "admin",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Appwrite request failed: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    if (response.status === 204) {
      return null;
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return response.json();
    }

    return response.text();
  }
}

class Databases {
  constructor(client) {
    this.client = client;
  }

  listDocuments(databaseId, collectionId, queries = []) {
    return this.client.request(
      `/databases/${databaseId}/collections/${collectionId}/documents`,
      { queries }
    );
  }

  updateDocument(databaseId, collectionId, documentId, data, permissions = []) {
    const payload = { ...data };

    if (permissions.length > 0) {
      payload.permissions = permissions;
    }

    return this.client.request(
      `/databases/${databaseId}/collections/${collectionId}/documents/${documentId}`,
      {
        method: "PATCH",
        body: payload,
      }
    );
  }

  deleteDocument(databaseId, collectionId, documentId) {
    return this.client.request(
      `/databases/${databaseId}/collections/${collectionId}/documents/${documentId}`,
      {
        method: "DELETE",
      }
    );
  }
}

const Role = {
  user: (id) => `user:${id}`,
};

const Permission = {
  read: (role) => `read("${role}")`,
  update: (role) => `update("${role}")`,
  delete: (role) => `delete("${role}")`,
};

const serializeValues = (values) =>
  `[${values.map((value) => JSON.stringify(value)).join(",")}]`;

const Query = {
  equal: (attribute, value) => {
    const values = Array.isArray(value) ? value : [value];
    return `equal("${attribute}", ${serializeValues(values)})`;
  },
  limit: (count) => `limit(${Number(count)})`,
  cursorAfter: (cursor) => `cursorAfter(${JSON.stringify(cursor)})`,
};

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
  return new AppwriteClient(APPWRITE_ENDPOINT, APPWRITE_PROJECT, APPWRITE_API_KEY);
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
