/**
 * Guard: /.well-known/security.txt and the /contact/ page (P17-29).
 *
 * Runs one real production Eleventy build into a scratch directory on a
 * made-up host and prefix, so nothing here depends on the live domain, then
 * checks what a reporter or a crawler can actually fetch: the RFC 9116 file
 * with its required fields, a contact page that is in the sitemap and
 * llms.txt, linked from the footer, privacy and methodology pages, and an
 * address that appears only where intended.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
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
const BASE = `${HOST}${PREFIX}`;

const author = (await import("../../src/_data/author.mjs")).default;
const EMAIL = author.contactEmail;

const DAY_MS = 24 * 60 * 60 * 1000;

describe("security.txt and the contact page (built)", () => {
  let out;
  let sec;
  let contact;
  let sitemap;
  let llms;
  const read = (rel) => readFileSync(path.join(out, rel), "utf8");
  const fields = (txt, name) =>
    txt
      .split("\n")
      .filter((l) => l.toLowerCase().startsWith(`${name.toLowerCase()}:`))
      .map((l) => l.slice(name.length + 1).trim());

  beforeAll(() => {
    out = mkdtempSync(path.join(os.tmpdir(), "ltcdc-seccontact-"));
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
    sec = read(".well-known/security.txt");
    contact = read("contact/index.html");
    sitemap = read("sitemap.xml");
    llms = read("llms.txt");
  }, 240_000);

  afterAll(() => {
    if (out) rmSync(out, { recursive: true, force: true });
  });

  describe("/.well-known/security.txt (RFC 9116)", () => {
    it("is written to .well-known/security.txt in the built site", () => {
      expect(existsSync(path.join(out, ".well-known", "security.txt"))).toBe(
        true,
      );
    });

    it("has a mailto Contact with the designated public address", () => {
      expect(EMAIL).toBe("cennisc@gmail.com");
      expect(fields(sec, "Contact")).toEqual([`mailto:${EMAIL}`]);
    });

    it("has exactly one Expires, in the future and under 400 days ahead", () => {
      const [expires, ...more] = fields(sec, "Expires");
      expect(more).toEqual([]);
      // RFC 3339 / ISO 8601 timestamp with a zone.
      expect(expires).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/,
      );
      const ms = Date.parse(expires) - Date.now();
      expect(Number.isNaN(ms)).toBe(false);
      expect(ms).toBeGreaterThan(0);
      expect(ms).toBeLessThan(400 * DAY_MS);
    });

    it("has Preferred-Languages: en", () => {
      expect(fields(sec, "Preferred-Languages")).toEqual(["en"]);
    });

    it("builds Canonical from site.host and the file's own path", () => {
      expect(fields(sec, "Canonical")).toEqual([
        `${BASE}/.well-known/security.txt`,
      ]);
    });

    it("points Policy at SECURITY.md and the contact page's security anchor", () => {
      expect(fields(sec, "Policy")).toEqual([
        "https://github.com/sandgraal/letstalkcdc/blob/main/SECURITY.md",
        `${BASE}/contact/#security`,
      ]);
      expect(existsSync(path.join(ROOT, "SECURITY.md"))).toBe(true);
      expect(contact).toContain('id="security"');
    });

    it("is plain text with no HTML and no host other than the configured one", () => {
      expect(sec).not.toMatch(/<[a-z]/i);
      const hosts = [...sec.matchAll(/https?:\/\/([^/\s]+)/g)].map((m) => m[1]);
      for (const h of hosts) expect(["example.org", "github.com"]).toContain(h);
    });
  });

  describe("/contact/", () => {
    it("is built, has exactly one h1 and a clean heading outline", () => {
      expect(contact.match(/<h1[\s>]/g)).toHaveLength(1);
      const levels = [...contact.matchAll(/<h([1-6])[\s>]/g)].map((m) =>
        Number(m[1]),
      );
      for (let i = 1; i < levels.length; i++)
        expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1);
    });

    it("is indexable, with a self-referencing canonical, og tags and a short description", () => {
      expect(contact).not.toMatch(/<meta[^>]*name="robots"[^>]*noindex/i);
      expect(contact).toContain(
        `<link rel="canonical" href="${BASE}/contact/">`,
      );
      expect(contact).toMatch(
        /<meta[^>]*property="og:title"[^>]*content="[^"]+"/,
      );
      expect(contact).toMatch(/<meta[^>]*property="og:url"[^>]*contact\//);
      const desc = contact.match(
        /<meta[^>]*name="description"[^>]*content="([^"]*)"/,
      )?.[1];
      expect(desc).toBeTruthy();
      expect(desc.length).toBeLessThanOrEqual(160);
      // Every JSON-LD block parses.
      for (const m of contact.matchAll(
        /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
      ))
        expect(() => JSON.parse(m[1])).not.toThrow();
    });

    it("appears in sitemap.xml and llms.txt", () => {
      expect(sitemap).toContain(`<loc>${BASE}/contact/</loc>`);
      expect(llms).toContain(`](${BASE}/contact/)`);
    });

    it("is linked from the footer of another page, from /privacy/ and from /methodology/", () => {
      const link = `href="${PREFIX}/contact/"`;
      const intro = read("intro/index.html");
      const footer = intro.slice(intro.indexOf("<footer"));
      expect(footer).toContain(link);
      expect(read("privacy/index.html")).toContain(link);
      expect(read("methodology/index.html")).toContain(link);
    });

    it("offers a way to report a content error, a security issue and a general message", () => {
      expect(contact).toContain(
        "https://github.com/sandgraal/letstalkcdc/issues/new?template=content-error.yml",
      );
      expect(contact).toContain(`href="${PREFIX}/errata/"`);
      expect(contact).toContain(`href="${PREFIX}/.well-known/security.txt"`);
      expect(contact).toContain("blob/main/SECURITY.md");
      expect(contact).toContain(`href="mailto:${EMAIL}"`);
      expect(contact).toContain('id="general"');
    });

    it("says content is AI-assisted without claiming a review or a reply time", () => {
      expect(contact).toMatch(/drafted with AI assistance/);
      expect(contact).not.toMatch(/SME[- ]reviewed/i);
      expect(contact).not.toMatch(/within \d+|hours|business days|24\/7/i);
      expect(contact).toMatch(/not guaranteed|no promised reply time/i);
    });
  });

  describe("the address appears only where intended", () => {
    it("is on the contact page and in security.txt, and in no <title>, meta tag or JSON-LD", () => {
      expect(contact).toContain(EMAIL);
      expect(sec).toContain(EMAIL);
      const title = contact.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "";
      expect(title).not.toContain("@");
      const metas = contact.match(/<meta[^>]*>/g)?.join("\n") ?? "";
      expect(metas).not.toContain(EMAIL);
      const ld = [
        ...contact.matchAll(
          /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
        ),
      ]
        .map((m) => m[1])
        .join("\n");
      expect(ld).not.toContain(EMAIL);
    });

    it("is not on the other pages, the sitemap or llms.txt", () => {
      for (const rel of [
        "intro/index.html",
        "privacy/index.html",
        "methodology/index.html",
        "errata/index.html",
        "index.html",
      ])
        expect(read(rel), rel).not.toContain(EMAIL);
      expect(sitemap).not.toContain(EMAIL);
      expect(llms).not.toContain(EMAIL);
    });
  });
});
