import { Client, Databases } from "appwrite";

const client = new Client()
  .setEndpoint("https://YOUR-APPWRITE-ENDPOINT/v1")
  .setProject("YOUR_PROJECT_ID");

export const databases = new Databases(client);
export const dbConfig = {
  databaseId: "YOUR_DATABASE_ID",
  collectionId: "assistant_feedback"
};
