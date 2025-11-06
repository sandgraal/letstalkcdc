#!/usr/bin/env node
// ai/scripts/analytics.mjs
// Aggregates build stats and site metrics into ai/logs/site-analytics.jsonl

import { readdir, stat, readFile, writeFile, mkdir } from "fs/promises";
import { join, extname } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "../..");

async function collectMetrics() {
  const metrics = {
    timestamp: new Date().toISOString(),
    build: {
      siteDir: "_site",
      pages: 0,
      assets: { css: 0, js: 0, images: 0, other: 0 },
      totalSize: 0,
      avgPageSize: 0,
    },
    content: {
      modules: 0,
      contentPages: 0,
      dataFiles: 0,
    },
    quality: {
      hasSearchIndex: false,
      hasSitemap: false,
      hasRobotsTxt: false,
    },
  };

  // Analyze built site
  const siteDir = join(ROOT, "_site");
  try {
    await analyzeSite(siteDir, metrics);
  } catch (err) {
    console.error(
      "[analytics] Warning: Could not analyze _site directory:",
      err.message
    );
  }

  // Analyze source content
  const srcDir = join(ROOT, "src");
  try {
    await analyzeSource(srcDir, metrics);
  } catch (err) {
    console.error(
      "[analytics] Warning: Could not analyze src directory:",
      err.message
    );
  }

  return metrics;
}

async function analyzeSite(dir, metrics, subPath = "") {
  const entries = await readdir(join(dir, subPath));

  for (const entry of entries) {
    const fullPath = join(dir, subPath, entry);
    const stats = await stat(fullPath);

    if (stats.isDirectory()) {
      await analyzeSite(dir, metrics, join(subPath, entry));
    } else {
      const ext = extname(entry).toLowerCase();
      metrics.build.totalSize += stats.size;

      if (ext === ".html") {
        metrics.build.pages++;
      } else if (ext === ".css") {
        metrics.build.assets.css++;
      } else if (ext === ".js") {
        metrics.build.assets.js++;
      } else if (
        [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"].includes(ext)
      ) {
        metrics.build.assets.images++;
      } else {
        metrics.build.assets.other++;
      }

      // Check for key files
      if (entry === "search-index.json") metrics.quality.hasSearchIndex = true;
      if (entry === "sitemap.xml") metrics.quality.hasSitemap = true;
      if (entry === "robots.txt") metrics.quality.hasRobotsTxt = true;
    }
  }

  if (metrics.build.pages > 0) {
    metrics.build.avgPageSize = Math.round(
      metrics.build.totalSize / metrics.build.pages
    );
  }
}

async function analyzeSource(dir, metrics) {
  // Count modules (directories with index.njk)
  const entries = await readdir(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stats = await stat(fullPath);

    if (
      stats.isDirectory() &&
      !entry.startsWith("_") &&
      !entry.startsWith(".")
    ) {
      // Check if it's a content module
      try {
        await stat(join(fullPath, "index.njk"));
        metrics.content.modules++;
      } catch {
        // Not a module directory
      }
    }
  }

  // Count data files
  const dataDir = join(dir, "_data");
  try {
    const dataFiles = await readdir(dataDir);
    metrics.content.dataFiles = dataFiles.filter(
      (f) => f.endsWith(".cjs") || f.endsWith(".js") || f.endsWith(".json")
    ).length;
  } catch {
    // No _data directory
  }
}

async function saveMetrics(metrics) {
  const logsDir = join(ROOT, "ai/logs");
  await mkdir(logsDir, { recursive: true });

  const logFile = join(logsDir, "site-analytics.jsonl");
  const logLine = JSON.stringify(metrics) + "\n";

  try {
    await writeFile(logFile, logLine, { flag: "a" });
    console.log("[analytics] ✓ Metrics saved to ai/logs/site-analytics.jsonl");
  } catch (err) {
    console.error("[analytics] ✗ Failed to save metrics:", err.message);
    process.exit(1);
  }
}

function printSummary(metrics) {
  console.log("\n📊 Build Analytics Summary");
  console.log("═══════════════════════════════════════");
  console.log(`📄 Pages: ${metrics.build.pages}`);
  console.log(
    `📦 Total Size: ${(metrics.build.totalSize / 1024 / 1024).toFixed(2)} MB`
  );
  console.log(
    `📏 Avg Page Size: ${(metrics.build.avgPageSize / 1024).toFixed(2)} KB`
  );
  console.log(`\n🎨 Assets:`);
  console.log(`   CSS: ${metrics.build.assets.css}`);
  console.log(`   JS: ${metrics.build.assets.js}`);
  console.log(`   Images: ${metrics.build.assets.images}`);
  console.log(`   Other: ${metrics.build.assets.other}`);
  console.log(`\n📚 Content:`);
  console.log(`   Modules: ${metrics.content.modules}`);
  console.log(`   Data Files: ${metrics.content.dataFiles}`);
  console.log(`\n✅ Quality Checks:`);
  console.log(`   Search Index: ${metrics.quality.hasSearchIndex ? "✓" : "✗"}`);
  console.log(`   Sitemap: ${metrics.quality.hasSitemap ? "✓" : "✗"}`);
  console.log(`   robots.txt: ${metrics.quality.hasRobotsTxt ? "✓" : "✗"}`);
  console.log("═══════════════════════════════════════\n");
}

async function main() {
  console.log("[analytics] Collecting build metrics...");

  const metrics = await collectMetrics();
  printSummary(metrics);
  await saveMetrics(metrics);

  console.log("[analytics] ✓ Analytics complete");
}

main().catch((err) => {
  console.error("[analytics] ✗ Fatal error:", err);
  process.exit(1);
});
