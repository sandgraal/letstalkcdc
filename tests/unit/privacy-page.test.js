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
import { resolveNewsletter } from "../../lib/newsletter.mjs";

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

  it("matches the playground retention jobs recorded in schema.sql", () => {
    expect(schema).toContain("'playground-events-retention'");
    expect(schema).toContain("'23 3 * * *'");
    expect(schema).toContain(
      "delete from public.events where created_at < now() - interval '30 days'",
    );
    expect(schema).toContain("'playground-scenarios-retention'");
    expect(schema).toContain("'29 3 * * *'");
    expect(schema).toContain(
      "delete from public.scenarios where saved_at < now() - interval '30 days'",
    );
  });

  it("keeps the server-side timestamp triggers that retention depends on", () => {
    expect(schema).toMatch(
      /create or replace function public\.force_server_timestamp\(\)[\s\S]*?set search_path = ''/,
    );
    expect(schema).toContain("new.saved_at := now()");
    expect(schema).toContain("new.created_at := now()");
    expect(schema).toContain("tg_table_name = 'scenarios'");
    expect(schema).toContain("tg_table_name = 'events'");
    for (const [trigger, table] of [
      ["scenarios_server_saved_at", "scenarios"],
      ["events_server_created_at", "events"],
    ]) {
      expect(schema).toContain(
        `drop trigger if exists ${trigger} on public.${table};`,
      );
      expect(schema).toMatch(
        new RegExp(
          `create trigger ${trigger}\\s+before insert on public\\.${table}\\s+for each row execute function public\\.force_server_timestamp\\(\\);`,
        ),
      );
    }
  });

  it("keeps the playground tables insert-only (events also readable)", () => {
    for (const stmt of [
      "revoke all on table public.events from anon, authenticated;",
      "revoke all on table public.scenarios from anon, authenticated;",
      "grant insert on public.events to anon, authenticated;",
      "grant select on public.events to anon, authenticated;",
      "grant insert on public.scenarios to anon, authenticated;",
    ]) {
      expect(schema).toContain(stmt);
    }
    // No broader grant on these tables may creep back in.
    expect(schema).not.toMatch(
      /grant\s+(all|update|delete|select)[^;]*on (table )?public\.scenarios/i,
    );
    expect(schema).not.toMatch(
      /grant\s+(all|update|delete)[^;]*on (table )?public\.events/i,
    );
  });

  it("states the 30-day playground retention and never the old claim", () => {
    expect(page).toContain("<code>events</code>");
    expect(page).toContain("<code>scenarios</code>");
    expect(page).toContain("Deleted after 30 days");
    expect(page).not.toMatch(/no automatic deletion/i);
    expect(page).not.toMatch(/not deleted automatically/i);
    expect(page).not.toMatch(/where it is not deleted yet/i);
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

  it("says playground records go within 30 days (about 31), links expire, events are visible", () => {
    const pg = section(rendered, "playground");
    expect(pg).toMatch(/older than 30\s+days/);
    expect(pg).toMatch(/up to about 31\s+days/);
    expect(pg).toMatch(/share\s+link\s+stops\s+working/);
    expect(pg).toMatch(/Anyone can read that\s+table/);
    expect(pg).toMatch(/made-up\s+data/i);
    const ret = section(rendered, "retention");
    expect(ret).toMatch(/30\s+days/);
    expect(ret).toMatch(/about 31\s+days/);
    expect(ret).toMatch(/12 months/);
    expect(section(rendered, "who-sees")).toMatch(/see new events live/);
    expect(rendered).not.toMatch(/no automatic deletion/i);
  });

  it("says the 30 days start on the server's clock and browsers cannot change or delete", () => {
    const pg = section(rendered, "playground");
    expect(pg).toMatch(
      /counted from the server's time when the record is\s+stored/,
    );
    expect(pg).toMatch(/device's clock cannot change it/);
    expect(pg).toMatch(
      /only add\s+records \(and, for events, read them\): they cannot change or delete any/,
    );
    expect(section(rendered, "retention")).toMatch(
      /start from the database\s+server's time[\s\S]*?device clock\s+cannot change that/,
    );
    expect(section(rendered, "who-sees")).toMatch(
      /can only add playground\s+records, and read events; they cannot change or delete any record/,
    );
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

  it("describes only the Copy Share Link control, which really exists", () => {
    const pg = section(rendered, "playground");
    expect(pg).toMatch(/"Copy Share\s+Link" stores a snapshot/);
    expect(pg).not.toMatch(/Save\s+scenario/);
    expect(read("playground/index.html")).not.toContain("btnSaveRemote");
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

describe("newsletter signup disclosure (P15-9)", () => {
  const renderWith = (newsletter) =>
    env.renderString(body, {
      ...data,
      author,
      newsletter,
      site: { repository: "sandgraal/letstalkcdc" },
    });
  const on = renderWith(resolveNewsletter("demo-user", () => {}));
  const off = renderWith(resolveNewsletter(undefined));

  it("says what is sent, to whom and when, and links Buttondown's policy", () => {
    const sec = section(on, "newsletter");
    expect(sec).toMatch(/<strong>What is sent:<\/strong>\s+the email address/);
    expect(sec).toMatch(/<strong>To whom:<\/strong>\s+Buttondown/);
    expect(sec).toContain("buttondown.com");
    expect(sec).toMatch(
      /<strong>When:<\/strong>\s+only when you press Subscribe/,
    );
    expect(sec).toMatch(/Nothing is sent as you type/);
    expect(sec).toMatch(/loads no\s+script from Buttondown/);
    expect(sec).toContain('href="https://buttondown.com/legal/privacy"');
  });

  it("discloses the IP address, browser details and cookies Buttondown may receive or set", () => {
    const sec = section(on, "newsletter");
    expect(sec).toMatch(
      /the email address you typed, plus what\s+any request reveals to the receiving site \(your IP address and browser\s+details\)/,
    );
    expect(sec).toMatch(/may set cookies under its privacy policy/);
    expect(section(on, "cookies")).toMatch(
      /Buttondown page you continue to\s+may set its own cookies/,
    );
    expect(section(off, "cookies")).not.toMatch(/Buttondown/);
  });

  it("routes subscribers to the unsubscribe link, not the anonymous-entry section", () => {
    const sec = section(on, "newsletter");
    expect(sec).toMatch(/unsubscribe link Buttondown normally includes/);
    expect(sec).toContain(`href="${author.advisoryUrl}"`);
    expect(sec).toMatch(/not for\s+newsletter subscribers/);
    expect(section(off, "newsletter")).not.toMatch(/unsubscribe/);
  });

  it("says Buttondown keeps subscriber data, and only when the signup is on", () => {
    expect(section(on, "retention")).toMatch(
      /Buttondown, not this site,\s+keeps your address for as long as you are subscribed/,
    );
    expect(section(off, "retention")).not.toMatch(/Buttondown/);
  });

  it("lists buttondown.com among third-party requests only when the signup is on", () => {
    expect(section(on, "third-parties")).toContain(
      "<strong>buttondown.com</strong>",
    );
    expect(section(off, "third-parties")).not.toMatch(/buttondown/i);
  });

  it("claims nothing is sent while the signup is not open", () => {
    const sec = section(off, "newsletter");
    expect(sec).toMatch(/not open yet/);
    expect(sec).toMatch(/does not ask for or\s+send an email address/);
    expect(off).not.toMatch(/buttondown/i);
  });

  it("keeps every other claim: cookies, assistant and playground sections", () => {
    for (const html of [on, off]) {
      expect(section(html, "cookies")).toContain(
        "site's own code does not set cookies",
      );
      expect(section(html, "stores")).toContain("assistant_feedback");
      expect(section(html, "playground")).toContain("<code>ts_ms</code>");
    }
  });

  it("links to the newsletter page through the url filter only when on", () => {
    expect(section(on, "newsletter")).toContain(
      'href="/letstalkcdc/newsletter/"',
    );
    expect(section(off, "newsletter")).not.toContain("/newsletter/");
  });
});

describe("playground made-up-data notice", () => {
  const pgHtml = read("playground/index.html");
  const pgCss = read("playground/assets/styles.css");

  it("shows the 30-day note beside the row editor and the share controls", () => {
    const notes = [...pgHtml.matchAll(/<p class="data-notice"[\s\S]*?<\/p>/g)];
    expect(notes.map((m) => m[0].match(/id="([^"]+)"/)[1])).toEqual([
      "dataNoticeInput",
      "dataNoticeShare",
    ]);
    for (const [note] of notes) {
      expect(note).toContain('role="note"');
      expect(note).toMatch(/Use made-up data only/);
      expect(note).toMatch(
        /Events and shared\s+scenarios are stored on a shared\s+server/,
      );
      expect(note).not.toMatch(/saved or shared/);
      expect(note).toMatch(/other visitors can see\s+the live event stream/);
      expect(note).toMatch(/both are deleted after 30 days/);
      expect(note).toMatch(/share\s+links stop working after about 30 days/);
      expect(note).toMatch(/browser's\s+copy stays on your device/);
    }
  });

  it("links the share button to its note and styles the note with theme tokens", () => {
    expect(pgHtml).toMatch(
      /id="btnShareLink"[^>]*aria-describedby="dataNoticeShare"/,
    );
    expect(pgCss).toMatch(/\.data-notice \{[^}]*var\(--muted-strong\)/);
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
