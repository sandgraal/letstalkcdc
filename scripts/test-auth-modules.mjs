#!/usr/bin/env node
/**
 * Simple test to verify authentication modules load correctly
 */

import fs from "fs";
import path from "path";

const SITE_DIR = "_site";
const REQUIRED_FILES = [
  "assets/css/auth.css",
  "assets/js/auth.js",
  "assets/js/auth-ui.js",
  "assets/js/cloud-progress.js",
];

const REQUIRED_IMPORTS = ["auth-ui.js", "cloud-progress.js"];

console.log("Testing authentication modules...\n");

// Check if required files exist in build output
let allFilesExist = true;
for (const file of REQUIRED_FILES) {
  const filePath = path.join(SITE_DIR, file);
  const exists = fs.existsSync(filePath);

  if (exists) {
    const stats = fs.statSync(filePath);
    console.log(`✓ ${file} (${stats.size} bytes)`);
  } else {
    console.error(`✗ ${file} - FILE MISSING`);
    allFilesExist = false;
  }
}

if (!allFilesExist) {
  console.error("\n❌ Some required files are missing from build output");
  process.exit(1);
}

// Check if HTML includes auth references
const indexPath = path.join(SITE_DIR, "index.html");
if (!fs.existsSync(indexPath)) {
  console.error("\n❌ index.html not found");
  process.exit(1);
}

const indexContent = fs.readFileSync(indexPath, "utf8");

console.log("\nChecking HTML references:");

// Check CSS link
if (indexContent.includes("assets/css/auth.css")) {
  console.log("✓ auth.css referenced in HTML");
} else {
  console.error("✗ auth.css NOT referenced in HTML");
  process.exit(1);
}

// Check script imports
let allImportsPresent = true;
for (const importName of REQUIRED_IMPORTS) {
  if (indexContent.includes(importName)) {
    console.log(`✓ ${importName} imported in HTML`);
  } else {
    console.error(`✗ ${importName} NOT imported in HTML`);
    allImportsPresent = false;
  }
}

if (!allImportsPresent) {
  console.error("\n❌ Some required script imports are missing from HTML");
  process.exit(1);
}

// Basic syntax check for JavaScript modules
console.log("\nValidating JavaScript syntax:");
const jsFiles = [
  "assets/js/auth.js",
  "assets/js/auth-ui.js",
  "assets/js/cloud-progress.js",
];

for (const jsFile of jsFiles) {
  const jsPath = path.join(SITE_DIR, jsFile);
  const content = fs.readFileSync(jsPath, "utf8");

  // Check for basic export statements
  if (content.includes("export")) {
    console.log(`✓ ${jsFile} has exports`);
  } else {
    console.error(`✗ ${jsFile} missing exports`);
    process.exit(1);
  }

  // Check for import statements where expected
  if (jsFile.includes("auth-ui") || jsFile.includes("cloud-progress")) {
    if (content.includes("import")) {
      console.log(`✓ ${jsFile} has imports`);
    } else {
      console.error(`✗ ${jsFile} missing expected imports`);
      process.exit(1);
    }
  }
}

console.log("\n✅ All authentication module tests passed!");
