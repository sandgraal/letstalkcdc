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
  image: null, // TODO: add /static/author/christopher.jpg when an asset is ready
  sameAs: ["https://github.com/sandgraal"],
  // Optional consulting / advisory contact surface. When set, the layout
  // shows a soft CTA on module pages. Leave null to hide.
  advisoryUrl: null,
};
