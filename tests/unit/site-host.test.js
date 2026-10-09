/**
 * Guard: the site's host is written down once (lib/site-host.mjs) and every
 * emitted URL derives from SITE_HOST. Moving to another domain must be a
 * variable change, not a search-and-replace (P15-13, docs/DOMAIN-MIGRATION.md).
 *
 * The integration half runs real production Eleventy builds into a scratch
 * directory with a different SITE_HOST and asserts the current host appears
 * nowhere in the output. The playground is copied in by the deploy script,
 * not by Eleventy, so it is out of scope here.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_SITE_HOST,
  getEnvSiteHost,
  getSiteHost,
  normalizeHost,
} from "../../lib/site-host.mjs";

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

// Assembled at runtime so a repo-wide search for the host does not match
// this file's own assertions.
const OLD_HOST = ["sandgraal", "github", "io"].join(".");

describe("lib/site-host.mjs", () => {
  const saved = process.env.SITE_HOST;
  afterAll(() => {
    if (saved === undefined) delete process.env.SITE_HOST;
    else process.env.SITE_HOST = saved;
  });

  it("strips a single trailing slash and treats blank as unset", () => {
    expect(normalizeHost("https://example.org/")).toBe("https://example.org");
    expect(normalizeHost("https://example.org")).toBe("https://example.org");
    expect(normalizeHost("")).toBeNull();
    expect(normalizeHost(undefined)).toBeNull();
  });

  it("uses SITE_HOST when set and the shared default otherwise", () => {
    process.env.SITE_HOST = "https://example.org/";
    expect(getEnvSiteHost()).toBe("https://example.org");
    expect(getSiteHost()).toBe("https://example.org");

    delete process.env.SITE_HOST;
    expect(getEnvSiteHost()).toBeNull();
    expect(getSiteHost()).toBe(DEFAULT_SITE_HOST);
  });
});

function walk(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

const TEXT_EXT = new Set([".html", ".xml", ".txt", ".json", ".js", ".css"]);

function build(outDir, env) {
  execFileSync(
    process.execPath,
    [ELEVENTY_BIN, "--config=eleventy.config.mjs", `--output=${outDir}`],
    {
      cwd: ROOT,
      stdio: "pipe",
      env: {
        ...process.env,
        // Keep the repo-derived prefix out of the picture.
        GITHUB_REPOSITORY: "",
        NODE_ENV: "production",
        ...env,
      },
    },
  );
}

const read = (dir, file) => readFileSync(path.join(dir, file), "utf8");

describe("production build with a different SITE_HOST", () => {
  const scenarios = [
    {
      label: "served from the root",
      env: { SITE_HOST: "https://example.org", ELEVENTY_PATH_PREFIX: "/" },
      base: "https://example.org",
    },
    {
      label: "served from a subdirectory (trailing slash on SITE_HOST)",
      env: { SITE_HOST: "https://example.org/", ELEVENTY_PATH_PREFIX: "/site" },
      base: "https://example.org/site",
    },
  ];
  const outDirs = [];

  beforeAll(() => {
    for (const scenario of scenarios) {
      const outDir = mkdtempSync(path.join(os.tmpdir(), "ltcdc-host-"));
      outDirs.push(outDir);
      scenario.outDir = outDir;
      build(outDir, scenario.env);
    }
  }, 240_000);

  afterAll(() => {
    for (const dir of outDirs) rmSync(dir, { recursive: true, force: true });
  });

  for (const scenario of scenarios) {
    describe(scenario.label, () => {
      it("emits the old host nowhere in the built site", () => {
        const offenders = walk(scenario.outDir)
          .filter((f) => TEXT_EXT.has(path.extname(f)))
          .filter((f) => readFileSync(f, "utf8").includes(OLD_HOST))
          .map((f) => path.relative(scenario.outDir, f));
        expect(offenders).toEqual([]);
      });

      it("points canonical, Open Graph and JSON-LD at the new host", () => {
        const html = read(scenario.outDir, "index.html");
        expect(html).toContain(
          `<link rel="canonical" href="${scenario.base}/">`,
        );
        expect(html).toContain(
          `<meta property="og:url" content="${scenario.base}/">`,
        );
        expect(html).toContain(
          `<meta property="og:image" content="${scenario.base}/images/cdc-cover.jpg">`,
        );

        const blocks = [
          ...html.matchAll(
            /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
          ),
        ].map((m) => JSON.parse(m[1]));
        expect(blocks.length).toBeGreaterThan(0);
        const urls = JSON.stringify(blocks).match(/https?:\/\/[^"]+/g) ?? [];
        expect(urls.some((u) => u.startsWith(scenario.base))).toBe(true);
      });

      it("builds feed.xml, sitemap.xml and robots.txt on the new host", () => {
        const feed = read(scenario.outDir, "feed.xml");
        expect(feed).toContain(`<link>${scenario.base}</link>`);
        expect(feed).toContain(`href="${scenario.base}/feed.xml"`);
        expect(feed).toContain(`<link>${scenario.base}/intro/</link>`);

        const sitemap = read(scenario.outDir, "sitemap.xml");
        expect(sitemap).toContain(`<loc>${scenario.base}/intro/</loc>`);
        const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
          (m) => m[1],
        );
        expect(locs.length).toBeGreaterThan(10);
        expect(locs.every((l) => l.startsWith(`${scenario.base}/`))).toBe(true);

        expect(read(scenario.outDir, "robots.txt")).toContain(
          `Sitemap: ${scenario.base}/sitemap.xml`,
        );
      });
    });
  }
});
