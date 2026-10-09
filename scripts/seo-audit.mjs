#!/usr/bin/env node
/**
 * SEO audit of the BUILT site (P16-12).
 *
 * Reads `_site/` (or `--site <dir>`), measures the things the October 2026
 * baseline audit (docs/seo-audit-2026-10.md) measured, prints a compact
 * table and writes the full result, including the lists behind every count,
 * as JSON. It only reads; it never changes the site and always exits 0
 * unless it cannot read the site (exit 2). It is a measuring tool, not a
 * gate: the unit tests are the gates.
 *
 *   npm run build && npm run audit:seo
 *   node scripts/seo-audit.mjs --site _site --json seo-audit.json --verbose
 *
 * Options
 *   --site <dir>   built site (default _site)
 *   --host <url>   public base incl. path prefix, e.g.
 *                  https://sandgraal.github.io/letstalkcdc (default: the
 *                  canonical of the home page, minus its trailing slash)
 *   --json <file>  where to write the JSON (default seo-audit.json)
 *   --repo <dir>   git checkout used for the dateModified check (default .)
 *   --rev <rev>    commit-ish the history check looks back from (default
 *                  HEAD); use it to audit an older build against its own past
 *   --no-git       skip the dateModified-versus-git check
 *   --verbose      also print the pages behind each count
 *   --quiet        print nothing but the JSON path
 *
 * Definitions (kept identical to the 2026-10 audit so numbers compare):
 *   - "content page": an .html file that is not a meta-refresh redirect stub
 *     and not 404.html.
 *   - "content link": an <a href> that is not inside .global-header or
 *     .site-footer (so prev/next series navigation counts).
 *   - heading skips are measured inside <main>, in document order.
 *   - Article staleness compares the Article JSON-LD `dateModified` with the
 *     date of the last commit that touched `src/<slug>/`. A commit may be a
 *     non-content change, so it is an upper bound, not proof.
 *
 * Parsing uses jsdom (already a devDependency); no new dependency.
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";

export const TITLE_TARGET = 60;
export const TITLE_MAX = 70;
export const DESCRIPTION_MAX = 160;
export const DESCRIPTION_MIN = 70;
export const MIN_CONTENT_INBOUND = 3;
export const STALE_DAYS = 30;

/** Published by scripts/publish-playground.sh after the build, so absent from `_site/`. */
const PUBLISHED_AFTER_BUILD = ["/playground/"];

const GENERIC_LINK_TEXT =
  /^(click here|here|read more|learn more|more|link|this|this page|see more|details)\.?$/i;

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
  );

const squash = (s) => s.replace(/\s+/g, " ").trim();
const countBy = (items) =>
  items.reduce((acc, k) => ((acc[k] = (acc[k] || 0) + 1), acc), {});
const groupDuplicates = (pairs) => {
  const map = new Map();
  for (const [value, url] of pairs) {
    if (!value) continue;
    if (!map.has(value)) map.set(value, []);
    map.get(value).push(url);
  }
  return [...map.entries()]
    .filter(([, urls]) => urls.length > 1)
    .map(([value, urls]) => ({ value, urls }));
};

/** Parse one HTML file into the small model every measurement reads. */
function parsePage(siteDir, file) {
  const rel = path.relative(siteDir, file).split(path.sep).join("/");
  const html = readFileSync(file, "utf8");
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const q = (sel) => [...doc.querySelectorAll(sel)];
  const attr = (sel, name) =>
    doc.querySelector(sel)?.getAttribute(name) ?? null;

  const isIndex = rel === "index.html" || rel.endsWith("/index.html");
  const urlPath = isIndex ? `/${rel.replace(/index\.html$/, "")}` : `/${rel}`;

  const main = doc.querySelector("main");
  const headings = q("h1,h2,h3,h4,h5,h6").map((el) => ({
    level: Number(el.tagName[1]),
    text: squash(el.textContent),
    inMain: Boolean(main && main.contains(el)),
  }));

  const jsonld = q('script[type="application/ld+json"]').map((el) => {
    try {
      return { ok: true, json: JSON.parse(el.textContent) };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  });

  const links = q("a[href]").map((el) => ({
    href: el.getAttribute("href"),
    text: squash(el.textContent),
    label: el.getAttribute("aria-label"),
    inChrome: Boolean(el.closest(".global-header, .site-footer")),
  }));

  const og = {};
  for (const el of q('meta[property^="og:"]'))
    og[el.getAttribute("property")] = el.getAttribute("content");
  const twitter = {};
  for (const el of q('meta[name^="twitter:"]'))
    twitter[el.getAttribute("name")] = el.getAttribute("content");

  const result = {
    file: rel,
    urlPath,
    title: doc.querySelector("title")?.textContent ?? "",
    description: attr('meta[name="description"]', "content"),
    // Every robots meta, joined: a crawler combines them, and the most
    // restrictive directive wins, so "noindex" anywhere means noindex.
    robots:
      q('meta[name="robots"]')
        .map((el) => el.getAttribute("content"))
        .join(", ") || null,
    robotsMetaCount: q('meta[name="robots"]').length,
    canonical: attr('link[rel="canonical"]', "href"),
    refresh: attr('meta[http-equiv="refresh"]', "content"),
    og,
    twitter,
    headings,
    h1Count: q("h1").length,
    hasMain: Boolean(main),
    jsonld,
    images: q("img").map((el) => ({
      src: el.getAttribute("src"),
      hasAlt: el.hasAttribute("alt"),
    })),
    links,
    ids: new Set(q("[id]").map((el) => el.id)),
    hasFeedLink: q('link[rel="alternate"][type="application/rss+xml"]').length,
    visibleBreadcrumb:
      q('nav[aria-label*="readcrumb" i], [class*="breadcrumb"]').length > 0,
    lang: doc.documentElement.getAttribute("lang"),
  };
  dom.window.close();
  return result;
}

const flattenLd = (blocks) =>
  blocks
    .filter((b) => b.ok)
    .flatMap((b) =>
      Array.isArray(b.json)
        ? b.json
        : b.json?.["@graph"]
          ? b.json["@graph"]
          : [b.json],
    );
const typesOf = (node) => [].concat(node?.["@type"] ?? []);

function lastCommitDate(repo, relPath, rev) {
  try {
    return (
      execFileSync(
        "git",
        ["-C", repo, "log", "-1", "--format=%cs", rev, "--", relPath],
        {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        },
      ).trim() || null
    );
  } catch {
    return null;
  }
}

/**
 * Run every measurement.
 * @param {string} siteDir built site directory
 * @param {{host?: string, repo?: string, git?: boolean}} [options]
 * @returns {{meta: object, metrics: Record<string, number|string>, details: Record<string, unknown>}}
 */
export function auditSite(siteDir, options = {}) {
  if (!existsSync(siteDir))
    throw new Error(`site directory not found: ${siteDir}`);
  const files = walk(siteDir).filter((f) => f.endsWith(".html"));
  const all = files
    .map((f) => parsePage(siteDir, f))
    .sort((a, b) => a.urlPath.localeCompare(b.urlPath));
  const stubs = all.filter((p) => p.refresh);
  const pages = all.filter((p) => !p.refresh && p.file !== "404.html");
  if (pages.length === 0)
    throw new Error(`no content pages found in ${siteDir}`);

  const home = all.find((p) => p.urlPath === "/");
  const host = (
    options.host ||
    home?.canonical?.replace(/\/$/, "") ||
    ""
  ).replace(/\/$/, "");
  if (!host) throw new Error("cannot work out the host; pass --host");
  const hostUrl = new URL(host);
  const origin = hostUrl.origin;
  const prefix = hostUrl.pathname.replace(/\/$/, "");

  const byPath = new Map(all.map((p) => [p.urlPath, p]));
  const pageByPath = new Map(pages.map((p) => [p.urlPath, p]));
  const metrics = {};
  const details = {};
  const m = (key, value, list) => {
    metrics[key] = value;
    if (list !== undefined) details[key] = list;
  };

  // ---- inventory
  m("inventory.htmlFiles", all.length);
  m("inventory.contentPages", pages.length);
  m("inventory.redirectStubs", stubs.length);
  const noindexPages = pages.filter((p) => /noindex/i.test(p.robots || ""));
  m(
    "inventory.noindexContentPages",
    noindexPages.length,
    noindexPages.map((p) => p.urlPath),
  );
  const multiRobots = pages.filter((p) => p.robotsMetaCount > 1);
  m(
    "inventory.pagesWithMoreThanOneRobotsMeta",
    multiRobots.length,
    multiRobots.map((p) => `${p.urlPath} :: ${p.robots}`),
  );

  // ---- titles
  const lens = pages.map((p) => ({
    url: p.urlPath,
    n: p.title.length,
    title: p.title,
  }));
  const sorted = lens.map((x) => x.n).sort((a, b) => a - b);
  m(
    "titles.missing",
    lens.filter((x) => x.n === 0).length,
    lens.filter((x) => x.n === 0).map((x) => x.url),
  );
  m(
    "titles.over60",
    lens.filter((x) => x.n > TITLE_TARGET).length,
    lens
      .filter((x) => x.n > TITLE_TARGET)
      .sort((a, b) => b.n - a.n)
      .map((x) => `${x.n} ${x.url} :: ${x.title}`),
  );
  m(
    "titles.over70",
    lens.filter((x) => x.n > TITLE_MAX).length,
    lens.filter((x) => x.n > TITLE_MAX).map((x) => `${x.n} ${x.url}`),
  );
  m("titles.maxLength", Math.max(...lens.map((x) => x.n)));
  m("titles.medianLength", sorted[Math.floor(sorted.length / 2)]);
  const dupTitles = groupDuplicates(pages.map((p) => [p.title, p.urlPath]));
  m("titles.duplicateGroups", dupTitles.length, dupTitles);
  // The brand is whatever the most common " | X" suffix is; no hardcoded name.
  const suffixes = countBy(
    pages.map((p) => (p.title.match(/ \| ([^|]+)$/) || [])[1]).filter(Boolean),
  );
  const brand =
    Object.entries(suffixes).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  m("titles.brandSuffix", brand);
  const doubled = brand
    ? pages.filter((p) => p.title.split(brand).length > 2)
    : [];
  m(
    "titles.doubledBrand",
    doubled.length,
    doubled.map((p) => p.urlPath),
  );
  const noSuffix = brand
    ? pages.filter((p) => !p.title.endsWith(` | ${brand}`))
    : [];
  m(
    "titles.withoutBrandSuffix",
    noSuffix.length,
    noSuffix.map((p) => `${p.urlPath} :: ${p.title}`),
  );

  // ---- descriptions
  const noDesc = pages.filter((p) => !p.description);
  m(
    "descriptions.missing",
    noDesc.length,
    noDesc.map((p) => p.urlPath),
  );
  const withDesc = pages.filter((p) => p.description);
  const over = withDesc.filter((p) => p.description.length > DESCRIPTION_MAX);
  m(
    "descriptions.over160",
    over.length,
    over.map((p) => `${p.description.length} ${p.urlPath}`),
  );
  const under = withDesc.filter((p) => p.description.length < DESCRIPTION_MIN);
  m(
    "descriptions.under70",
    under.length,
    under.map((p) => `${p.description.length} ${p.urlPath}`),
  );
  const dupDesc = groupDuplicates(pages.map((p) => [p.description, p.urlPath]));
  m("descriptions.duplicateGroups", dupDesc.length, dupDesc);

  // ---- canonical
  const canonBad = pages.filter((p) => p.canonical !== `${host}${p.urlPath}`);
  m(
    "canonical.notSelfReferencing",
    canonBad.length,
    canonBad.map((p) => `${p.urlPath} => ${p.canonical}`),
  );
  m(
    "canonical.missing",
    pages.filter((p) => !p.canonical).length,
    pages.filter((p) => !p.canonical).map((p) => p.urlPath),
  );
  const stubBad = stubs.filter((s) => {
    const target = (s.refresh.split(/url=/i)[1] || "").trim();
    const targetPath =
      prefix && target.startsWith(prefix)
        ? target.slice(prefix.length)
        : target;
    return !(
      s.canonical === `${host}${targetPath}` && pageByPath.has(targetPath)
    );
  });
  m(
    "canonical.stubsNotPointingAtLiveTarget",
    stubBad.length,
    stubBad.map((s) => s.file),
  );

  // ---- headings
  const headingIssues = [];
  for (const p of pages) {
    const issues = [];
    if (p.h1Count !== 1) issues.push(`h1 count ${p.h1Count}`);
    if (!p.hasMain) issues.push("no <main>");
    let prev = 0;
    for (const h of p.headings.filter((x) => x.inMain)) {
      if (prev && h.level > prev + 1)
        issues.push(`h${prev}->h${h.level} "${h.text.slice(0, 40)}"`);
      prev = h.level;
    }
    if (issues.length) headingIssues.push({ url: p.urlPath, issues });
  }
  m(
    "headings.pagesWithNoH1",
    pages.filter((p) => p.h1Count === 0).length,
    pages.filter((p) => p.h1Count === 0).map((p) => p.urlPath),
  );
  m(
    "headings.pagesWithMultipleH1",
    pages.filter((p) => p.h1Count > 1).length,
    pages.filter((p) => p.h1Count > 1).map((p) => p.urlPath),
  );
  const skipPages = headingIssues.filter((x) =>
    x.issues.some((i) => /^h\d->h\d/.test(i)),
  );
  m("headings.pagesWithLevelSkips", skipPages.length, skipPages);
  m("headings.pagesWithAnyIssue", headingIssues.length, headingIssues);

  // ---- images
  const imgs = pages.flatMap((p) =>
    p.images.map((i) => ({ ...i, page: p.urlPath })),
  );
  m("images.total", imgs.length);
  m(
    "images.missingAlt",
    imgs.filter((i) => !i.hasAlt).length,
    imgs.filter((i) => !i.hasAlt).map((i) => `${i.page} ${i.src}`),
  );

  // ---- Open Graph / Twitter
  const noOgImage = pages.filter((p) => !p.og["og:image"]);
  m(
    "social.pagesWithoutOgImage",
    noOgImage.length,
    noOgImage.map((p) => p.urlPath),
  );
  m(
    "social.pagesWithoutOgTitle",
    pages.filter((p) => !p.og["og:title"]).length,
    pages.filter((p) => !p.og["og:title"]).map((p) => p.urlPath),
  );
  const ogUrlBad = pages.filter(
    (p) => p.og["og:url"] && p.og["og:url"] !== p.canonical,
  );
  m(
    "social.ogUrlNotCanonical",
    ogUrlBad.length,
    ogUrlBad.map((p) => `${p.urlPath} og:url=${p.og["og:url"]}`),
  );
  m(
    "social.pagesWithoutTwitterCard",
    pages.filter((p) => !p.twitter["twitter:card"]).length,
    pages.filter((p) => !p.twitter["twitter:card"]).map((p) => p.urlPath),
  );
  const noDims = pages.filter(
    (p) => !p.og["og:image:width"] || !p.og["og:image:height"],
  );
  m(
    "social.pagesWithoutOgImageDimensions",
    noDims.length,
    noDims.map((p) => p.urlPath),
  );
  m(
    "social.pagesWithoutOgImageAlt",
    pages.filter((p) => !p.og["og:image:alt"]).length,
    pages.filter((p) => !p.og["og:image:alt"]).map((p) => p.urlPath),
  );
  m(
    "social.distinctOgImages",
    new Set(pages.map((p) => p.og["og:image"]).filter(Boolean)).size,
    [...new Set(pages.map((p) => p.og["og:image"]).filter(Boolean))],
  );
  m(
    "social.pagesWithoutFeedAutodiscovery",
    pages.filter((p) => !p.hasFeedLink).length,
    pages.filter((p) => !p.hasFeedLink).map((p) => p.urlPath),
  );

  // ---- JSON-LD
  let blocks = 0;
  const parseFailures = [];
  const pageTypes = new Map();
  for (const p of pages) {
    blocks += p.jsonld.length;
    for (const b of p.jsonld)
      if (!b.ok) parseFailures.push(`${p.urlPath}: ${b.error}`);
    pageTypes.set(p.urlPath, flattenLd(p.jsonld).flatMap(typesOf));
  }
  m("jsonld.blocks", blocks);
  m("jsonld.parseFailures", parseFailures.length, parseFailures);
  const typeCounts = countBy([...pageTypes.values()].flatMap((t) => t));
  m("jsonld.pageCountByType", JSON.stringify(typeCounts), typeCounts);
  const noLd = pages.filter((p) => pageTypes.get(p.urlPath).length === 0);
  m(
    "jsonld.pagesWithNone",
    noLd.length,
    noLd.map((p) => p.urlPath),
  );
  const articleTypeSet = new Set([
    "Article",
    "TechArticle",
    "BlogPosting",
    "NewsArticle",
  ]);
  const isArticle = (p) =>
    pageTypes.get(p.urlPath).some((t) => articleTypeSet.has(t));
  const articlePages = pages.filter(isArticle);
  const articleOf = (p) =>
    flattenLd(p.jsonld).find((n) =>
      typesOf(n).some((t) => articleTypeSet.has(t)),
    );
  const REQUIRED = [
    "headline",
    "datePublished",
    "dateModified",
    "author",
    "publisher",
    "mainEntityOfPage",
    "description",
  ];
  const reqMissing = [];
  const noImage = [];
  const badMainEntity = [];
  for (const p of articlePages) {
    const a = articleOf(p);
    for (const k of REQUIRED) if (!a[k]) reqMissing.push(`${p.urlPath} ${k}`);
    if (!a.image) noImage.push(p.urlPath);
    if (a.mainEntityOfPage?.["@id"] !== p.canonical)
      badMainEntity.push(p.urlPath);
  }
  m("jsonld.articlePages", articlePages.length);
  m("jsonld.articleRequiredFieldsMissing", reqMissing.length, reqMissing);
  m("jsonld.articlesWithoutImage", noImage.length, noImage);
  m(
    "jsonld.articleMainEntityNotCanonical",
    badMainEntity.length,
    badMainEntity,
  );
  const twoArticleTypes = pages.filter(
    (p) =>
      pageTypes.get(p.urlPath).filter((t) => articleTypeSet.has(t)).length > 1,
  );
  m(
    "jsonld.pagesWithTwoArticleTypeBlocks",
    twoArticleTypes.length,
    twoArticleTypes.map((p) => p.urlPath),
  );
  m(
    "jsonld.pagesWithBreadcrumbList",
    pages.filter((p) => pageTypes.get(p.urlPath).includes("BreadcrumbList"))
      .length,
    pages
      .filter((p) => pageTypes.get(p.urlPath).includes("BreadcrumbList"))
      .map((p) => p.urlPath),
  );
  m(
    "jsonld.pagesWithVisibleBreadcrumb",
    pages.filter((p) => p.visibleBreadcrumb).length,
    pages.filter((p) => p.visibleBreadcrumb).map((p) => p.urlPath),
  );
  const indexable = pages.filter((p) => !/noindex/i.test(p.robots || ""));
  const noCrumb = indexable.filter(
    (p) =>
      p.urlPath !== "/" && !pageTypes.get(p.urlPath).includes("BreadcrumbList"),
  );
  m(
    "jsonld.indexablePagesWithoutBreadcrumbList",
    noCrumb.length,
    noCrumb.map((p) => p.urlPath),
  );
  const noArticle = indexable.filter((p) => p.urlPath !== "/" && !isArticle(p));
  m(
    "jsonld.indexablePagesWithoutArticle",
    noArticle.length,
    noArticle.map((p) => p.urlPath),
  );
  const dateModifiedValues = countBy(
    articlePages.map((p) => String(articleOf(p).dateModified).slice(0, 10)),
  );
  m(
    "jsonld.distinctArticleDateModified",
    Object.keys(dateModifiedValues).length,
    dateModifiedValues,
  );

  // ---- sitemap
  const sitemapPath = path.join(siteDir, "sitemap.xml");
  const sitemap = existsSync(sitemapPath)
    ? readFileSync(sitemapPath, "utf8")
    : "";
  const entries = [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((x) => ({
    loc: /<loc>([^<]+)<\/loc>/.exec(x[1])?.[1] ?? "",
    lastmod: /<lastmod>([^<]+)<\/lastmod>/.exec(x[1])?.[1] ?? null,
  }));
  const smPaths = entries.map((e) =>
    e.loc.startsWith(host) ? e.loc.slice(host.length) : `FOREIGN:${e.loc}`,
  );
  m("sitemap.entries", entries.length);
  m(
    "sitemap.foreignHostEntries",
    smPaths.filter((x) => x.startsWith("FOREIGN:")).length,
    smPaths.filter((x) => x.startsWith("FOREIGN:")),
  );
  const distinctLastmod = countBy(entries.map((e) => e.lastmod ?? "(none)"));
  m(
    "sitemap.distinctLastmodValues",
    Object.keys(distinctLastmod).length,
    distinctLastmod,
  );
  m(
    "sitemap.entriesWithoutLastmod",
    entries.filter((e) => !e.lastmod).length,
    entries.filter((e) => !e.lastmod).map((e) => e.loc),
  );
  const inSitemap = new Set(smPaths);
  const missingFromSitemap = pages.filter(
    (p) => !inSitemap.has(p.urlPath) && !/noindex/i.test(p.robots || ""),
  );
  m(
    "sitemap.indexablePagesMissing",
    missingFromSitemap.length,
    missingFromSitemap.map((p) => p.urlPath),
  );
  m(
    "sitemap.noindexPagesListed",
    smPaths.filter((x) => /noindex/i.test(byPath.get(x)?.robots || "")).length,
    smPaths.filter((x) => /noindex/i.test(byPath.get(x)?.robots || "")),
  );
  m(
    "sitemap.stubsListed",
    smPaths.filter((x) => byPath.get(x)?.refresh).length,
    smPaths.filter((x) => byPath.get(x)?.refresh),
  );
  const notPages = smPaths.filter(
    (x) => !x.startsWith("FOREIGN:") && !pageByPath.has(x),
  );
  m(
    "sitemap.entriesWithNoBuiltPage",
    notPages.filter((x) => !PUBLISHED_AFTER_BUILD.includes(x)).length,
    notPages.filter((x) => !PUBLISHED_AFTER_BUILD.includes(x)),
  );
  details["sitemap.publishedAfterBuild"] = notPages.filter((x) =>
    PUBLISHED_AFTER_BUILD.includes(x),
  );
  const robotsPath = path.join(siteDir, "robots.txt");
  const robotsTxt = existsSync(robotsPath)
    ? readFileSync(robotsPath, "utf8")
    : "";
  const robotsSitemap = /^Sitemap:\s*(\S+)/im.exec(robotsTxt)?.[1] ?? null;
  m("robots.txtSitemapLine", robotsSitemap ?? "(none)");
  m(
    "robots.txtSitemapMatchesRealSitemap",
    robotsSitemap === `${host}/sitemap.xml` ? "yes" : "no",
  );

  // ---- feed
  const feedPath = path.join(siteDir, "feed.xml");
  const feed = existsSync(feedPath) ? readFileSync(feedPath, "utf8") : "";
  const items = [...feed.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(
    (x) => x[1],
  );
  const tag = (s, t) =>
    (s.match(new RegExp(`<${t}>([^<]*)</${t}>`)) || [])[1] ?? "";
  const itemLinks = items.map((i) => tag(i, "link"));
  const realUrls = new Set(pages.map((p) => `${host}${p.urlPath}`));
  m("feed.items", items.length);
  m(
    "feed.itemsWithoutDescription",
    items.filter((i) => !tag(i, "description")).length,
    items.filter((i) => !tag(i, "description")).map((i) => tag(i, "link")),
  );
  m(
    "feed.itemLinksNotResolving",
    itemLinks.filter((l) => !realUrls.has(l)).length,
    itemLinks.filter((l) => !realUrls.has(l)),
  );
  m("feed.distinctPubDates", new Set(items.map((i) => tag(i, "pubDate"))).size);
  m(
    "feed.newestPubDate",
    items
      .map((i) => tag(i, "pubDate"))
      .sort((a, b) => new Date(b) - new Date(a))[0] ?? "(none)",
  );

  // ---- links
  const existsInSite = (pathname) => {
    const rel = decodeURIComponent(pathname.slice(prefix.length)).replace(
      /^\//,
      "",
    );
    return [rel, `${rel}/index.html`, `${rel}index.html`, `${rel}.html`].some(
      (c) => {
        if (!c) return false;
        const full = path.join(siteDir, c);
        return existsSync(full) && statSync(full).isFile();
      },
    );
  };
  const edges = [];
  const brokenInternal = [];
  const brokenFragments = [];
  const prefixless = [];
  for (const p of all) {
    const base = `${origin}${prefix}${p.urlPath}`;
    for (const l of p.links) {
      if (/^(mailto:|tel:|javascript:|data:|#)/i.test(l.href)) {
        if (
          l.href.startsWith("#") &&
          l.href.length > 1 &&
          !p.ids.has(decodeURIComponent(l.href.slice(1)))
        )
          brokenFragments.push(`${p.urlPath} -> ${l.href}`);
        continue;
      }
      let u;
      try {
        u = new URL(l.href, base);
      } catch {
        continue;
      }
      if (u.origin !== origin) continue;
      if (
        prefix &&
        u.pathname !== prefix &&
        !u.pathname.startsWith(`${prefix}/`)
      ) {
        prefixless.push(`${p.urlPath} -> ${l.href}`);
        continue;
      }
      const rel = u.pathname.slice(prefix.length) || "/";
      if (!existsInSite(u.pathname)) {
        brokenInternal.push({ from: p.urlPath, to: rel });
        continue;
      }
      const target =
        !rel.endsWith("/") && byPath.has(`${rel}/`) ? `${rel}/` : rel;
      edges.push({
        from: p.urlPath,
        to: target,
        text: l.text,
        label: l.label,
        inChrome: l.inChrome,
      });
      if (u.hash.length > 1) {
        const tp = byPath.get(target);
        if (tp && !tp.ids.has(decodeURIComponent(u.hash.slice(1))))
          brokenFragments.push(`${p.urlPath} -> ${rel}${u.hash}`);
      }
    }
  }
  const expected = brokenInternal.filter((x) =>
    PUBLISHED_AFTER_BUILD.includes(x.to),
  );
  const unexpected = brokenInternal.filter(
    (x) => !PUBLISHED_AFTER_BUILD.includes(x.to),
  );
  m("links.internalEdges", edges.length);
  m(
    "links.brokenInternal",
    unexpected.length,
    unexpected.map((x) => `${x.from} -> ${x.to}`),
  );
  m(
    "links.toPagesPublishedAfterBuild",
    expected.length,
    expected.map((x) => `${x.from} -> ${x.to}`),
  );
  m("links.missingPathPrefix", prefixless.length, prefixless);
  m("links.brokenFragments", brokenFragments.length, [
    ...new Set(brokenFragments),
  ]);
  const generic = edges.filter((e) => GENERIC_LINK_TEXT.test(e.text));
  m(
    "links.genericLinkText",
    generic.length,
    generic.map((e) => `${e.from} -> ${e.to} "${e.text}"`),
  );
  const textless = edges.filter((e) => !e.text && !e.label);
  m(
    "links.withoutTextOrLabel",
    textless.length,
    textless.map((e) => `${e.from} -> ${e.to}`),
  );

  const inboundAll = new Map(pages.map((p) => [p.urlPath, new Set()]));
  const inboundContent = new Map(pages.map((p) => [p.urlPath, new Set()]));
  for (const e of edges) {
    const src = byPath.get(e.from);
    if (!src || src.refresh || e.from === "/404.html" || e.from === e.to)
      continue;
    if (!inboundAll.has(e.to)) continue;
    inboundAll.get(e.to).add(e.from);
    if (!e.inChrome) inboundContent.get(e.to).add(e.from);
  }
  const inboundRows = pages
    .map((p) => ({
      url: p.urlPath,
      all: inboundAll.get(p.urlPath).size,
      content: inboundContent.get(p.urlPath).size,
      noindex: /noindex/i.test(p.robots || ""),
    }))
    .sort((a, b) => a.content - b.content || a.all - b.all);
  const indexableRows = inboundRows.filter((r) => !r.noindex);
  m(
    "links.pagesWithZeroInboundAnywhere",
    inboundRows.filter((r) => r.all === 0).length,
    inboundRows.filter((r) => r.all === 0).map((r) => r.url),
  );
  m(
    "links.indexablePagesWithZeroContentInbound",
    indexableRows.filter((r) => r.content === 0).length,
    indexableRows.filter((r) => r.content === 0).map((r) => r.url),
  );
  const thin = indexableRows.filter((r) => r.content < MIN_CONTENT_INBOUND);
  m(
    "links.indexablePagesWithFewerThan3ContentInbound",
    thin.length,
    thin.map((r) => `${r.content} content / ${r.all} total  ${r.url}`),
  );
  const chromeLinked = new Set(
    edges.filter((e) => e.inChrome).map((e) => e.to),
  );
  const notInChrome = pages.filter((p) => !chromeLinked.has(p.urlPath));
  m(
    "links.pagesNotLinkedFromHeaderOrFooter",
    notInChrome.length,
    notInChrome.map((p) => p.urlPath),
  );
  details["links.inboundTable"] = inboundRows;
  const glossaryIn = inboundContent.get("/glossary/");
  m(
    "links.contentPagesLinkingIntoGlossary",
    glossaryIn ? glossaryIn.size : 0,
    glossaryIn ? [...glossaryIn] : [],
  );

  // click depth from home, over content links only
  const depth = new Map([["/", 0]]);
  const queue = ["/"];
  while (queue.length) {
    const cur = queue.shift();
    for (const e of edges) {
      if (
        e.from !== cur ||
        e.inChrome ||
        !pageByPath.has(e.to) ||
        depth.has(e.to)
      )
        continue;
      depth.set(e.to, depth.get(cur) + 1);
      queue.push(e.to);
    }
  }
  const unreachable = pages.filter((p) => !depth.has(p.urlPath));
  m(
    "links.pagesUnreachableViaContentLinks",
    unreachable.length,
    unreachable.map((p) => p.urlPath),
  );
  m("links.maxContentClickDepth", Math.max(...depth.values()));

  // ---- freshness against git
  if (options.git !== false) {
    const repo = options.repo || ".";
    const rows = [];
    for (const p of articlePages) {
      const slug = p.urlPath.replace(/^\/|\/$/g, "");
      if (!slug) continue;
      const last = lastCommitDate(repo, `src/${slug}`, options.rev || "HEAD");
      if (!last) continue;
      const dm = String(articleOf(p).dateModified).slice(0, 10);
      const lag = Math.round((new Date(last) - new Date(dm)) / 86_400_000);
      rows.push({
        url: p.urlPath,
        dateModified: dm,
        lastCommit: last,
        lagDays: lag,
      });
    }
    rows.sort((a, b) => b.lagDays - a.lagDays);
    if (rows.length === 0) {
      m("freshness.articlesChecked", 0);
      m(
        "freshness.note",
        "no git history reachable (shallow clone or no .git); check skipped",
      );
    } else {
      m("freshness.articlesChecked", rows.length);
      const stale = rows.filter((r) => r.lagDays > STALE_DAYS);
      m(
        "freshness.articlesMoreThan30DaysBehindGit",
        stale.length,
        stale.map(
          (r) =>
            `${r.lagDays}d ${r.url} dateModified ${r.dateModified}, last commit ${r.lastCommit}`,
        ),
      );
      m("freshness.maxLagDays", rows[0].lagDays);
    }
  } else {
    m("freshness.note", "skipped (--no-git)");
  }

  const lastmodByPath = new Map(entries.map((e, i) => [smPaths[i], e.lastmod]));
  const feedSet = new Set(itemLinks);
  const inboundByUrl = new Map(inboundRows.map((r) => [r.url, r]));
  const perPage = pages.map((p) => ({
    url: p.urlPath,
    indexable: !/noindex/i.test(p.robots || ""),
    titleLength: p.title.length,
    descriptionLength: p.description?.length ?? 0,
    canonicalSelf: p.canonical === `${host}${p.urlPath}`,
    ogImage: Boolean(p.og["og:image"]),
    twitterCard: Boolean(p.twitter["twitter:card"]),
    jsonldTypes: pageTypes.get(p.urlPath),
    inSitemap: inSitemap.has(p.urlPath),
    sitemapLastmod: lastmodByPath.get(p.urlPath) ?? null,
    inFeed: feedSet.has(`${host}${p.urlPath}`),
    contentInbound: inboundByUrl.get(p.urlPath)?.content ?? 0,
    h1Count: p.h1Count,
    headingIssues: headingIssues.find((x) => x.url === p.urlPath)?.issues ?? [],
  }));

  return {
    meta: { site: siteDir, host, prefix, generatedBy: "scripts/seo-audit.mjs" },
    metrics,
    details,
    pages: perPage,
  };
}

/** Render `metrics` as a two-column text table grouped by area. */
export function formatTable(result) {
  const rows = Object.entries(result.metrics);
  const width = Math.max(...rows.map(([k]) => k.length));
  const lines = [
    `SEO audit of ${result.meta.site} (host ${result.meta.host})`,
    "",
  ];
  let group = "";
  for (const [key, value] of rows) {
    const g = key.split(".")[0];
    if (g !== group) {
      if (group) lines.push("");
      group = g;
    }
    lines.push(`${key.padEnd(width)}  ${value}`);
  }
  return lines.join("\n");
}

function parseArgs(argv) {
  const opts = { site: "_site", json: "seo-audit.json", repo: ".", git: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--site") opts.site = argv[++i];
    else if (a === "--host") opts.host = argv[++i];
    else if (a === "--json") opts.json = argv[++i];
    else if (a === "--repo") opts.repo = argv[++i];
    else if (a === "--rev") opts.rev = argv[++i];
    else if (a === "--no-git") opts.git = false;
    else if (a === "--verbose") opts.verbose = true;
    else if (a === "--quiet") opts.quiet = true;
    else throw new Error(`unknown option: ${a}`);
  }
  return opts;
}

function main() {
  let opts;
  let result;
  try {
    opts = parseArgs(process.argv.slice(2));
    result = auditSite(path.resolve(opts.site), {
      host: opts.host,
      repo: opts.repo,
      rev: opts.rev,
      git: opts.git,
    });
  } catch (err) {
    process.stderr.write(`seo-audit: ${err.message}\n`);
    process.exit(2);
  }
  writeFileSync(opts.json, `${JSON.stringify(result, null, 2)}\n`);
  if (opts.quiet) {
    process.stdout.write(`${opts.json}\n`);
    return;
  }
  process.stdout.write(`${formatTable(result)}\n`);
  if (opts.verbose) {
    for (const [key, list] of Object.entries(result.details)) {
      if (
        !Array.isArray(list) ||
        list.length === 0 ||
        key === "links.inboundTable"
      )
        continue;
      process.stdout.write(`\n[${key}]\n`);
      for (const item of list)
        process.stdout.write(
          `  ${typeof item === "string" ? item : JSON.stringify(item)}\n`,
        );
    }
  }
  process.stdout.write(`\nFull result written to ${opts.json}\n`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main();
}
