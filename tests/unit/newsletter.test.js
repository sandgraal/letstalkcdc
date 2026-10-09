/**
 * Guard: the Buttondown newsletter signup (P15-9) stays off until
 * BUTTONDOWN_USERNAME is set to a valid username, and is a plain,
 * script-free, labelled HTML form when it is.
 *
 * The integration half runs real production Eleventy builds into scratch
 * directories: one with the variable unset, one with a valid username, and
 * one with a hostile value that must be treated as unset.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  BUTTONDOWN_EMBED_ENDPOINT,
  BUTTONDOWN_PRIVACY_URL,
  resolveNewsletter,
} from "../../lib/newsletter.mjs";

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

describe("lib/newsletter.mjs", () => {
  it("keeps the documented Buttondown embed endpoint", () => {
    // https://docs.buttondown.com/building-your-subscriber-base
    expect(BUTTONDOWN_EMBED_ENDPOINT).toBe(
      "https://buttondown.com/api/emails/embed-subscribe/",
    );
    expect(BUTTONDOWN_PRIVACY_URL).toBe("https://buttondown.com/legal/privacy");
  });

  it("is off, and silent, when the variable is unset or blank", () => {
    const warn = vi.fn();
    for (const raw of [undefined, "", "   ", "undefined"]) {
      const result = resolveNewsletter(raw, warn);
      expect(result.enabled).toBe(false);
      expect(result.action).toBe("");
    }
    expect(warn).not.toHaveBeenCalled();
  });

  it("builds the exact endpoint for a valid username", () => {
    const result = resolveNewsletter(" my_name-1 ", vi.fn());
    expect(result).toMatchObject({
      enabled: true,
      username: "my_name-1",
      action: "https://buttondown.com/api/emails/embed-subscribe/my_name-1",
    });
  });

  it("rejects anything outside [A-Za-z0-9_-], warns, and never echoes it", () => {
    const hostile = [
      'x"><script>alert(1)</script>',
      "a b",
      "a/b",
      "a?b=c",
      "a.b",
      "../x",
      "name\nnext",
      "ünï",
    ];
    for (const raw of hostile) {
      const warn = vi.fn();
      const result = resolveNewsletter(raw, warn);
      expect(result.enabled, JSON.stringify(raw)).toBe(false);
      expect(result.action).toBe("");
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).not.toContain(raw.trim());
    }
  });
});

/** Runs one Eleventy build; returns stdout + stderr (build warnings go to stderr). */
function build(outDir, env) {
  const result = spawnSync(
    process.execPath,
    [ELEVENTY_BIN, "--config=eleventy.config.mjs", `--output=${outDir}`],
    {
      cwd: ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        GITHUB_REPOSITORY: "",
        NODE_ENV: "production",
        SITE_HOST: "https://newsletter-check.example.org",
        ELEVENTY_PATH_PREFIX: "/guide",
        BUTTONDOWN_USERNAME: "",
        ...env,
      },
    },
  );
  if (result.status !== 0) {
    throw new Error(`eleventy exited ${result.status}\n${result.stderr}`);
  }
  return `${result.stdout}\n${result.stderr}`;
}

const read = (dir, file) => readFileSync(path.join(dir, file), "utf8");
const robotsMeta = (html) =>
  html.match(/<meta[^>]*name="robots"[^>]*>/i)?.[0] ?? "";
const NOT_OPEN = /not open yet/i;

describe("production build, BUTTONDOWN_USERNAME unset", () => {
  let dir;
  beforeAll(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), "ltcdc-news-off-"));
    build(dir, {});
  }, 240_000);
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("renders no form and no Buttondown reference on the home page", () => {
    const html = read(dir, "index.html");
    expect(html).not.toContain("<form");
    expect(html).not.toMatch(/buttondown/i);
    expect(html).not.toContain("/newsletter/");
  });

  it("says plainly on /newsletter/ that it is not open yet, with no form", () => {
    const html = read(dir, "newsletter/index.html");
    expect(html).toMatch(NOT_OPEN);
    expect(html).not.toContain("<form");
    expect(html).not.toMatch(/buttondown/i);
    expect(html).not.toMatch(/embed-subscribe/);
  });

  it("marks /newsletter/ noindex and leaves it out of the sitemap", () => {
    expect(robotsMeta(read(dir, "newsletter/index.html"))).toMatch(/noindex/);
    expect(read(dir, "sitemap.xml")).not.toContain("/newsletter/");
  });

  it("keeps every other page indexable and form-free", () => {
    const html = read(dir, "intro/index.html");
    expect(robotsMeta(html)).toContain("index,follow");
    expect(robotsMeta(html)).not.toContain("noindex");
    expect(html).not.toContain("embed-subscribe");
    expect(read(dir, "privacy/index.html")).not.toMatch(
      /embed-subscribe|buttondown\.com/,
    );
  });

  it("tells the privacy page reader the signup is not open yet", () => {
    const html = read(dir, "privacy/index.html");
    expect(html).toContain('id="newsletter"');
    expect(html).toMatch(NOT_OPEN);
  });
});

describe("production build, BUTTONDOWN_USERNAME set", () => {
  const USERNAME = "demo-user_1";
  const ACTION = `https://buttondown.com/api/emails/embed-subscribe/${USERNAME}`;
  let dir;
  let page;
  let home;
  beforeAll(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), "ltcdc-news-on-"));
    build(dir, { BUTTONDOWN_USERNAME: USERNAME });
    page = read(dir, "newsletter/index.html");
    home = read(dir, "index.html");
  }, 240_000);
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const forms = (html) => [...html.matchAll(/<form\b[\s\S]*?<\/form>/g)];

  it("posts to exactly the Buttondown endpoint for that username", () => {
    for (const html of [page, home]) {
      const found = forms(html);
      expect(found).toHaveLength(1);
      const [form] = found[0];
      expect(form).toContain(`action="${ACTION}"`);
      expect(form).toMatch(/method="post"/);
      // Documented field names: a visible `email` plus hidden `embed=1`.
      expect(form).toMatch(/<input[^>]*type="email"[^>]*name="email"/);
      expect(form).toMatch(
        /<input[^>]*type="hidden"[^>]*name="embed"[^>]*value="1"/,
      );
      expect(form).toMatch(/type="submit"/);
    }
  });

  it("labels the email input and describes it with the privacy hint", () => {
    for (const [html, id] of [
      [page, "newsletter-page"],
      [home, "footer-newsletter"],
    ]) {
      const [form] = forms(html)[0];
      expect(form).toMatch(
        new RegExp(`<label[^>]*for="${id}-email"[^>]*>Email address</label>`),
      );
      expect(form).toMatch(
        new RegExp(`<input id="${id}-email"[^>]*aria-describedby="${id}-hint"`),
      );
      expect(form).toContain(`id="${id}-hint"`);
      expect(form).toContain(BUTTONDOWN_PRIVACY_URL);
      expect(form).toContain('href="/guide/privacy/#newsletter"');
    }
  });

  it("does not repeat the footer form on /newsletter/ itself", () => {
    expect(page).not.toContain('id="footer-newsletter-email"');
    expect(page).toContain('id="newsletter-page-email"');
  });

  it("works without JavaScript: no script targets Buttondown, form is not intercepted", () => {
    for (const html of [page, home]) {
      const srcs = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(
        (m) => m[1],
      );
      expect(srcs.length).toBeGreaterThan(0);
      expect(srcs.filter((s) => /buttondown/i.test(s))).toEqual([]);
    }
    // No inline script mentions the endpoint either.
    const inline = [
      ...page.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g),
    ];
    expect(inline.filter((m) => /buttondown/i.test(m[1]))).toEqual([]);
    // The site's own scripts never wire up or fetch the endpoint.
    expect(read(dir, "js/assistant.js")).not.toMatch(/embed-subscribe/);
  });

  it("links to /newsletter/ from the footer and lists it in the sitemap", () => {
    expect(home).toContain('<a href="/guide/newsletter/">Newsletter</a>');
    const sitemap = read(dir, "sitemap.xml");
    expect(sitemap).toContain(
      "<loc>https://newsletter-check.example.org/guide/newsletter/</loc>",
    );
  });

  it("is indexable and no longer says it is not open", () => {
    expect(robotsMeta(page)).toContain("index,follow");
    expect(robotsMeta(page)).not.toContain("noindex");
    expect(page).not.toMatch(NOT_OPEN);
  });

  it("discloses on /newsletter/ and /privacy/ what is sent, to whom, and when", () => {
    const privacy = read(dir, "privacy/index.html");
    for (const html of [page, privacy]) {
      expect(html).toMatch(/email address/i);
      expect(html).toMatch(/buttondown\.com/);
      expect(html).toMatch(/press(es)? Subscribe/);
      expect(html).toContain(`href="${BUTTONDOWN_PRIVACY_URL}"`);
    }
    expect(privacy).toMatch(/Nothing is sent as you type/);
  });
});

describe("production build, BUTTONDOWN_USERNAME hostile", () => {
  let dir;
  let output;
  beforeAll(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), "ltcdc-news-bad-"));
    output = build(dir, {
      BUTTONDOWN_USERNAME: 'x"><script>alert(1)</script>',
    });
  }, 240_000);
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("is treated as unset: warns once in the build log, renders nothing", () => {
    expect(output).toContain("[newsletter] BUTTONDOWN_USERNAME contains");
    expect(output).not.toContain("alert(1)");
    const home = read(dir, "index.html");
    expect(home).not.toContain("<form");
    expect(home).not.toContain("alert(1)");
    const page = read(dir, "newsletter/index.html");
    expect(page).toMatch(NOT_OPEN);
    expect(page).not.toContain("alert(1)");
    expect(read(dir, "sitemap.xml")).not.toContain("/newsletter/");
  });
});
