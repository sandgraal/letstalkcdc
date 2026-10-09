module.exports = {
  datePublished: "2026-08-25",
  dateModified: "2026-10-09",
  seriesKey: "compare",
  heroConfig: {
    title: "Compare CDC Platforms",
    description:
      "<p>A decision aid for choosing among the six CDC platforms teams actually evaluate — deployment, method, <strong>delivery semantics</strong>, latency, and cost — with the honest framing vendor marketing skips.</p>",
    align: "center",
    actions: [
      { href: "#matrix", label: "See the matrix" },
      { href: "#decide", label: "Decision guide", variant: "ghost" },
    ],
  },
  // `renderHeadExtra` expands `{{ '/…' | url }}` with the path prefix — the
  // established pattern (see src/intro/index.njk); no custom prefix code here.
  head_extra: `<link rel="stylesheet" href="{{ '/assets/css/pages/compare.css' | url }}">`,
};
