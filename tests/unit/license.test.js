/**
 * Guard: licensing files exist, say what LICENSE-CONTENT.md promises, the
 * templates still advertise the licence, and the Lighthouse badge in
 * docs/DEVELOPMENT.md states the floor that lighthouse-ci.config.json enforces for /intro/
 * (P15-1, P15-6).
 */
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
const sha256 = (rel) =>
  createHash("sha256")
    .update(readFileSync(path.join(ROOT, rel)))
    .digest("hex");

const CC_URL = "https://creativecommons.org/licenses/by/4.0/";

describe("licensing files", () => {
  it("declares MIT for code in package.json and LICENSE", () => {
    expect(JSON.parse(read("package.json")).license).toBe("MIT");
    const mit = read("LICENSE");
    expect(mit).toMatch(/^MIT License/);
    expect(mit).toMatch(/Copyright \(c\) 2025-\d{4} Christopher Ennis/);
  });

  it("ships the official CC BY 4.0 legalcode unmodified", () => {
    expect(sha256("LICENSE-CC-BY-4.0.txt")).toBe(
      "9ba9550ad48438d0836ddab3da480b3b69ffa0aac7b7878b5a0039e7ab429411",
    );
  });

  it("ships IBM's OFL notice next to the Plex fonts, unmodified", () => {
    expect(sha256("src/static/fonts/OFL.txt")).toBe(
      "7e6b2818edbd8f6a01ae80641cc8f16a51080d08fb4e532be3a0b6f74adb07da",
    );
    expect(read("src/static/fonts/OFL.txt")).toContain(
      'Copyright © 2017 IBM Corp. with Reserved Font Name "Plex"',
    );
  });

  it("keeps the licence texts byte-exact via .gitattributes", () => {
    const attrs = read(".gitattributes");
    expect(attrs).toMatch(/^LICENSE-CC-BY-4\.0\.txt -text$/m);
    expect(attrs).toMatch(/^src\/static\/fonts\/OFL\.txt -text$/m);
  });

  it("explains the split, the attribution wording and the font notice", () => {
    const doc = read("LICENSE-CONTENT.md");
    expect(doc).toContain(CC_URL);
    expect(doc).toContain(
      "CDC: The Missing Manual by Christopher Ennis (Let's Talk CDC), https://sandgraal.github.io/letstalkcdc/, licensed under CC BY 4.0",
    );
    expect(doc).toContain("LICENSE-CC-BY-4.0.txt");
    expect(doc).toContain("https://github.com/IBM/plex");
    expect(doc).toContain("/fonts/OFL.txt");
    expect(doc).toMatch(/also\s+available under MIT with no attribution/);
  });

  it("uses the site's displayed title in the attribution", async () => {
    const site = (await import("../../src/_data/site.mjs")).default;
    expect(read("LICENSE-CONTENT.md")).toContain(`${site.title} by `);
  });

  it("names only paths that exist (derived from LICENSE-CONTENT.md)", () => {
    const doc = read("LICENSE-CONTENT.md");
    const tokens = [...doc.matchAll(/`([^`\s]+)`/g)]
      .map((m) => m[1])
      .filter((t) =>
        /^(src|playground|docs|tests|lib|scripts|\.github|\.claude)\//.test(t),
      );
    // Guard against the extraction silently matching nothing.
    expect(tokens.length).toBeGreaterThan(20);

    for (const token of tokens) {
      const starAt = token.search(/[*<]/);
      if (starAt === -1) {
        expect(existsSync(path.join(ROOT, token)), token).toBe(true);
        continue;
      }
      const prefix = token.slice(0, starAt);
      const baseDir = prefix.endsWith("/")
        ? prefix.slice(0, -1)
        : path.dirname(prefix);
      expect(existsSync(path.join(ROOT, baseDir)), token).toBe(true);
      // `dir/*.ext` must match at least one real file.
      const flat = token.match(/^(.*)\/\*(\.[A-Za-z0-9]+)$/);
      if (flat) {
        const files = readdirSync(path.join(ROOT, flat[1]));
        expect(
          files.some((f) => f.endsWith(flat[2])),
          token,
        ).toBe(true);
      }
    }
  });
});

describe("templates advertise the licence", () => {
  const base = read("src/_includes/layouts/base.njk");

  it("carries the licence in the Article JSON-LD", () => {
    expect(base).toContain(`"license": "${CC_URL}"`);
  });

  it("links the site footer to LICENSE-CONTENT.md", () => {
    expect(base).toMatch(
      /<a href="https:\/\/github\.com\/\{\{ site\.repository \}\}\/blob\/main\/LICENSE-CONTENT\.md"[^>]*>Content: CC BY 4\.0 · Code: MIT<\/a>/,
    );
  });
});

describe("Lighthouse badge in docs/DEVELOPMENT.md", () => {
  it("states the /intro/ floors enforced in lighthouse-ci.config.json", () => {
    const rc = JSON.parse(read("lighthouse-ci.config.json"));
    const entry = rc.assertMatrix.find((m) =>
      m.matchingUrlPattern.includes("intro"),
    );
    const floor = (key) =>
      Math.round(entry.assertions[`categories:${key}`][1].minScore * 100);
    const perf = floor("performance");
    const a11y = floor("accessibility");

    const badge = decodeURIComponent(
      read("docs/DEVELOPMENT.md").match(
        /img\.shields\.io\/badge\/lighthouse[^)\s]*/,
      )[0],
    );
    expect(badge).toContain(`perf ≥ ${perf}`);
    expect(badge).toContain(`a11y ≥ ${a11y}`);
  });
});
