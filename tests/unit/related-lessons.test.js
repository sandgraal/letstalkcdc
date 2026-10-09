/**
 * Guard: every lesson ends with a data-driven "Related lessons" list (P16-8).
 *
 * The first half checks the data in src/_data/series.mjs: each lesson names a
 * few other lessons by key, never itself, never twice, and every key is a real
 * lesson with a page. The second half runs one production Eleventy build into
 * a scratch directory (made-up host and prefix) and checks what a reader gets:
 * the list shows the lessons the data names, in the data's order, each link
 * carries the path prefix, points at a built page that is also in the
 * sitemap, and is not a link back to the page itself.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

import series from "../../src/_data/series.mjs";

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
const PREFIX = "/site";
const HOST = "https://example.org";

const lessons = series.filter((s) => s.href && s.state !== "disabled");
const byKey = new Map(series.map((s) => [s.key, s]));
const pathOf = (s) => `${PREFIX}/${s.href}`;

describe("related lessons data", () => {
  it("gives every lesson two to four related lessons", () => {
    for (const lesson of lessons) {
      expect(Array.isArray(lesson.related), lesson.key).toBe(true);
      expect(lesson.related.length, lesson.key).toBeGreaterThanOrEqual(2);
      expect(lesson.related.length, lesson.key).toBeLessThanOrEqual(4);
    }
  });

  it("never lists a lesson as related to itself or lists one twice", () => {
    for (const lesson of lessons) {
      expect(lesson.related, lesson.key).not.toContain(lesson.key);
      expect(new Set(lesson.related).size, lesson.key).toBe(
        lesson.related.length,
      );
    }
  });

  it("only names lessons that exist and have a page", () => {
    for (const lesson of lessons) {
      for (const key of lesson.related) {
        const target = byKey.get(key);
        expect(target, `${lesson.key} -> ${key}`).toBeDefined();
        expect(target.href, `${lesson.key} -> ${key}`).toBeTruthy();
        expect(target.state, `${lesson.key} -> ${key}`).not.toBe("disabled");
      }
    }
  });

  it("gives every lesson at least one inbound related link", () => {
    const inbound = new Map(lessons.map((l) => [l.key, 0]));
    for (const lesson of lessons) {
      for (const key of lesson.related) {
        inbound.set(key, (inbound.get(key) ?? 0) + 1);
      }
    }
    for (const [key, count] of inbound) {
      expect(count, key).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("related lessons on the built site", () => {
  let out;
  let sitemapPaths;

  // These two lessons have no `seriesKey` in their page data, so the layout
  // renders no series navigation (and so no Related lessons) on them. They
  // stay targets of other lessons' lists. Giving them a `seriesKey` also turns
  // on progress tracking and the page-meta block, which is a separate decision.
  const NO_SERIES_NAV = ["cloud-labs", "failure-drills"];
  const withNav = () => lessons.filter((l) => !NO_SERIES_NAV.includes(l.key));

  const read = (href) => {
    const file = path.join(out, href, "index.html");
    expect(existsSync(file), href).toBe(true);
    return readFileSync(file, "utf8");
  };

  /** Visible "Related lessons" links on a built lesson page, in page order. */
  const relatedLinks = (html) => {
    const doc = new JSDOM(html).window.document;
    const heading = doc.getElementById("related-lessons-heading");
    expect(heading, "Related lessons heading").not.toBeNull();
    expect(heading.textContent.trim()).toBe("Related lessons");
    return [...heading.parentElement.querySelectorAll("li > a")].map((a) => ({
      href: a.getAttribute("href"),
      text: a.textContent.trim(),
    }));
  };

  beforeAll(() => {
    out = mkdtempSync(path.join(os.tmpdir(), "ltcdc-related-"));
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
    const xml = readFileSync(path.join(out, "sitemap.xml"), "utf8");
    sitemapPaths = new Set(
      [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) =>
        m[1].replace(HOST, ""),
      ),
    );
  }, 240_000);

  afterAll(() => {
    if (out) rmSync(out, { recursive: true, force: true });
  });

  it("renders no series navigation on the pages listed as having none", () => {
    for (const key of NO_SERIES_NAV) {
      expect(read(byKey.get(key).href), key).not.toContain(
        'aria-label="Series navigation"',
      );
    }
  });

  it("lists the related lessons in the data's order on every lesson page", () => {
    expect(withNav().length).toBeGreaterThanOrEqual(30);
    for (const lesson of withNav()) {
      const links = relatedLinks(read(lesson.href));
      expect(
        links.map((l) => l.href),
        lesson.key,
      ).toEqual(lesson.related.map((k) => pathOf(byKey.get(k))));
      expect(
        links.map((l) => l.text),
        lesson.key,
      ).toEqual(lesson.related.map((k) => byKey.get(k).title));
    }
  });

  it("links only to pages that are built and in the sitemap, never to itself", () => {
    for (const lesson of withNav()) {
      for (const { href } of relatedLinks(read(lesson.href))) {
        expect(href, lesson.key).not.toBe(pathOf(lesson));
        expect(href.startsWith(`${PREFIX}/`), `${lesson.key} ${href}`).toBe(
          true,
        );
        expect(
          existsSync(path.join(out, href.slice(PREFIX.length), "index.html")),
          `${lesson.key} -> ${href} is built`,
        ).toBe(true);
        expect(
          sitemapPaths.has(href),
          `${lesson.key} -> ${href} is in the sitemap`,
        ).toBe(true);
      }
    }
  });
});
