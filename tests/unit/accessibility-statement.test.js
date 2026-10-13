/**
 * Guard: the /accessibility/ statement (P17-28).
 *
 * The page is public conformance wording, so the guard is mostly about what
 * it must NOT say: no conformance claim, no review claim, no reply time, no
 * assistive-technology result. It also checks that a visitor can reach it
 * from the footer and that it points at the contact route.
 *
 * One real production build into a scratch directory on a made-up host.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
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
const HOST = "https://example.org";
const PREFIX = "/site";

const author = (await import("../../src/_data/author.mjs")).default;

describe("accessibility statement (built)", () => {
  let out;
  let page;
  let text;
  const read = (rel) => readFileSync(path.join(out, rel), "utf8");

  beforeAll(() => {
    out = mkdtempSync(path.join(os.tmpdir(), "ltcdc-a11y-"));
    execFileSync(
      process.execPath,
      [ELEVENTY_BIN, "--config=eleventy.config.mjs", `--output=${out}`],
      {
        cwd: ROOT,
        stdio: "pipe",
        env: {
          ...process.env,
          GITHUB_REPOSITORY: "",
          NODE_ENV: "production",
          SITE_HOST: HOST,
          ELEVENTY_PATH_PREFIX: PREFIX,
        },
      },
    );
    page = read("accessibility/index.html");
    const main = page.slice(page.indexOf("<main"), page.indexOf("</main>"));
    text = main
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }, 240_000);

  afterAll(() => {
    if (out) rmSync(out, { recursive: true, force: true });
  });

  it("renders with one h1, a clean outline, a canonical and a short description", () => {
    expect(page.match(/<h1[\s>]/g)).toHaveLength(1);
    const levels = [...page.matchAll(/<h([1-6])[\s>]/g)].map((m) =>
      Number(m[1]),
    );
    for (let i = 1; i < levels.length; i++)
      expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1);
    expect(page).toContain(
      `<link rel="canonical" href="${HOST}${PREFIX}/accessibility/">`,
    );
    const desc = page.match(
      /<meta[^>]*name="description"[^>]*content="([^"]*)"/,
    )?.[1];
    expect(desc).toBeTruthy();
    expect(desc.length).toBeLessThanOrEqual(160);
    expect(page).not.toMatch(/<meta[^>]*name="robots"[^>]*noindex/i);
  });

  it("is in the sitemap and linked from the footer of another page", () => {
    expect(read("sitemap.xml")).toContain(
      `<loc>${HOST}${PREFIX}/accessibility/</loc>`,
    );
    const intro = read("intro/index.html");
    const footer = intro.slice(intro.indexOf("<footer"));
    expect(footer).toContain(`<a href="${PREFIX}/accessibility/">`);
  });

  it("states the WCAG 2.2 AA target and disclaims conformance", () => {
    expect(text).toMatch(/WCAG 2\.2/);
    expect(text).toMatch(/does not claim to conform/);
  });

  it("says assistive-technology testing has not been done", () => {
    expect(text).toMatch(
      /Testing with assistive technology has not yet been done/,
    );
  });

  it("states what automated checks cannot catch", () => {
    expect(text).toMatch(/What automated checks cannot catch/);
  });

  it("makes no conformance, review, or response-time claim", () => {
    // Every "accessible"/"conformant" must sit inside a negation.
    expect(text).not.toMatch(
      /(?<!not claim that the site )\b(is|are) (fully )?(accessible|conformant)\b/i,
    );
    expect(text).not.toMatch(/fully (conforms|compliant|accessible)/i);
    expect(text).not.toMatch(/meets WCAG|complies with WCAG/i);
    expect(text).not.toMatch(
      /SME[- ]reviewed|reviewed by (the )?maintainer\b(?! or)/i,
    );
    expect(text).not.toMatch(/within \d+|business days|24\/7|hours/i);
    expect(text).toMatch(/no promised reply time/);
    expect(text).toMatch(/has not been reviewed by the maintainer/);
  });

  it("routes feedback through the contact page and the bug form, without repeating the address", () => {
    expect(page).toContain(`href="${PREFIX}/contact/#general"`);
    expect(page).toContain("issues/new?template=bug.yml");
    expect(page).not.toContain(author.contactEmail);
  });

  it("uses no root-relative href that skips the path prefix", () => {
    const bad = [...page.matchAll(/href="(\/[^"]*)"/g)]
      .map((m) => m[1])
      .filter((h) => !h.startsWith(PREFIX + "/"));
    expect(bad).toEqual([]);
  });
});
