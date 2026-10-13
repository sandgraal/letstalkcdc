/**
 * Markdown twins (P17-22): one `index.md` beside the HTML of every indexable
 * page, e.g. /change-data-capture/index.html -> /change-data-capture/index.md.
 *
 * The page list is the sitemap's rule (`isIndexable`, exported by
 * ./sitemap.11ty.cjs), so a page that leaves the sitemap has no twin, and
 * src/_includes/layouts/base.njk uses the same rule for its
 * `<link rel="alternate" type="text/markdown">`. The body is the page's
 * rendered `templateContent` (no layout, so no header or navigation) run
 * through lib/markdown-twin.cjs.
 *
 * Canonical signals: GitHub Pages cannot set an `X-Robots-Tag` or `Link:
 * rel=canonical` header, so each twin names the canonical HTML URL in its
 * first lines instead. Twins are not in sitemap.xml.
 */
const Sitemap = require("./sitemap.11ty.cjs");
const { renderTwin, twinPath } = require("../lib/markdown-twin.cjs");

module.exports = class {
  data() {
    return {
      eleventyExcludeFromCollections: true,
      pagination: {
        data: "collections.all",
        size: 1,
        alias: "twin",
        before: (items) =>
          items.filter((i) => Sitemap.isIndexable(i) && twinPath(i.url)),
      },
      permalink: (data) => twinPath(data.twin.url),
    };
  }

  render({ twin, site, errata }) {
    return renderTwin({
      title: twin.data?.title || twin.data?.heroConfig?.title,
      description: twin.data?.description,
      url: twin.url,
      bodyHtml: twin.templateContent,
      site,
      errata: (Array.isArray(errata) ? errata : []).filter(
        (e) => Array.isArray(e?.urls) && e.urls.includes(twin.url),
      ),
    });
  }
};
