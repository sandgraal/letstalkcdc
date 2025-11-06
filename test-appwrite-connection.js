#!/usr/bin/env node#!/usr/bin/env node



// Test script to verify Appwrite connection and list collections// Test script to verify Appwrite connection and list collections

// Run: node test-appwrite-connection.js// Run: node test-appwrite-connection.js



import 'dotenv/config';import "dotenv/config";



const APPWRITE_ENDPOINT = process.env.APPWRITE_ENDPOINT;const APPWRITE_ENDPOINT = process.env.APPWRITE_ENDPOINT;

const APPWRITE_PROJECT = process.env.APPWRITE_PROJECT;const APPWRITE_PROJECT = process.env.APPWRITE_PROJECT;

const APPWRITE_DB_ID = process.env.APPWRITE_DB_ID;const APPWRITE_DB_ID = process.env.APPWRITE_DB_ID;

const APPWRITE_API_KEY = process.env.APPWRITE_API_KEY;const APPWRITE_API_KEY = process.env.APPWRITE_API_KEY;



console.log('🔍 Testing Appwrite Connection\n');console.log("Testing Appwrite connection...\n");

console.log('═══════════════════════════════════════\n');console.log("Endpoint:", APPWRITE_ENDPOINT);

console.log('Endpoint:', APPWRITE_ENDPOINT);console.log("Project:", APPWRITE_PROJECT);

console.log('Project:', APPWRITE_PROJECT);console.log("Database:", APPWRITE_DB_ID);

console.log('Database:', APPWRITE_DB_ID || '(not set)');console.log("API Key:", APPWRITE_API_KEY ? "✓ Set" : "✗ Missing");

console.log('API Key:', APPWRITE_API_KEY ? '✓ Present' : '✗ Missing');console.log("");

console.log('\n═══════════════════════════════════════\n');

if (

if (!APPWRITE_ENDPOINT || !APPWRITE_PROJECT || !APPWRITE_API_KEY) {  !APPWRITE_ENDPOINT ||

  console.error('❌ Error: Missing required environment variables');  !APPWRITE_PROJECT ||

  console.error('Make sure .env file exists with APPWRITE_ENDPOINT, APPWRITE_PROJECT, and APPWRITE_API_KEY');  !APPWRITE_DB_ID ||

  process.exit(1);  !APPWRITE_API_KEY

}) {

  console.error("Error: Missing required environment variables");

const headers = {  console.error("Make sure .env file exists with all required variables");

  'X-Appwrite-Project': APPWRITE_PROJECT,  process.exit(1);

  'X-Appwrite-Key': APPWRITE_API_KEY,}

  'Content-Type': 'application/json',

};// Test the connection by listing collections

const url = `${APPWRITE_ENDPOINT}/databases/${APPWRITE_DB_ID}/collections`;

async function main() {

  try {console.log("Fetching collections from:", url);

    // Step 1: List all databasesconsole.log("");

    console.log('📦 STEP 1: Listing all databases...\n');

    try {

    const dbListUrl = `${APPWRITE_ENDPOINT}/databases`;  const response = await fetch(url, {

    const dbResponse = await fetch(dbListUrl, {    method: "GET",

      method: 'GET',    headers: {

      headers,      "X-Appwrite-Project": APPWRITE_PROJECT,

    });      "X-Appwrite-Key": APPWRITE_API_KEY,

      "Content-Type": "application/json",

    if (!dbResponse.ok) {    },

      const errorText = await dbResponse.text();  });

      console.error('❌ Error listing databases:', dbResponse.status, dbResponse.statusText);

      console.error('Details:', errorText);  if (!response.ok) {

      process.exit(1);    const errorText = await response.text();

    }    console.error("Error response:", response.status, response.statusText);

    console.error("Details:", errorText);

    const dbData = await dbResponse.json();    process.exit(1);

      }

    console.log(`Found ${dbData.total} database(s):\n`);

  const data = await response.json();

    if (!dbData.databases || dbData.databases.length === 0) {

      console.log('❌ No databases found. You need to create a database first.');  console.log("✓ Successfully connected to Appwrite!\n");

      console.log('\nTo fix this:');  console.log(`Found ${data.total} collection(s):\n`);

      console.log('1. Go to Appwrite Console → Databases');

      console.log('2. Click "Create Database"');  if (data.collections && data.collections.length > 0) {

      console.log('3. Name it "main"');    data.collections.forEach((collection) => {

      console.log('4. Note the Database ID');      console.log(`  • ${collection.name}`);

      process.exit(1);      console.log(`    ID: ${collection.$id}`);

    }      console.log(`    Attributes: ${collection.attributes?.length || 0}`);

      console.log("");

    dbData.databases.forEach((db) => {    });

      const isCurrent = db.$id === APPWRITE_DB_ID;  } else {

      const marker = isCurrent ? '→ ' : '  ';    console.log("  No collections found in this database.");

      console.log(`${marker}${db.name}`);    console.log("  You need to import appwrite.collections.json");

      console.log(`   ID: ${db.$id}`);  }

      console.log(`   Created: ${new Date(db.$createdAt).toLocaleDateString()}`);

      console.log('');  // Check for expected collections

    });  console.log("Checking for required collections:");

  const collectionIds = data.collections?.map((c) => c.$id) || [];

    // Find the correct database ID

    let correctDbId = APPWRITE_DB_ID;  const required = [

    let needsUpdate = false;    { id: "progress", env: "COL_PROGRESS_ID" },

        { id: "events", env: "COL_EVENTS_ID" },

    const mainDb = dbData.databases.find(db =>     { id: "assistant_feedback", env: "COL_ASSISTANT_ID" },

      db.name.toLowerCase() === 'main' ||   ];

      db.name.toLowerCase() === 'letstalkcdc' ||

      db.name.toLowerCase() === 'cdc'  required.forEach(({ id, env }) => {

    );    const exists = collectionIds.includes(id);

        const status = exists ? "✓" : "✗";

    if (!APPWRITE_DB_ID) {    console.log(`  ${status} ${id} (${env})`);

      if (mainDb) {  });

        correctDbId = mainDb.$id;

        needsUpdate = true;  console.log("");

        console.log(`💡 Found database "${mainDb.name}" with ID: ${correctDbId}`);

      } else {  if (

        correctDbId = dbData.databases[0].$id;    !collectionIds.includes("progress") ||

        needsUpdate = true;    !collectionIds.includes("events")

        console.log(`💡 Using first database: ${dbData.databases[0].name} (${correctDbId})`);  ) {

      }    console.log("⚠️  Missing required collections!");

    } else if (!dbData.databases.find(db => db.$id === APPWRITE_DB_ID)) {    console.log("");

      console.log(`⚠️  Database ID in .env not found: ${APPWRITE_DB_ID}`);    console.log("To fix this:");

      if (mainDb) {    console.log("1. Go to Appwrite Console → Databases → " + APPWRITE_DB_ID);

        correctDbId = mainDb.$id;    console.log('2. Click "Import Collections"');

        needsUpdate = true;    console.log("3. Upload appwrite.collections.json from this repo");

        console.log(`💡 Found "main" database with ID: ${correctDbId}`);    console.log("");

      } else {  } else {

        correctDbId = dbData.databases[0].$id;    console.log("✓ All required collections are present!");

        needsUpdate = true;    console.log("");

        console.log(`💡 Using first available: ${dbData.databases[0].name} (${correctDbId})`);    console.log("Your .env file is correctly configured.");

      }    console.log("Run: npm run dev");

    }    console.log("Then visit: http://localhost:8080/intro/");

  }

    if (needsUpdate) {} catch (error) {

      console.log('\n⚠️  Update your .env file with:');  console.error("Connection error:", error.message);

      console.log(`   APPWRITE_DB_ID=${correctDbId}\n`);  console.error("");

    }  console.error("Please check:");

  console.error("1. Your internet connection");

    // Step 2: List collections in the database  console.error("2. That the Appwrite endpoint is correct");

    console.log('═══════════════════════════════════════\n');  console.error("3. That your API key has database permissions");

    console.log(`📚 STEP 2: Checking collections in database: ${correctDbId}\n`);  process.exit(1);

}

    const collectionsUrl = `${APPWRITE_ENDPOINT}/databases/${correctDbId}/collections`;
    const collResponse = await fetch(collectionsUrl, {
      method: 'GET',
      headers,
    });

    if (!collResponse.ok) {
      const errorText = await collResponse.text();
      console.error('❌ Error listing collections:', collResponse.status, collResponse.statusText);
      console.error('Details:', errorText);
      process.exit(1);
    }

    const collData = await collResponse.json();
    
    console.log(`Found ${collData.total} collection(s):\n`);

    if (collData.collections && collData.collections.length > 0) {
      collData.collections.forEach((collection) => {
        console.log(`  📄 ${collection.name}`);
        console.log(`     ID: ${collection.$id}`);
        console.log(`     Attributes: ${collection.attributes?.length || 0}`);
        console.log(`     Documents: ${collection.documentSecurity ? 'Document-level' : 'Collection-level'} security`);
        console.log('');
      });
    } else {
      console.log('❌ No collections found in this database.');
      console.log('\nYou need to import collections:');
      console.log('1. Go to Appwrite Console → Databases → ' + correctDbId.slice(0, 20) + '...');
      console.log('2. Click "Import Collections"');
      console.log('3. Upload: appwrite.collections.json');
      process.exit(1);
    }

    // Step 3: Check for required collections
    console.log('═══════════════════════════════════════\n');
    console.log('✅ STEP 3: Verifying required collections:\n');
    
    const collectionIds = collData.collections?.map(c => c.$id) || [];
    const collectionNames = collData.collections?.map(c => ({ id: c.$id, name: c.name })) || [];
    
    const required = [
      { id: 'progress', env: 'COL_PROGRESS_ID', description: 'User progress tracking' },
      { id: 'events', env: 'COL_EVENTS_ID', description: 'Analytics events' },
      { id: 'assistant_feedback', env: 'COL_ASSISTANT_ID', description: 'Assistant feedback' },
    ];

    const envUpdates = [];
    let allPresent = true;

    required.forEach(({ id, env, description }) => {
      const exists = collectionIds.includes(id);
      const status = exists ? '✅' : '❌';
      console.log(`  ${status} ${id}`);
      console.log(`     ${description}`);
      console.log(`     Environment variable: ${env}`);
      
      if (exists) {
        envUpdates.push(`${env}=${id}`);
      } else {
        allPresent = false;
      }
      console.log('');
    });

    // Show any extra collections
    const extraCollections = collectionNames.filter(c => 
      !required.some(r => r.id === c.id)
    );
    
    if (extraCollections.length > 0) {
      console.log('📋 Other collections found:');
      extraCollections.forEach(c => {
        console.log(`     ${c.name} (ID: ${c.id})`);
      });
      console.log('');
    }

    console.log('═══════════════════════════════════════\n');

    // Final summary
    if (!allPresent) {
      console.log('⚠️  MISSING COLLECTIONS!\n');
      console.log('To fix this:');
      console.log('1. Go to: Appwrite Console → Databases → Your Database');
      console.log('2. Click "Import Collections"');
      console.log('3. Upload: appwrite.collections.json (from this repo)');
      console.log('4. Verify all three collections are created');
      console.log('');
    } else {
      console.log('✅ SUCCESS! All required collections are present!\n');
      
      if (needsUpdate || envUpdates.length > 0) {
        console.log('📝 Update your .env file with these values:\n');
        if (needsUpdate) {
          console.log(`APPWRITE_DB_ID=${correctDbId}`);
        }
        envUpdates.forEach(line => console.log(line));
        console.log('');
      }
      
      console.log('🚀 You\'re all set! Next steps:\n');
      console.log('1. Make sure your .env file has all the correct IDs');
      console.log('2. Run: npm run dev');
      console.log('3. Visit: http://localhost:8080/intro/');
      console.log('4. Test the "Sign in with GitHub" button');
      console.log('');
    }

  } catch (error) {
    console.error('\n❌ Connection error:', error.message);
    console.error('\nPlease check:');
    console.error('1. Your internet connection');
    console.error('2. That the Appwrite endpoint is correct');
    console.error('3. That your API key has the correct permissions');
    process.exit(1);
  }
}

main();
