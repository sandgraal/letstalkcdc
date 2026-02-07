const { getPathPrefix } = require("../../../lib/path-prefix.mjs");

const pathPrefix = getPathPrefix().replace(/\/$/, ""); // Remove trailing slash

module.exports = {
  seriesKey: "lab-matillion-cdc",
  heroConfig: {
    title: "Cloud Lab: Matillion CDC Pipeline",
    description:
      "<p>Build a visual CDC pipeline using Matillion ETL with its low-code interface. Includes configuration walkthrough and UI-based workflow setup.</p>",
    align: "center",
    actions: [
      { href: "#prereqs", label: "Check Prerequisites" },
      { href: "#setup", label: "Start Building", variant: "ghost" },
    ],
  },
  head_extra: `<link rel="stylesheet" href="${pathPrefix}/assets/css/pages/cloud-labs.css">`,
};
