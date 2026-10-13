/**
 * Guard: Mermaid and Chart.js are self-hosted with Subresource Integrity, and
 * nothing on the site loads a script from a public CDN (P17-23).
 *
 * Source half: no file under src/ may name jsdelivr, unpkg or cdnjs, with one
 * documented exception. Build half: one real production build into a scratch
 * directory proves the hashed vendor file exists, every integrity value equals
 * the sha384 of the file it points to, and the loaders use local paths.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const ELEVENTY_BIN = path.join(
  ROOT,
  "node_modules",
  "@11ty",
  "eleventy",
  "cmd.cjs",
);
const VITE_BIN = path.join(ROOT, "node_modules", "vite", "bin", "vite.js");

const PREFIX = "/site";
const CDN = /cdn\.jsdelivr|unpkg\.com|cdnjs/i;

// The privacy page must keep naming jsDelivr for as long as the Change Feed
// Playground (outside src/, copied in by scripts/publish-playground.sh) loads
// its Supabase library from there. Delete this entry when that is vendored.
const SRC_ALLOWLIST = new Set(["src/privacy/index.njk"]);

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : [full];
  });

const sha384 = (file) =>
  `sha384-${createHash("sha384").update(readFileSync(file)).digest("base64")}`;

describe("no public CDN in the source tree", () => {
  it("names jsdelivr, unpkg and cdnjs nowhere under src/ except the privacy page", () => {
    const hits = walk(path.join(ROOT, "src"))
      .filter((f) => !/\.(png|jpe?g|webp|woff2?|ico|zip|pdf)$/i.test(f))
      .filter((f) => CDN.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(ROOT, f).split(path.sep).join("/"))
      .filter((f) => !SRC_ALLOWLIST.has(f));
    expect(hits).toEqual([]);
  });

  it("keeps the privacy page's jsDelivr mention to the Supabase library", () => {
    const html = readFileSync(path.join(ROOT, "src/privacy/index.njk"), "utf8");
    for (const m of html.matchAll(/jsdelivr/gi)) {
      const around = html.slice(Math.max(0, m.index - 300), m.index + 300);
      expect(around).toMatch(/Supabase/);
      expect(around).not.toMatch(/Mermaid|Chart\.js/);
    }
  });
});

describe("built vendor files and integrity hashes", () => {
  let out;
  let viteOut;
  let pages; // relative path -> html

  beforeAll(() => {
    out = mkdtempSync(path.join(os.tmpdir(), "ltcdc-vendor-"));
    viteOut = mkdtempSync(path.join(os.tmpdir(), "ltcdc-vendor-vite-"));
    const env = {
      ...process.env,
      GITHUB_REPOSITORY: "",
      NODE_ENV: "production",
      SITE_HOST: "https://example.org",
      ELEVENTY_PATH_PREFIX: PREFIX,
    };
    execFileSync(
      process.execPath,
      [ELEVENTY_BIN, "--config=eleventy.config.mjs", `--output=${out}`],
      { cwd: ROOT, stdio: "pipe", env },
    );
    execFileSync(
      process.execPath,
      [VITE_BIN, "build", "--outDir", viteOut, "--emptyOutDir"],
      { cwd: ROOT, stdio: "pipe", env },
    );
    pages = new Map(
      walk(out)
        .filter((f) => f.endsWith(".html"))
        .map((f) => [path.relative(out, f), readFileSync(f, "utf8")]),
    );
  }, 300_000);

  afterAll(() => {
    for (const dir of [out, viteOut]) {
      if (dir) rmSync(dir, { recursive: true, force: true });
    }
  });

  const metaOf = (html) => {
    const tag = html.match(/<meta name="cdc-vendor-mermaid"[^>]*>/)?.[0];
    if (!tag) return null;
    return {
      content: tag.match(/content="([^"]*)"/)?.[1],
      integrity: tag.match(/data-integrity="([^"]*)"/)?.[1],
    };
  };
  const fileOf = (content) => {
    expect(content.startsWith(`${PREFIX}/assets/vendor/`)).toBe(true);
    return path.join(out, content.slice(PREFIX.length));
  };

  it("serves Mermaid from a content-hashed same-origin file", () => {
    const dir = path.join(out, "assets", "vendor");
    const files = readdirSync(dir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^mermaid\.[0-9a-f]{12}\.min\.js$/);
    expect(statSync(path.join(dir, files[0])).size).toBeGreaterThan(1_000_000);
    const source = path.join(ROOT, "node_modules/mermaid/dist/mermaid.min.js");
    expect(
      readFileSync(path.join(dir, files[0])).equals(readFileSync(source)),
    ).toBe(true);
  });

  it("publishes a matching sha384 on every page that carries the tag, and the tag is widespread", () => {
    const tagged = [];
    const wrong = [];
    for (const [file, html] of pages) {
      const meta = metaOf(html);
      if (!meta) continue;
      tagged.push(file);
      const target = fileOf(meta.content);
      if (!existsSync(target) || sha384(target) !== meta.integrity)
        wrong.push(file);
    }
    expect(tagged.length).toBeGreaterThan(50);
    expect(wrong).toEqual([]);
  });

  it("gives every page that has a diagram the tag the loader needs", () => {
    const withDiagram = [...pages].filter(([, html]) =>
      /class="[^"]*\bmermaid\b/.test(html),
    );
    expect(withDiagram.length).toBeGreaterThanOrEqual(3);
    expect(
      withDiagram.filter(([, html]) => !metaOf(html)).map(([file]) => file),
    ).toEqual([]);
  });

  it("covers the diagram pages and the sandbox", () => {
    for (const page of ["overview", "case-study", "mermaid-sandbox"]) {
      const meta = metaOf(pages.get(path.join(page, "index.html")));
      expect(meta, page).not.toBeNull();
      expect(meta.integrity).toMatch(/^sha384-[A-Za-z0-9+/]{64}$/);
    }
  });

  it("does not publish the Chart.js source entry (its bare import cannot run in a browser)", () => {
    expect(existsSync(path.join(out, "assets", "js", "vendor"))).toBe(false);
    expect(existsSync(path.join(out, "vendor-entry"))).toBe(false);
    const leaked = walk(out)
      .map((f) => path.relative(out, f).split(path.sep).join("/"))
      .filter((rel) => /(^|\/)vendor\/chart\.js$|vendor-entry/.test(rel));
    expect(leaked).toEqual([]);
  });

  it("builds Chart.js as a hashed Vite chunk with nothing fetched from a CDN", () => {
    const manifest = JSON.parse(
      readFileSync(path.join(viteOut, ".vite", "manifest.json"), "utf8"),
    );
    const entry = manifest["src/vendor-entry/chart.js"];
    expect(entry?.file).toMatch(/^js\/chart-vendor\.[\w-]+\.js$/);
    const code = readFileSync(path.join(viteOut, entry.file), "utf8");
    expect(code.length).toBeGreaterThan(100_000);
    expect(code).not.toMatch(/https?:\/\//);
    // The dashboard reads these two names from the dynamic import; Vite drops
    // entry exports unless preserveEntrySignatures keeps them.
    expect(code).toMatch(/export\s*\{[^}]*\bas Chart\b/);
    expect(code).toMatch(/export\s*\{[^}]*\bregisterables\b/);
    // The initial bundles must not pull Chart.js in.
    expect(manifest["src/assets/js/app.js"].imports ?? []).not.toContain(
      "src/vendor-entry/chart.js",
    );
  });

  it("has no public CDN in any built file except the privacy page", () => {
    const hits = walk(out)
      .map((f) => path.relative(out, f).split(path.sep).join("/"))
      .filter((rel) => rel !== "privacy/index.html")
      .filter((rel) => CDN.test(readFileSync(path.join(out, rel), "latin1")));
    expect(hits).toEqual([]);
  });

  it("makes the loaders read the local meta tags, not a URL", () => {
    const sandbox = readFileSync(
      path.join(out, "assets/js/pages/mermaid-sandbox.js"),
      "utf8",
    );
    const helper = readFileSync(
      path.join(out, "assets/js/utils/vendor-scripts.js"),
      "utf8",
    );
    const dashboard = readFileSync(
      path.join(out, "scripts/dashboard.js"),
      "utf8",
    );
    expect(sandbox).toContain("getMermaidScript");
    expect(sandbox).toContain('setAttribute("integrity"');
    expect(helper).toContain("cdc-vendor-");
    expect(dashboard).toContain("cdc-vendor-chart");
    expect(dashboard).toContain("charts need `npm run build:js` once");
    expect(dashboard).not.toMatch(/import\(\s*["']https?:/);
  });
});
