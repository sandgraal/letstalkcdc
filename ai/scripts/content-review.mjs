#!/usr/bin/env node
// ai/scripts/content-review.mjs
// Quarterly content review agent for CDC tool versions and updates
// Checks release notes URLs and generates review checklist

import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "../..");

const REVIEW_CHECKLIST_TEMPLATE = `# Quarterly CDC Content Review Checklist
Generated: {timestamp}

## Tool Version Checks
Review the following tools for new releases and breaking changes:

{toolChecks}

## Content Update Checklist
- [ ] Review Debezium connector examples in quickstart guides
- [ ] Check Kafka configuration examples for deprecated properties
- [ ] Update cloud CDC service capabilities (AWS DMS, Fivetran, etc.)
- [ ] Review any new CDC tools or services to add
- [ ] Verify external links are still valid
- [ ] Check for new Debezium features (e.g., snapshot modes, incremental snapshot)
- [ ] Update performance benchmarks if available
- [ ] Review and update troubleshooting guides

## Labs and Hands-on Content
- [ ] Test quickstart Docker Compose files with latest versions
- [ ] Verify lab exercises still work with current tool versions
- [ ] Update any deprecated configuration flags

## Documentation Links
- [ ] Verify all external documentation links are current
- [ ] Check for moved or archived documentation pages
- [ ] Update references to vendor documentation

## Notes
{notes}
`;

async function loadToolVersions() {
  const toolVersionsPath = join(ROOT, "src/_data/toolVersions.cjs");
  try {
    // Dynamic import for CJS module
    const module = await import(`file://${toolVersionsPath}`);
    return module.default;
  } catch (err) {
    console.error("[content-review] Error loading toolVersions.cjs:", err.message);
    return null;
  }
}

function generateToolChecks(tools) {
  return Object.entries(tools)
    .map(([key, tool]) => {
      const versionDisplay = tool.status === "saas" 
        ? "(SaaS - rolling updates)" 
        : `v${tool.version} (${tool.releaseDate})`;
      
      return `### ${key}
- Current tracked version: ${versionDisplay}
- Release notes: ${tool.releaseNotesUrl}
- [ ] Check for new releases
- [ ] Review breaking changes
- [ ] Update examples if needed
`;
    })
    .join("\n");
}

async function generateReviewChecklist(toolVersions) {
  const timestamp = new Date().toISOString();
  const toolChecks = generateToolChecks(toolVersions.tools);
  const lastReview = toolVersions.lastUpdated;
  
  const notes = `Last review: ${lastReview}
Current review: ${timestamp.split("T")[0]}

Review Focus Areas:
- Major version updates that may affect examples
- Deprecated features that need documentation updates
- New features worth highlighting in content
- Security advisories or critical fixes
`;

  const checklist = REVIEW_CHECKLIST_TEMPLATE
    .replace("{timestamp}", timestamp)
    .replace("{toolChecks}", toolChecks)
    .replace("{notes}", notes);

  return checklist;
}

async function saveReviewChecklist(checklist) {
  const reviewsDir = join(ROOT, "ai/reviews");
  await mkdir(reviewsDir, { recursive: true });

  const date = new Date().toISOString().split("T")[0];
  const filename = `content-review-${date}.md`;
  const filepath = join(reviewsDir, filename);

  await writeFile(filepath, checklist, "utf-8");
  console.log(`[content-review] ✓ Review checklist saved to ai/reviews/${filename}`);
  
  return filepath;
}

async function logReview() {
  const logsDir = join(ROOT, "ai/logs");
  await mkdir(logsDir, { recursive: true });

  const logEntry = {
    timestamp: new Date().toISOString(),
    agent: "site-content-review",
    action: "quarterly-review-generated",
    status: "completed"
  };

  const logFile = join(logsDir, "site-content-review.jsonl");
  const logLine = JSON.stringify(logEntry) + "\n";

  await writeFile(logFile, logLine, { flag: "a" });
  console.log("[content-review] ✓ Review logged to ai/logs/site-content-review.jsonl");
}

async function main() {
  console.log("\n🔍 CDC Content Review Agent");
  console.log("═══════════════════════════════════════");
  
  const toolVersions = await loadToolVersions();
  if (!toolVersions) {
    console.error("[content-review] ✗ Could not load tool versions");
    process.exit(1);
  }

  console.log(`\n📊 Tracking ${Object.keys(toolVersions.tools).length} CDC tools`);
  console.log(`📅 Last update: ${toolVersions.lastUpdated}`);
  
  const checklist = await generateReviewChecklist(toolVersions);
  await saveReviewChecklist(checklist);
  await logReview();

  console.log("\n✅ Quarterly content review checklist generated");
  console.log("📋 Review the checklist and update toolVersions.cjs as needed");
  console.log("═══════════════════════════════════════\n");
}

main().catch((err) => {
  console.error("[content-review] ✗ Fatal error:", err);
  process.exit(1);
});
