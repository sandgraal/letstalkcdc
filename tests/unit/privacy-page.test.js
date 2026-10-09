/**
 * Guard: the /privacy/ page (P15-8) exists, states the facts the database
 * actually enforces, and is reachable from the footer and from the
 * assistant's feedback notice. Reads the real sources, not copies.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import nunjucks from "nunjucks";
import author from "../../src/_data/author.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

const page = read("src/privacy/index.njk");
const base = read("src/_includes/layouts/base.njk");
const assistant = read("src/js/assistant.js");
const schema = read("supabase/schema.sql");
const data = createRequire(import.meta.url)(
  path.join(ROOT, "src/privacy/index.11tydata.cjs"),
);

// Render the page body (everything after the hero) with the real template
// text, the real 11tydata and the real author data.
const body = page.slice(page.indexOf("}) | safe }}") + "}) | safe }}".length);
const env = new nunjucks.Environment(null, { autoescape: true });
env.addFilter("url", (p) => `/letstalkcdc${p}`);
const rendered = env.renderString(body, {
  ...data,
  author,
  site: { repository: "sandgraal/letstalkcdc" },
});
const section = (html, id) =>
  html.match(
    new RegExp(`<section[^>]*aria-labelledby="${id}"[\\s\\S]*?</section>`),
  )?.[0] ?? "";

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
    expect(schema).toContain("'17 3 * * *'");
    expect(schema).toContain(
      "delete from public.assistant_feedback where ts <",
    );
  });

  it("does not claim the playground tables are deleted automatically", () => {
    expect(page).toContain("No automatic deletion yet");
    expect(page).toContain("<code>events</code>");
    expect(page).toContain("<code>scenarios</code>");
  });

  it("gives contact routes and warns against pasting the text publicly", () => {
    expect(page).toContain("{{ author.advisoryUrl }}");
    expect(page).toContain("issues/new");
    expect(page).toMatch(/Never paste your question/);
  });

  it("says there are no cookies or analytics (update when P15-10 ships)", () => {
    expect(page).toContain("does not set cookies or use analytics");
  });

  it("never hardcodes an internal root-relative href", () => {
    const hrefs = [...page.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href.startsWith("/"), href).toBe(false);
    }
  });
});

describe("privacy page, rendered", () => {
  it("shows a visible updated date driven by dateModified", () => {
    expect(rendered).toContain(
      `Last updated: <time datetime="${data.dateModified}">${data.dateModified}</time>`,
    );
    expect(rendered).not.toContain("Last reviewed");
  });

  it("tells people not to paste private text or share links publicly", () => {
    const del = section(rendered, "delete");
    expect(del).toMatch(/Never paste your question, a playground share\s+link/);
    expect(del).toMatch(/public\s+issue/);
    expect(del).toMatch(/send the share link privately/i);
    expect(del).not.toMatch(/share link is enough/i);
  });

  it("keeps queued votes out of the never-sent list", () => {
    const device = section(rendered, "device");
    expect(device).toMatch(/never sent/);
    expect(device).not.toMatch(/vote/i);
    expect(section(rendered, "stores")).toMatch(
      /retried on a later visit, for up to 14 days or 8 tries/,
    );
  });

  it("names the privacy-enhanced YouTube host for click-to-play", () => {
    const thirdParties = section(rendered, "third-parties");
    expect(thirdParties).toContain("<strong>www.youtube-nocookie.com</strong>");
    expect(thirdParties).not.toContain("<strong>www.youtube.com</strong>");
    expect(thirdParties).toContain("<strong>img.youtube.com</strong>");
  });

  it("qualifies the cookie claim and lists the event fields", () => {
    const cookies = section(rendered, "cookies");
    expect(cookies).toContain("site's own code does not set cookies");
    expect(cookies).toMatch(
      /YouTube's\s+player loads and may set its own cookies/,
    );
    expect(section(rendered, "playground")).toContain("<code>ts_ms</code>");
    expect(section(rendered, "playground")).toContain("<code>id</code>");
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
