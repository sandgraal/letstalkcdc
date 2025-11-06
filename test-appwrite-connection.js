#!/usr/bin/env node

/**
 * Lightweight Appwrite connectivity check for the assistant feedback collection.
 * Run: node test-appwrite-connection.js
 */

require('dotenv').config();

const APPWRITE_ENDPOINT = process.env.APPWRITE_ENDPOINT;
const APPWRITE_PROJECT = process.env.APPWRITE_PROJECT;
const APPWRITE_DB_ID = process.env.APPWRITE_DB_ID;
const APPWRITE_API_KEY = process.env.APPWRITE_API_KEY;
const ASSISTANT_COLLECTION = process.env.COL_ASSISTANT_ID || 'assistant_feedback';

console.log('\n🔍 Testing Appwrite connection for assistant feedback\n');
console.log('═══════════════════════════════════════\n');
console.log('Endpoint:', APPWRITE_ENDPOINT || '(not set)');
console.log('Project:', APPWRITE_PROJECT || '(not set)');
console.log('Database:', APPWRITE_DB_ID || '(not set)');
console.log('Collection (expected):', ASSISTANT_COLLECTION);
console.log('API Key:', APPWRITE_API_KEY ? '✓ Present' : '✗ Missing');
console.log('\n═══════════════════════════════════════\n');

if (!APPWRITE_ENDPOINT || !APPWRITE_PROJECT || !APPWRITE_DB_ID || !APPWRITE_API_KEY) {
  console.error('❌ Missing required environment variables.');
  console.error('Set APPWRITE_ENDPOINT, APPWRITE_PROJECT, APPWRITE_DB_ID, COL_ASSISTANT_ID, and APPWRITE_API_KEY.');
  process.exit(1);
}

const headers = {
  'X-Appwrite-Project': APPWRITE_PROJECT,
  'X-Appwrite-Key': APPWRITE_API_KEY,
  'Content-Type': 'application/json',
};

async function listDatabases() {
  const response = await fetch(`${APPWRITE_ENDPOINT}/databases`, { headers });
  if (!response.ok) {
    throw new Error(`Unable to list databases (${response.status} ${response.statusText})`);
  }
  return response.json();
}

async function listCollections(databaseId) {
  const response = await fetch(`${APPWRITE_ENDPOINT}/databases/${databaseId}/collections`, { headers });
  if (!response.ok) {
    throw new Error(`Unable to list collections (${response.status} ${response.statusText})`);
  }
  return response.json();
}

async function main() {
  try {
    console.log('📦 Step 1: Listing databases...\n');
    const databases = await listDatabases();

    if (!databases.databases?.length) {
      console.error('❌ No databases found. Create one in Appwrite Console.');
      process.exit(1);
    }

    databases.databases.forEach((db) => {
      const marker = db.$id === APPWRITE_DB_ID ? '→' : '•';
      console.log(`${marker} ${db.name} (ID: ${db.$id})`);
    });

    if (!databases.databases.find((db) => db.$id === APPWRITE_DB_ID)) {
      console.warn('\n⚠️ Provided APPWRITE_DB_ID was not found. Using first database.');
    }

    console.log('\n📚 Step 2: Checking collections...\n');
    const collections = await listCollections(APPWRITE_DB_ID);

    if (!collections.collections?.length) {
      console.error('❌ No collections found. Import appwrite.collections.json.');
      process.exit(1);
    }

    const ids = collections.collections.map((coll) => coll.$id);
    const hasAssistant = ids.includes(ASSISTANT_COLLECTION);

    collections.collections.forEach((coll) => {
      const marker = coll.$id === ASSISTANT_COLLECTION ? '→' : '•';
      console.log(`${marker} ${coll.name} (ID: ${coll.$id})`);
    });

    console.log('\n═══════════════════════════════════════\n');

    if (!hasAssistant) {
      console.log('⚠️  assistant_feedback collection missing.');
      console.log('1. Appwrite Console → Databases →', APPWRITE_DB_ID);
      console.log('2. Click "Import Collections"');
      console.log('3. Upload appwrite.collections.json from this repo');
      process.exit(1);
    }

    console.log('✅ assistant_feedback collection available!');
    console.log('\nNext steps:');
    console.log('1. npm run dev');
    console.log('2. Visit http://localhost:8080/intro/');
    console.log('3. Submit assistant feedback and verify the document appears.');
  } catch (error) {
    console.error('\n❌ Connection error:', error.message);
    process.exit(1);
  }
}

main();
