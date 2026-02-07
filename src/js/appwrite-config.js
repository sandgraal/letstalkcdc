const globalScope = typeof window !== "undefined" ? window : globalThis;

// Default collection ID for assistant feedback if not configured via environment
const DEFAULT_ASSISTANT_COLLECTION = "assistant_feedback";

const appwriteConfig = {
  endpoint: globalScope.APPWRITE_ENDPOINT ?? "",
  project: globalScope.APPWRITE_PROJECT ?? "",
  databaseId: globalScope.APPWRITE_DB_ID ?? "",
  collectionId: globalScope.COL_ASSISTANT_ID ?? DEFAULT_ASSISTANT_COLLECTION,
};

// Only require the core fields (endpoint, project, databaseId) for Appwrite SDK initialization
// The collectionId is optional and used only for assistant feedback
const hasRequiredConfig = Boolean(
  appwriteConfig.endpoint &&
  appwriteConfig.project &&
  appwriteConfig.databaseId,
);

let AppwriteSDK = null;

if (hasRequiredConfig) {
  try {
    // Import Appwrite SDK from CDN to avoid bundler configuration
    AppwriteSDK =
      await import("https://cdn.jsdelivr.net/npm/appwrite@13.0.0/dist/esm/appwrite.js");
  } catch (error) {
    console.error("Failed to load Appwrite SDK:", error);
  }
} else {
  console.info(
    "Appwrite configuration missing; assistant feedback will stay local.",
  );
}

let databases = null;

if (AppwriteSDK && hasRequiredConfig) {
  try {
    const { Client, Databases } = AppwriteSDK;
    const client = new Client()
      .setEndpoint(appwriteConfig.endpoint)
      .setProject(appwriteConfig.project);
    databases = new Databases(client);
  } catch (error) {
    console.error("Failed to initialize Appwrite client:", error);
  }
}

export { databases };
export const dbConfig = {
  databaseId: appwriteConfig.databaseId,
  collectionId: appwriteConfig.collectionId,
};
export const isAppwriteReady = Boolean(databases);
export const isAppwriteConfigured = hasRequiredConfig;
