const { getPathPrefix } = require("../../../lib/path-prefix.mjs");

const pathPrefix = getPathPrefix().replace(/\/$/, ""); // Remove trailing slash

module.exports = {
  datePublished: "2026-02-06",
  dateModified: "2026-02-06",
  seriesKey: "lab-goldengate",
  heroConfig: {
    title: "Cloud Lab: Oracle GoldenGate CDC",
    description:
      "<p>Learn enterprise-grade Change Data Capture with Oracle GoldenGate. Capture changes from Oracle databases with guaranteed delivery, conflict resolution, and bidirectional replication capabilities.</p>",
    align: "center",
    actions: [
      { href: "#prereqs", label: "Check Prerequisites" },
      { href: "#setup", label: "Start Building", variant: "ghost" },
    ],
  },
  head_extra: `<link rel="stylesheet" href="${pathPrefix}/assets/css/pages/cloud-labs.css">`,
};
