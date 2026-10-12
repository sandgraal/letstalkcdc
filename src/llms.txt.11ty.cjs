/**
 * /llms.txt: a plain-text index of the site for language-model crawlers
 * (P17-21), in the llmstxt.org shape: an H1, a blockquote summary, prose, then
 * H2 sections of `- [title](url): description` links.
 *
 * The page list comes from the same rule as sitemap.xml: this file calls
 * `isIndexable` and `extraUrls` exported by ./sitemap.11ty.cjs, so a page that
 * leaves the sitemap (noindex, draft, redirect stub, 404, excluded) leaves
 * this file too, and a page added to the sitemap appears here. The lessons are
 * ordered as in src/_data/series.mjs. Every URL is `site.host` (which carries
 * the path prefix) plus the page URL; no host is written in this file.
 *
 * AI crawlers are allowed (docs/DECISIONS.md, "AI crawlers and licensing");
 * the content is CC BY 4.0, so the file says attribution is required.
 */
const Sitemap = require("./sitemap.11ty.cjs");

const LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/";

// One line, no markdown-breaking brackets.
const oneLine = (s) =>
  String(s ?? "")
    .replace(/\s+/g, " ")
    .trim();
const linkText = (s) => oneLine(s).replace(/\[/g, "(").replace(/\]/g, ")");

module.exports = class {
  data() {
    return {
      permalink: "/llms.txt",
      eleventyExcludeFromCollections: true,
    };
  }

  render({ collections, site, series }) {
    const base = (site?.host || "").replace(/\/$/, "");

    const pages = Array.from(
      new Map(
        [...collections.all.filter(Sitemap.isIndexable), ...Sitemap.extraUrls]
          .map((item) => ({
            url: item.url,
            title: oneLine(
              item.data?.title || item.data?.heroConfig?.title || item.title,
            ),
            description: oneLine(item.data?.description || item.description),
            seriesKey: item.data?.seriesKey,
          }))
          .filter((p) => p.title)
          .map((p) => [p.url, p]),
      ).values(),
    );

    const order = new Map((series || []).map((s, i) => [s.key, i]));
    const lessons = pages
      .filter((p) => order.has(p.seriesKey))
      .sort((a, b) => order.get(a.seriesKey) - order.get(b.seriesKey));
    const other = pages
      .filter((p) => !order.has(p.seriesKey))
      .sort((a, b) => a.url.localeCompare(b.url));

    const line = (p) =>
      `- [${linkText(p.title)}](${base}${p.url})${p.description ? `: ${p.description}` : ""}`;

    const section = (heading, items) =>
      items.length ? `## ${heading}\n\n${items.map(line).join("\n")}\n` : "";

    const attribution = `${site?.title}, by ${site?.author} (${base}/)`;

    return [
      `# ${site?.title}\n`,
      `> ${site?.description}\n`,
      `A free, English-language learning resource on change data capture. Its thesis: delivery is at-least-once, and correctness lives in an idempotent sink keyed on the primary key and ordered by source log position, not by ts_ms. End-to-end exactly-once across independent systems is not claimed.\n`,
      `AI crawlers and retrieval tools are welcome. The content is licensed CC BY 4.0 (${LICENSE_URL}). Attribution is required: credit "${attribution}", link to the page you used, and say if you made changes.\n`,
      `The full list of pages is also in ${base}/sitemap.xml.\n`,
      section("Lessons", lessons),
      section("Other pages", other),
    ]
      .filter(Boolean)
      .join("\n");
  }
};
