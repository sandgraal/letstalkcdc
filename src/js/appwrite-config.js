// Import Appwrite SDK from CDN to avoid bare module specifier issues
let AppwriteSDK;
try {
  AppwriteSDK = await import("https://cdn.jsdelivr.net/npm/appwrite@13.0.0/dist/esm/appwrite.js");
} catch (error) {
  console.error("Failed to load Appwrite SDK:", error);
  AppwriteSDK = null;
}

const { Client, Databases } = AppwriteSDK || {};

const client = AppwriteSDK ? new Client()
  .setEndpoint("https://YOUR-APPWRITE-ENDPOINT/v1")
  .setProject("YOUR_PROJECT_ID") : null;

export const databases = client ? new Databases(client) : null;
export const dbConfig = {
  databaseId: "YOUR_DATABASE_ID",
  collectionId: "assistant_feedback"
};
