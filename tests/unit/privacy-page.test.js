/**
 * Guard: the /privacy/ page (P15-8) exists, states the facts the database
 * actually enforces, and is reachable from the footer and from the
 * assistant's feedback notice. Reads the real sources, not copies.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import nunjucks from "nunjucks";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

const page = read("src/privacy/index.njk");
const base = read("src/_includes/layouts/base.njk");
const assistant = read("src/js/assistant.js");
const schema = read("supabase/schema.sql");

describe("privacy page source", () => {
  it("exists with front-matter and a sitemap-visible date", () => {
    expect(existsSync(path.join(ROOT, "src/privacy/index.njk"))).toBe(true);
    expect(page).toMatch(/^layout: base\.njk$/m);
    expect(page).toMatch(/^canonicalPath: "\/privacy\/"$/m);
    const desc = page.match(/^description: "(.+)"$/m)?.[1] ?? "";
    expect(desc.length).toBeGreaterThan(0);
    expect(desc.length).toBeLessThanOrEqual(160);
    const data = read("src/privacy/index.11tydata.cjs");
    expect(data).toContain('datePublished: "2026-10-09"');
  });

  it("names every stored field and the 12-month retention", () => {
    expect(page).toContain("<code>question</code>");
    expect(page).toContain("<code>intent_id</code>");
    expect(page).toContain("<code>helpful</code>");
    expect(page).toMatch(/vote/i);
    expect(page).toContain("12 months");
    expect(page).toContain("2026-10-09");
  });

  it("matches the retention job recorded in schema.sql", () => {
    expect(schema).toContain("'assistant-feedback-retention'");
    expect(schema).toContain("interval '12 months'");
  });

  it("does not claim the playground tables are deleted automatically", () => {
    expect(page).toContain("No automatic deletion yet");
    expect(page).toContain("<code>events</code>");
    expect(page).toContain("<code>scenarios</code>");
  });

  it("gives contact routes and warns against pasting the text publicly", () => {
    expect(page).toContain("{{ author.advisoryUrl }}");
    expect(page).toContain("issues/new");
    expect(page).toMatch(/do not paste the private\s+text/i);
  });

  it("says there are no cookies or analytics (update when P15-10 ships)", () => {
    expect(page).toContain("This site does not use cookies or analytics.");
  });

  it("never hardcodes an internal root-relative href", () => {
    const hrefs = [...page.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href.startsWith("/"), href).toBe(false);
    }
  });
});

describe("links to the privacy page", () => {
  it("footer links to /privacy/ through the url filter", () => {
    const footer = base.slice(base.indexOf('<p class="footer-meta">'));
    const env = new nunjucks.Environment(null, { autoescape: true });
    env.addFilter("url", (p) => `/letstalkcdc${p}`);
    const m = footer.match(
      /<a href="\{\{ '\/privacy\/' \| url \}\}">[^<]+<\/a>/,
    );
    expect(m, "footer Privacy link missing").not.toBeNull();
    expect(env.renderString(m[0], {})).toBe(
      '<a href="/letstalkcdc/privacy/">Privacy</a>',
    );
  });

  it("assistant feedback notice links to /privacy/ with visible text", () => {
    expect(assistant).toContain('const PRIVACY_LINK_TEXT = "Privacy details"');
    expect(assistant).toMatch(
      /\$\{FEEDBACK_NOTICE\} <a href="\$\{withBasePath\("\/privacy\/"\)\}">\$\{PRIVACY_LINK_TEXT\}<\/a>/,
    );
  });
});
