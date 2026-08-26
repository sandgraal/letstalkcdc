const { getPathPrefix } = require("../../lib/path-prefix.mjs");

const pathPrefix = getPathPrefix().replace(/\/$/, ""); // Remove trailing slash

module.exports = {
  datePublished: "2026-08-25",
  dateModified: "2026-08-25",
  seriesKey: "compare",
  heroConfig: {
    title: "Compare CDC Platforms",
    description:
      "<p>A head-to-head of the six CDC platforms teams actually evaluate — deployment, method, <strong>delivery semantics</strong>, latency, and cost — with the honest framing vendor marketing skips.</p>",
    align: "center",
    actions: [
      { href: "#matrix", label: "See the matrix" },
      { href: "#decide", label: "Decision guide", variant: "ghost" },
    ],
  },
  head_extra: `<link rel="stylesheet" href="${pathPrefix}/assets/css/pages/compare.css">`,
};
