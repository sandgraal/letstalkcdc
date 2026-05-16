/**
 * RSS 2.0 feed of the series modules, emitted at /feed.xml.
 *
 * Practitioner-style sites in adjacent spaces (Debezium, Confluent
 * Developer, Gunnar Morling's blog) all expose a feed. Phase 9 of
 * docs/IMPLEMENTATION-PLAN.md called this out as a Tier-1 gap; this
 * generator closes it without adding a runtime dependency
 * (`@11ty/eleventy-plugin-rss` was considered and rejected — the
 * format we emit is ~20 lines of hand-rolled XML and the plugin
 * brings its own Nunjucks shortcodes that we'd then need to wire).
 *
 * Filters `collections.all` to items with a `seriesKey` set in their
 * `.11tydata.cjs` (every module page), sorts by `dateModified` desc
 * with `datePublished` as the tiebreaker, caps at 30 entries.
 */
const xmlEscape = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const toRfc822 = (d) => {
  const parsed = new Date(d);
  if (Number.isNaN(parsed.getTime())) return new Date().toUTCString();
  return parsed.toUTCString();
};

const itemDate = (item) =>
  item.data.dateModified || item.data.datePublished || item.date || 0;

module.exports = class {
  data() {
    return {
      permalink: "/feed.xml",
      eleventyExcludeFromCollections: true,
      // Cap how many items appear in the feed. Feed readers and
      // search aggregators don't want every module on every fetch;
      // 30 is the common ceiling and well above our current ~24
      // series count.
      feedLimit: 30,
    };
  }

  render({ collections, site, author, feedLimit }) {
    // `site.host` already includes the path prefix
    // (https://sandgraal.github.io/letstalkcdc in prod). Module
    // `item.url` does NOT include the prefix — Eleventy strips it
    // for the collection-iteration value — so we append item.url
    // directly to the prefixed host, same convention as
    // `sitemap.11ty.cjs`. PR #263 fixed the inverse "doubled prefix"
    // bug in redirect stubs; this is the corresponding "missing
    // prefix" pitfall.
    const channelLink = (site?.host || site?.origin || "").replace(/\/$/, "");
    const feedUrl = `${channelLink}/feed.xml`;

    const items = collections.all
      .filter((item) => item.data?.seriesKey && item.url)
      .sort((a, b) => new Date(itemDate(b)) - new Date(itemDate(a)))
      .slice(0, feedLimit ?? 30);

    const newestDate = items.length ? itemDate(items[0]) : new Date();

    const itemsXml = items
      .map((item) => {
        const url = `${channelLink}${item.url}`;
        const title = xmlEscape(
          item.data.title || item.data.heroConfig?.title || item.url,
        );
        const desc = xmlEscape(item.data.description || "");
        const pubDate = toRfc822(itemDate(item));
        const creator = xmlEscape(author?.name || "");
        return `    <item>
      <title>${title}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <description>${desc}</description>
      <pubDate>${pubDate}</pubDate>
      <dc:creator>${creator}</dc:creator>
    </item>`;
      })
      .join("\n");

    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${xmlEscape(site?.title || "")}</title>
    <link>${channelLink}</link>
    <atom:link href="${feedUrl}" rel="self" type="application/rss+xml"/>
    <description>${xmlEscape(site?.description || "")}</description>
    <language>en</language>
    <lastBuildDate>${toRfc822(newestDate)}</lastBuildDate>
${itemsXml}
  </channel>
</rss>
`;
  }
};
