#!/usr/bin/env node

// Test script to verify Appwrite connection
// Run: node test-appwrite.cjs

require("dotenv").config();

const APPWRITE_ENDPOINT = process.env.APPWRITE_ENDPOINT;
const APPWRITE_PROJECT = process.env.APPWRITE_PROJECT;
const APPWRITE_DB_ID = process.env.APPWRITE_DB_ID;
const APPWRITE_API_KEY = process.env.APPWRITE_API_KEY;

console.log("\n🔍 Testing Appwrite Connection\n");
console.log("═══════════════════════════════════════\n");
console.log("Endpoint:", APPWRITE_ENDPOINT);
console.log("Project:", APPWRITE_PROJECT);
console.log("Database:", APPWRITE_DB_ID || "(not set)");
console.log("API Key:", APPWRITE_API_KEY ? "✓ Present" : "✗ Missing");
console.log("\n═══════════════════════════════════════\n");

if (!APPWRITE_ENDPOINT || !APPWRITE_PROJECT || !APPWRITE_API_KEY) {
  console.error("❌ Error: Missing required environment variables");
  process.exit(1);
}

const headers = {
  "X-Appwrite-Project": APPWRITE_PROJECT,
  "X-Appwrite-Key": APPWRITE_API_KEY,
  "Content-Type": "application/json",
};

async function main() {
  try {
    // Step 1: List databases
    console.log("📦 STEP 1: Listing databases...\n");

    const dbListUrl = `${APPWRITE_ENDPOINT}/databases`;
    const dbResponse = await fetch(dbListUrl, { method: "GET", headers });

    if (!dbResponse.ok) {
      const errorText = await dbResponse.text();
      console.error("❌ Error:", dbResponse.status, dbResponse.statusText);
      console.error("Details:", errorText);
      process.exit(1);
    }

    const dbData = await dbResponse.json();
    console.log(`Found ${dbData.total} database(s):\n`);

    if (!dbData.databases || dbData.databases.length === 0) {
      console.log("❌ No databases found. Create one in Appwrite Console.");
      process.exit(1);
    }

    dbData.databases.forEach((db) => {
      const marker = db.$id === APPWRITE_DB_ID ? "→ " : "  ";
      console.log(`${marker}${db.name}`);
      console.log(`   ID: ${db.$id}`);
      console.log("");
    });

    // Find correct database ID
    let correctDbId = APPWRITE_DB_ID;
    let needsUpdate = false;

    const mainDb = dbData.databases.find(
      (db) => db.name.toLowerCase() === "main"
    );

    if (
      !APPWRITE_DB_ID ||
      !dbData.databases.find((db) => db.$id === APPWRITE_DB_ID)
    ) {
      correctDbId = mainDb ? mainDb.$id : dbData.databases[0].$id;
      needsUpdate = true;
      console.log(`💡 Using database ID: ${correctDbId}\n`);
    }

    // Step 2: List collections
    console.log("═══════════════════════════════════════\n");
    console.log(`📚 STEP 2: Checking collections...\n`);

    const collectionsUrl = `${APPWRITE_ENDPOINT}/databases/${correctDbId}/collections`;
    const collResponse = await fetch(collectionsUrl, {
      method: "GET",
      headers,
    });

    if (!collResponse.ok) {
      const errorText = await collResponse.text();
      console.error("❌ Error:", collResponse.status, collResponse.statusText);
      console.error("Details:", errorText);
      process.exit(1);
    }

    const collData = await collResponse.json();
    console.log(`Found ${collData.total} collection(s):\n`);

    if (collData.collections && collData.collections.length > 0) {
      collData.collections.forEach((coll) => {
        console.log(`  📄 ${coll.name}`);
        console.log(`     ID: ${coll.$id}`);
        console.log(`     Attributes: ${coll.attributes?.length || 0}`);
        console.log("");
      });
    } else {
      console.log("❌ No collections found.");
      console.log("\nImport collections:");
      console.log("1. Appwrite Console → Databases → Import Collections");
      console.log("2. Upload: appwrite.collections.json");
      process.exit(1);
    }

    // Step 3: Check required collections
    console.log("═══════════════════════════════════════\n");
    console.log("✅ STEP 3: Verifying required collections:\n");

    const collIds = collData.collections?.map((c) => c.$id) || [];

    const required = [
      { id: "progress", env: "COL_PROGRESS_ID" },
      { id: "events", env: "COL_EVENTS_ID" },
      { id: "assistant_feedback", env: "COL_ASSISTANT_ID" },
    ];

    let allPresent = true;
    const envUpdates = [];

    required.forEach(({ id, env }) => {
      const exists = collIds.includes(id);
      const status = exists ? "✅" : "❌";
      console.log(`  ${status} ${id} (${env})`);

      if (exists) {
        envUpdates.push(`${env}=${id}`);
      } else {
        allPresent = false;
      }
    });

    console.log("\n═══════════════════════════════════════\n");

    if (!allPresent) {
      console.log("⚠️  MISSING COLLECTIONS!\n");
      console.log("Import appwrite.collections.json in Appwrite Console");
    } else {
      console.log("✅ SUCCESS! All collections present!\n");

      if (needsUpdate) {
        console.log("📝 Update your .env file:\n");
        console.log(`APPWRITE_DB_ID=${correctDbId}`);
        envUpdates.forEach((line) => console.log(line));
        console.log("");
      }

      console.log("🚀 Ready to test! Run: npm run dev\n");
    }
  } catch (error) {
    console.error("\n❌ Connection error:", error.message);
    process.exit(1);
  }
}

main();
