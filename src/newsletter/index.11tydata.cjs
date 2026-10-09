module.exports = {
  datePublished: "2026-10-09",
  dateModified: "2026-10-09",
  newsletterPage: true,
  // The page exists in every build, but while the newsletter is not
  // configured (the BUTTONDOWN_USERNAME build variable is unset) it must not be
  // advertised: noindex, and out of the sitemap. When configured it is a
  // normal indexable page. See src/_data/newsletter.mjs.
  eleventyComputed: {
    description: (data) =>
      data.newsletter && data.newsletter.enabled
        ? "Get an email when new Let's Talk CDC modules, labs or corrections go up. A plain form, no script; your address goes to Buttondown only when you submit."
        : "The Let's Talk CDC newsletter is not open yet. There is no signup form and nothing is collected.",
    robotsMeta: (data) =>
      data.newsletter && data.newsletter.enabled
        ? "index,follow,max-image-preview:large"
        : "noindex,follow",
    eleventyExcludeFromSitemap: (data) =>
      !(data.newsletter && data.newsletter.enabled),
  },
};
