#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { extname, join, relative, resolve } from "node:path";

const root = resolve(".");
const outputDirName = process.env.BUILD_OUTPUT_DIR ?? "_site";
const outputDir = join(root, outputDirName);
const sourceDir = join(root, "src");

const read = (relativePath) =>
  readFileSync(join(outputDir, relativePath), "utf8");

const ensureOutputDir = () => {
  if (existsSync(outputDir)) {
    return;
  }

  console.log(
    `${outputDirName} directory missing; running "npm run build" to generate site…`,
  );
  const { status } = spawnSync("npm", ["run", "build"], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (status !== 0) {
    console.error("Unable to build the site; aborting smoke test.");
    process.exit(status ?? 1);
  }

  if (!existsSync(outputDir)) {
    console.error(
      `Build completed but ${outputDirName} directory is still missing; aborting smoke test.`,
    );
    process.exit(1);
  }
};

const failures = [];

ensureOutputDir();

const walkHtml = (() => {
  const walk = (dir) => {
    const acc = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        acc.push(...walk(join(dir, entry.name)));
      } else if (entry.name.endsWith(".html")) {
        acc.push(join(dir, entry.name));
      }
    }
    return acc;
  };
  return walk(outputDir);
})();

try {
  const intro = read("intro/index.html");
  if (!intro.includes('id="methodsChart"')) {
    failures.push(
      "Intro page is missing the radar chart canvas (#methodsChart).",
    );
  }
  if (!intro.includes("/assets/js/pages/intro.js")) {
    failures.push("Intro page is not loading the intro module script.");
  }
} catch (error) {
  failures.push(`Failed to read intro/index.html: ${error.message}`);
}

try {
  const tenancy = read("multi-tenancy/index.html");
  if (!tenancy.includes('id="costChart"')) {
    failures.push(
      "Multi-tenancy page is missing the cost chart canvas (#costChart).",
    );
  }
  if (!tenancy.includes("/assets/js/pages/multi-tenancy.js")) {
    failures.push(
      "Multi-tenancy page is not loading the multi-tenancy module script.",
    );
  }
} catch (error) {
  failures.push(`Failed to read multi-tenancy/index.html: ${error.message}`);
}

const offendingFonts = walkHtml.filter((file) => {
  const html = readFileSync(file, "utf8");
  return html.includes("fonts.googleapis");
});
if (offendingFonts.length > 0) {
  failures.push(
    `Built HTML still references fonts.googleapis.com (${offendingFonts.length} file(s)).`,
  );
}

// Verify social preview image exists
const socialImagePath = join(outputDir, "images", "cdc-cover.jpg");
if (!existsSync(socialImagePath)) {
  failures.push(
    "Social preview image (images/cdc-cover.jpg) is missing from the build output.",
  );
}

// Verify homepage has correct social preview meta tags
try {
  const homepage = read("index.html");
  if (
    !homepage.includes("og:image") ||
    !homepage.includes("/images/cdc-cover.jpg")
  ) {
    failures.push("Homepage is missing correct Open Graph image meta tag.");
  }
  if (
    !homepage.includes("twitter:image") ||
    !homepage.includes("/images/cdc-cover.jpg")
  ) {
    failures.push("Homepage is missing correct Twitter card image meta tag.");
  }
  if (!homepage.includes('twitter:card" content="summary_large_image')) {
    failures.push(
      "Homepage is missing Twitter card type (summary_large_image).",
    );
  }
  if (!homepage.includes('id="askBtn"')) {
    failures.push(
      "Homepage is missing the assistant trigger button (#askBtn).",
    );
  }
  if (!homepage.includes("/js/assistant.js")) {
    failures.push("Homepage is not loading the assistant module script.");
  }
} catch (error) {
  failures.push(`Failed to read index.html: ${error.message}`);
}

// Verify assistant knowledge base output exists and is well-formed
const assistantDataPath = join(outputDir, "data", "assistant.json");
if (!existsSync(assistantDataPath)) {
  failures.push(
    "Assistant knowledge base JSON (data/assistant.json) is missing from the build output.",
  );
} else {
  try {
    const assistantData = JSON.parse(readFileSync(assistantDataPath, "utf8"));
    if (
      !assistantData ||
      !Array.isArray(assistantData.intents) ||
      assistantData.intents.length === 0
    ) {
      failures.push(
        "Assistant knowledge base JSON does not include any intents.",
      );
    }
  } catch (error) {
    failures.push(
      `Assistant knowledge base JSON is not valid: ${error.message}`,
    );
  }
}

// Verify all modules defined in series.cjs have corresponding pages
const expectedModules = [
  "intro",
  "event-envelope",
  "materialization",
  "snapshotting",
  "exactly-once",
  "multi-tenancy",
  "partitioning",
  "schema-evolution",
  "ops-offsets",
  "observability",
  "use-cases",
  "strategy",
  "tooling",
  "lab-kafka-debezium",
  "quickstarts",
  "tests",
  "connector-builder",
  "dlq-triage",
  "debezium-decoder",
  "errata",
];

for (const module of expectedModules) {
  const modulePath = join(outputDir, module, "index.html");
  if (!existsSync(modulePath)) {
    failures.push(`Module page missing: ${module}/index.html`);
  }
}

// Verify search index exists and is valid JSON
const searchIndexPath = join(outputDir, "search-index.json");
if (!existsSync(searchIndexPath)) {
  failures.push(
    "Search index (search-index.json) is missing from build output.",
  );
} else {
  try {
    const searchIndex = JSON.parse(readFileSync(searchIndexPath, "utf8"));
    if (!Array.isArray(searchIndex) || searchIndex.length === 0) {
      failures.push("Search index is empty or malformed.");
    }
  } catch (error) {
    failures.push(`Search index JSON is not valid: ${error.message}`);
  }
}

// Verify sitemap exists
const sitemapPath = join(outputDir, "sitemap.xml");
if (!existsSync(sitemapPath)) {
  failures.push("Sitemap (sitemap.xml) is missing from build output.");
} else {
  const sitemap = readFileSync(sitemapPath, "utf8");
  if (!sitemap.includes("<urlset")) {
    failures.push("Sitemap does not contain valid XML structure.");
  }
  if (!sitemap.includes("<loc>")) {
    failures.push("Sitemap does not contain any URL entries.");
  }
}

// Verify robots.txt exists
const robotsPath = join(outputDir, "robots.txt");
if (!existsSync(robotsPath)) {
  failures.push("robots.txt is missing from build output.");
}

// Check for series navigation in module pages
const sampleModulePath = join(outputDir, "intro", "index.html");
if (existsSync(sampleModulePath)) {
  const moduleHtml = readFileSync(sampleModulePath, "utf8");
  if (
    !moduleHtml.includes("series-nav") &&
    !moduleHtml.includes("prev-module")
  ) {
    failures.push("Module pages missing series navigation component.");
  }
}

const htaccessPath = join(root, ".htaccess");
if (existsSync(htaccessPath)) {
  try {
    const htaccess = readFileSync(htaccessPath, "utf8");
    if (!/Content-Security-Policy/.test(htaccess)) {
      failures.push("CSP header missing from .htaccess.");
    }
    if (/unsafe-inline/.test(htaccess)) {
      failures.push(
        "CSP still includes unsafe-inline; expected hashed allowances instead.",
      );
    }
  } catch (error) {
    failures.push(`Failed to read .htaccess: ${error.message}`);
  }
}

// Guard against root-absolute href/src usage in source templates
const binaryExtensions = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".avif",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".eot",
  ".zip",
]);

const sourceFiles = (() => {
  const acc = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        walk(join(dir, entry.name));
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase();
        if (binaryExtensions.has(ext)) {
          continue;
        }
        acc.push(join(dir, entry.name));
      }
    }
  };
  walk(sourceDir);
  return acc;
})();

const offendingSource = [];

for (const filePath of sourceFiles) {
  const content = readFileSync(filePath, "utf8");
  const matches = content.match(/(href|src)\s*[:=]["']\/(?!\/)/g);
  if (matches) {
    offendingSource.push({
      file: relative(root, filePath),
      samples: [...new Set(matches)].slice(0, 3),
    });
  }
}

if (offendingSource.length > 0) {
  failures.push(
    "Found root-absolute href/src references in source: " +
      offendingSource
        .map(({ file, samples }) => `${file} [${samples.join(", ")}]`)
        .join("; "),
  );
}

// PR #278 added a per-page "Edit this page on GitHub" link built from
// `site.repository` + `page.inputPath`. Assert each representative
// page renders a correctly-shaped edit URL, so a future change to
// either the layout, the `site.repository` config, or Eleventy's
// `page.inputPath` semantics doesn't silently ship broken links.
// Only base-layout pages are checked — `layout: null` outputs (404,
// mermaid-sandbox, redirect stubs) intentionally don't get a footer.
const editLinkChecks = [
  { file: "index.html", expectedPath: "src/index.njk" },
  { file: "intro/index.html", expectedPath: "src/intro/index.njk" },
  { file: "errata/index.html", expectedPath: "src/errata/index.njk" },
];
const repoOwnerRepo = "sandgraal/letstalkcdc";
for (const { file, expectedPath } of editLinkChecks) {
  if (!existsSync(join(outputDir, file))) continue;
  const html = read(file);
  const expectedHref = `https://github.com/${repoOwnerRepo}/edit/main/${expectedPath}`;
  if (!html.includes(`href="${expectedHref}"`)) {
    failures.push(
      `${file}: Edit-on-GitHub link missing or malformed (expected href="${expectedHref}")`,
    );
  }
}

// /glossary/ is data-driven from src/_data/glossary.mjs. Assert the
// page exists, includes a known anchor, and has at least a handful
// of terms — guards against the data file being accidentally
// emptied or the page template losing its for-loop.
const glossaryFile = "glossary/index.html";
if (existsSync(join(outputDir, glossaryFile))) {
  const html = read(glossaryFile);
  const termCount = (html.match(/class="glossary__term"/g) ?? []).length;
  if (termCount < 10) {
    failures.push(
      `${glossaryFile}: expected at least 10 glossary terms, found ${termCount}`,
    );
  }
  if (!html.includes('id="tombstone"')) {
    failures.push(
      `${glossaryFile}: expected anchor id="tombstone" missing — slug renamed?`,
    );
  }
} else {
  failures.push(`${glossaryFile}: page missing — /glossary/ build broken`);
}

if (failures.length) {
  console.error("Smoke test failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log(
  "Smoke test passed: critical canvases present, CSP hardened, no external fonts, edit-on-GitHub links well-formed, glossary populated.",
);
