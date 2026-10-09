/**
 * Guard: the published playground has an honest, single, absolute SEO head
 * (P16-11, audit finding F-13).
 *
 * playground/index.html is a static file Eleventy never builds, so its
 * canonical and Open Graph URLs carry a `__SITE_URL__` placeholder that
 * scripts/publish-playground.sh fills from SITE_HOST and
 * ELEVENTY_PATH_PREFIX. These tests run the real publish script into a
 * scratch directory under a made-up host and prefix and read what a crawler
 * would read, so they follow the variables and not the live domain.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  SITE_URL_PLACEHOLDER,
  renderPlaygroundHtml,
} from "../../scripts/render-playground-html.mjs";
import seo from "../../src/_data/seo.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const SOURCE = readFileSync(path.join(ROOT, "playground/index.html"), "utf8");

const HOST = "https://playground-check.example.org";
const PREFIX = "/docs-site";
const BASE = `${HOST}${PREFIX}`;
const PAGE_URL = `${BASE}/playground/`;

const headOf = (html) => {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const all = (sel) => [...doc.head.querySelectorAll(sel)];
  const one = (sel, attr) => {
    const found = all(sel);
    expect(found, sel).toHaveLength(1);
    return attr ? found[0].getAttribute(attr) : found[0].textContent;
  };
  return { doc, all, one };
};

describe("playground/index.html source", () => {
  it("keeps the placeholder in every URL the head publishes", () => {
    const { all } = headOf(SOURCE);
    const urls = [
      ...all('link[rel="canonical"]').map((el) => el.getAttribute("href")),
      ...all('meta[property="og:url"], meta[property="og:image"]').map((el) =>
        el.getAttribute("content"),
      ),
      ...all('meta[name="twitter:image"]').map((el) =>
        el.getAttribute("content"),
      ),
    ];
    expect(urls).toHaveLength(4);
    for (const url of urls)
      expect(url.startsWith(SITE_URL_PLACEHOLDER)).toBe(true);
  });

  it("does not hardcode the production host in the new head tags", () => {
    const head = SOURCE.slice(0, SOURCE.indexOf("</head>"));
    expect(head).not.toMatch(/github\.io/);
  });
});

describe("renderPlaygroundHtml", () => {
  it("replaces every placeholder with the given site URL", () => {
    const out = renderPlaygroundHtml(SOURCE, BASE);
    expect(out).not.toContain(SITE_URL_PLACEHOLDER);
    expect(out).toContain(`href="${PAGE_URL}"`);
  });

  it("works for a site served from the domain root", () => {
    const out = renderPlaygroundHtml(SOURCE, HOST);
    expect(out).toContain(`href="${HOST}/playground/"`);
  });

  it("refuses a source with no placeholder or a value that is not a clean URL", () => {
    expect(() => renderPlaygroundHtml("<head></head>", BASE)).toThrow(
      /placeholder/,
    );
    expect(() => renderPlaygroundHtml(SOURCE, `${BASE}/`)).toThrow(/Unusable/);
    expect(() => renderPlaygroundHtml(SOURCE, 'https://x.org/"><')).toThrow(
      /Unusable/,
    );
    expect(() => renderPlaygroundHtml(SOURCE, "")).toThrow(/Unusable/);
  });
});

describe("published playground (scripts/publish-playground.sh)", () => {
  let out;
  let html;

  beforeAll(() => {
    out = mkdtempSync(path.join(os.tmpdir(), "ltcdc-playground-"));
    execFileSync("bash", ["scripts/publish-playground.sh", out], {
      cwd: ROOT,
      stdio: "pipe",
      env: {
        ...process.env,
        GITHUB_REPOSITORY: "",
        SITE_HOST: HOST,
        ELEVENTY_PATH_PREFIX: PREFIX,
      },
    });
    html = readFileSync(path.join(out, "playground/index.html"), "utf8");
  }, 60_000);

  afterAll(() => {
    if (out) rmSync(out, { recursive: true, force: true });
  });

  it("still publishes the page, its logo and its assets", () => {
    expect(existsSync(path.join(out, "playground/CDC_logo.png"))).toBe(true);
    expect(existsSync(path.join(out, "playground/assets/app.js"))).toBe(true);
    expect(html).not.toContain(SITE_URL_PLACEHOLDER);
  });

  it("has exactly one title, description, canonical and robots tag", () => {
    const { one } = headOf(html);
    expect(one("title")).toMatch(/\S/);
    expect(one('meta[name="description"]', "content")).toMatch(/\S/);
    expect(one('link[rel="canonical"]', "href")).toMatch(/\S/);
    expect(one('meta[name="robots"]', "content")).toMatch(/\S/);
  });

  it("has a title and description that fit a search result and say what the page is", () => {
    const { one } = headOf(html);
    const title = one("title");
    const description = one('meta[name="description"]', "content");
    expect(title.length).toBeLessThanOrEqual(60);
    expect(title).toContain("Let’s Talk CDC");
    expect(description.length).toBeGreaterThanOrEqual(70);
    expect(description.length).toBeLessThanOrEqual(160);
    expect(description).toMatch(/made-up/);
  });

  it("is indexable", () => {
    const { one } = headOf(html);
    const robots = one('meta[name="robots"]', "content");
    expect(robots).toMatch(/\bindex\b/);
    expect(robots).toMatch(/\bfollow\b/);
    expect(robots).not.toMatch(/noindex|nofollow/);
  });

  it("has an absolute canonical and og:url on the configured host and prefix", () => {
    const { one } = headOf(html);
    expect(one('link[rel="canonical"]', "href")).toBe(PAGE_URL);
    expect(one('meta[property="og:url"]', "content")).toBe(PAGE_URL);
  });

  it("repeats the title and description in the social cards", () => {
    const { one } = headOf(html);
    const title = one("title");
    const description = one('meta[name="description"]', "content");
    expect(one('meta[property="og:title"]', "content")).toBe(title);
    expect(one('meta[name="twitter:title"]', "content")).toBe(title);
    expect(one('meta[property="og:description"]', "content")).toBe(description);
    expect(one('meta[name="twitter:description"]', "content")).toBe(
      description,
    );
    expect(one('meta[property="og:type"]', "content")).toBe("website");
    expect(one('meta[name="twitter:card"]', "content")).toBe(
      "summary_large_image",
    );
  });

  it("points og:image and twitter:image at the site cover, which exists on disk", () => {
    const { one } = headOf(html);
    const image = one('meta[property="og:image"]', "content");
    expect(image).toBe(`${BASE}${seo.ogImage.path}`);
    expect(one('meta[name="twitter:image"]', "content")).toBe(image);
    expect(one('meta[property="og:image:width"]', "content")).toBe(
      String(seo.ogImage.width),
    );
    expect(one('meta[property="og:image:height"]', "content")).toBe(
      String(seo.ogImage.height),
    );
    expect(one('meta[property="og:image:alt"]', "content")).toBeTruthy();

    // Passed through from src/static/ to the site root by Eleventy.
    const file = path.join(ROOT, "src/static", seo.ogImage.path);
    expect(existsSync(file)).toBe(true);
    expect(statSync(file).size).toBeGreaterThan(0);
  });

  it("never uses the 'Lets Talk CDC' spelling in the head", () => {
    const head = html.slice(0, html.indexOf("</head>"));
    expect(head).not.toMatch(/Lets Talk CDC/i);
  });
});
