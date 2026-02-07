#!/usr/bin/env node
// ai/scripts/package-render.mjs
// Generates print-ready assets and exports for offline use

import {
  readdir,
  readFile,
  writeFile,
  mkdir,
  stat,
  copyFile,
} from "fs/promises";
import { join, extname, basename } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "../..");

const CONFIG = {
  siteDir: join(ROOT, "_site"),
  outputDir: join(ROOT, "_site/downloads"),
  assetsDir: join(ROOT, "src/assets"),

  // What to package
  includeModules: true,
  includeGuides: true,
  includeQuickstarts: true,

  // Output formats
  formats: {
    printReady: true, // HTML optimized for printing
    markdown: false, // Export as Markdown (future)
    pdf: false, // Generate PDFs (requires headless browser)
  },
};

async function ensureDirectories() {
  await mkdir(CONFIG.outputDir, { recursive: true });
  console.log(`[packaging] ✓ Output directory ready: ${CONFIG.outputDir}`);
}

async function collectPrintableContent() {
  const content = [];
  const siteDir = CONFIG.siteDir;

  // Find all HTML pages that should be packaged
  const patterns = [
    "intro/index.html",
    "snapshotting/index.html",
    "event-envelope/index.html",
    "materialization/index.html",
    "exactly-once/index.html",
    "schema-evolution/index.html",
    "partitioning/index.html",
    "multi-tenancy/index.html",
    "ops-offsets/index.html",
    "observability/index.html",
    "use-cases/index.html",
    "strategy/index.html",
    "tooling/index.html",
    "quickstarts/index.html",
    "lab-kafka-debezium/index.html",
    "tests/index.html",
  ];

  for (const pattern of patterns) {
    const filePath = join(siteDir, pattern);
    try {
      await stat(filePath);
      content.push({
        path: pattern,
        fullPath: filePath,
        title: pattern.replace("/index.html", "").replace(/-/g, " "),
      });
    } catch {
      console.log(`[packaging] ⚠ Skipping missing: ${pattern}`);
    }
  }

  console.log(`[packaging] ✓ Found ${content.length} pages to package`);
  return content;
}

async function generatePrintBundle(content) {
  const bundlePath = join(CONFIG.outputDir, "cdc-complete-guide.html");

  let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CDC: The Complete Guide (Print Edition)</title>
  <style>
    @media print {
      body { font-family: Georgia, serif; font-size: 11pt; line-height: 1.6; }
      h1 { page-break-before: always; font-size: 24pt; margin-top: 0; }
      h2 { font-size: 18pt; margin-top: 1em; }
      h3 { font-size: 14pt; }
      pre { background: #f5f5f5; padding: 1em; border: 1px solid #ddd; font-size: 9pt; overflow-x: auto; }
      code { font-family: 'Courier New', monospace; background: #f5f5f5; padding: 0.2em 0.4em; }
      a { color: #0066cc; text-decoration: none; }
      a[href^="http"]:after { content: " (" attr(href) ")"; font-size: 0.8em; color: #666; }
      .page-break { page-break-after: always; }
      nav, .series-nav, footer { display: none; }
    }
    @media screen {
      body { max-width: 800px; margin: 2em auto; padding: 0 2em; font-family: sans-serif; }
      h1 { color: #2c5282; border-bottom: 2px solid #2c5282; padding-bottom: 0.5em; }
      pre { background: #f7fafc; padding: 1em; border-radius: 0.5em; overflow-x: auto; }
      code { background: #edf2f7; padding: 0.2em 0.4em; border-radius: 0.25em; font-family: 'Courier New', monospace; }
    }
  </style>
</head>
<body>
  <h1>CDC: The Complete Guide</h1>
  <p><strong>Generated:</strong> ${new Date().toISOString().split("T")[0]}</p>
  <p><strong>Source:</strong> <a href="https://letstalkcdc.github.io">letstalkcdc.github.io</a></p>
  
  <h2>Table of Contents</h2>
  <ul>
`;

  // Add TOC
  for (const item of content) {
    const title = item.title.split("/").pop() || item.title;
    const anchor = title.toLowerCase().replace(/\s+/g, "-");
    html += `    <li><a href="#${anchor}">${title}</a></li>\n`;
  }

  html += `  </ul>\n  <div class="page-break"></div>\n\n`;

  // Add content sections
  for (const item of content) {
    const pageHtml = await readFile(item.fullPath, "utf-8");
    const title = item.title.split("/").pop() || item.title;
    const anchor = title.toLowerCase().replace(/\s+/g, "-");

    // Extract main content (between main tags or body)
    const contentMatch =
      pageHtml.match(/<main[^>]*>([\s\S]*?)<\/main>/i) ||
      pageHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);

    if (contentMatch) {
      let sectionContent = contentMatch[1];

      // Remove navigation, footer, and script elements
      sectionContent = sectionContent
        .replace(/<nav[\s\S]*?<\/nav>/gi, "")
        .replace(/<footer[\s\S]*?<\/footer>/gi, "")
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/class="series-nav"[\s\S]*?(?=<section|<\/main|$)/gi, "");

      html += `  <section id="${anchor}">\n`;
      html += `    <h1>${
        title.charAt(0).toUpperCase() + title.slice(1)
      }</h1>\n`;
      html += sectionContent;
      html += `  </section>\n  <div class="page-break"></div>\n\n`;
    }
  }

  html += `</body>\n</html>`;

  await writeFile(bundlePath, html, "utf-8");
  const stats = await stat(bundlePath);
  const sizeKB = (stats.size / 1024).toFixed(2);

  console.log(
    `[packaging] ✓ Print bundle created: ${basename(bundlePath)} (${sizeKB} KB)`,
  );
  return bundlePath;
}

async function generateManifest(content, bundlePath) {
  const manifest = {
    generated: new Date().toISOString(),
    version: "1.0.0",
    title: "CDC: The Complete Guide",
    exports: {
      printBundle: {
        path: "/downloads/cdc-complete-guide.html",
        format: "HTML",
        pages: content.length,
        description: "Complete guide optimized for printing or saving as PDF",
      },
    },
    modules: content.map((c) => ({
      title: c.title,
      path: c.path,
    })),
  };

  const manifestPath = join(CONFIG.outputDir, "manifest.json");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");

  console.log(`[packaging] ✓ Manifest created: ${basename(manifestPath)}`);
}

async function main() {
  console.log("[packaging] 📦 Starting package render...\n");

  try {
    await ensureDirectories();
    const content = await collectPrintableContent();

    if (content.length === 0) {
      console.log("[packaging] ⚠ No content found. Run `npm run build` first.");
      process.exit(0);
    }

    const bundlePath = await generatePrintBundle(content);
    await generateManifest(content, bundlePath);

    console.log("\n[packaging] ✓ Package rendering complete!");
    console.log(
      `[packaging] 📄 Download at: /downloads/cdc-complete-guide.html`,
    );
    console.log(
      "[packaging] 💡 Tip: Open in browser and use Print > Save as PDF",
    );
  } catch (err) {
    console.error("[packaging] ✗ Fatal error:", err);
    process.exit(1);
  }
}

main();
