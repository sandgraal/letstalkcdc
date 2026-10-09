/**
 * SEO defaults and the structured-data classification (P16-4, P16-7).
 *
 * Read by src/_includes/layouts/base.njk. Paths are root-relative and carry
 * no path prefix: templates join them to `site.host`, which already includes
 * the prefix, so a host or prefix change is a variable change.
 */

export default {
  /**
   * Default social preview image, used when a page sets no `ogImage`.
   * 1200x630 is the size Open Graph and X's `summary_large_image` expect.
   * Lives in src/static/images/ (passed through to /images/).
   *
   * A page can override it in front matter with `ogImage` (a root-relative
   * path), plus `ogImageAlt`, `ogImageWidth` and `ogImageHeight`.
   */
  ogImage: {
    path: "/images/cdc-cover.jpg",
    width: 1200,
    height: 630,
    alt: "CDC: The Missing Manual. Change Data Capture for Production: database, log, stream, sink.",
  },

  /**
   * Pages that do NOT get the Article JSON-LD block, with the reason.
   *
   * Every other page that sets `datePublished` or `dateModified` gets one
   * Article (or TechArticle, see `schemaType`) block, so a new dated content
   * page is covered without touching this file. The unit test in
   * tests/unit/seo-head.test.js enforces that each indexable page either
   * carries article markup or is listed here.
   *
   * Keys are `page.url` values.
   */
  noArticle: {
    "/": "Home page. Carries a WebSite block instead.",
    "/overview/":
      "Series hub. Carries an ItemList generated from series.mjs instead.",
    "/privacy/": "Policy page, not an article.",
    "/versions/":
      "Generated version matrix with no authored publish or review date.",
    "/dashboard/": "Per-reader progress UI, no editorial content to describe.",
    "/mermaid-sandbox/": "Developer sandbox, not reader content.",
    "/styleguide/": "Internal style guide, already noindex.",
  },
};
