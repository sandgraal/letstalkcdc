// `series.mjs` is an ES module, so require() hands back the module namespace
// ({ __esModule, default }) rather than the array itself. Without unwrapping
// `.default`, `seriesCards` was an object, the `{% for %}` in index.njk
// iterated nothing, and the series grid rendered zero cards in production.
const seriesModule = require("../_data/series.mjs");
const series = seriesModule.default ?? seriesModule;

module.exports = {
  datePublished: "2026-02-06",
  dateModified: "2026-02-06",
  heroConfig: {
    title: "Series Overview",
    description: `
      <p>Change Data Capture marks a fundamental evolution in data integration, moving away from the latent, resource-intensive world of batch processing and into the dynamic paradigm of real-time streaming. By capturing individual data changes as they occur, CDC provides a mechanism to keep disparate systems synchronized with minimal impact and sub-second latency. This technology is a strategic enabler, unlocking real-time analytics and forming the backbone of resilient, modern data architectures.</p>
      <p>Start with the fundamentals. Understand what Change Data Capture is and why it’s a cornerstone of modern data architecture through real-world use cases.</p>
    `,
    align: "center",
  },
  seriesCards: series,
};
