/**
 * Author identity — rendered in page footers, JSON-LD, RSS, and OG metadata.
 * Keep this file as the single source of truth for author info.
 *
 * The bio / advisoryUrl fields support the lead-gen surface described in the
 * site revitalization plan. The fields are read by:
 *   - src/_includes/layouts/base.njk  (visible footer + Article JSON-LD)
 *   - any future feed / Article emitter
 */

export default {
  name: "Christopher Ennis",
  shortBio:
    "Author of CDC: The Missing Manual. Writes about change data capture, " +
    "streaming data, and what actually breaks in production.",
  url: "https://github.com/sandgraal",
  // Root-relative paths (src/static is passed through to the site root).
  // Templates add the path prefix with `| url`; JSON-LD prefixes `site.host`.
  image: "/author/christopher.jpg", // 400x400
  imageSmall: "/author/christopher-128.jpg", // 128x128, byline avatar
  sameAs: [
    "https://github.com/sandgraal",
    "https://www.linkedin.com/in/cennis/",
  ],
  // Contact surface. When set, the layout shows a soft "Get in touch on
  // LinkedIn" CTA on module pages (the wording assumes a LinkedIn URL).
  // Leave null to hide.
  advisoryUrl: "https://www.linkedin.com/in/cennis/",
};
