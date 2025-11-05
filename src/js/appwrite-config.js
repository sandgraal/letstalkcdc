// Import Appwrite SDK from CDN to avoid bare module specifier issues
const AppwriteSDK = await import("https://cdn.jsdelivr.net/npm/appwrite@13.0.0/dist/esm/appwrite.js");

const { Client, Databases } = AppwriteSDK;

const client = new Client()
  .setEndpoint("https://YOUR-APPWRITE-ENDPOINT/v1")
  .setProject("YOUR_PROJECT_ID");

export const databases = new Databases(client);
export const dbConfig = {
  databaseId: "YOUR_DATABASE_ID",
  collectionId: "assistant_feedback"
};
