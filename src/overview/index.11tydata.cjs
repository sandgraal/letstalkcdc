const series = require('../_data/series.cjs');

module.exports = {
  heroConfig: {
    title: 'Series Overview',
    description: `
      <p>Change Data Capture marks a fundamental evolution in data integration, moving away from the latent, resource-intensive world of batch processing and into the dynamic paradigm of real-time streaming. By capturing individual data changes as they occur, CDC provides a mechanism to keep disparate systems synchronized with minimal impact and sub-second latency. This technology is a strategic enabler, unlocking real-time analytics and forming the backbone of resilient, modern data architectures.</p>
      <p>Start with the fundamentals. Understand what Change Data Capture is and why it’s a cornerstone of modern data architecture through real-world use cases.</p>
    `,
    align: 'center'
  },
  seriesCards: series
};
