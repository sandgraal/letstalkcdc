const { getPathPrefix } = require("../../../lib/path-prefix.mjs");

const pathPrefix = getPathPrefix().replace(/\/$/, ""); // Remove trailing slash

module.exports = {
  datePublished: "2026-08-25",
  dateModified: "2026-08-25",
  seriesKey: "lab-fivetran-cdc",
  heroConfig: {
    title: "Cloud Lab: Fivetran CDC Pipeline",
    description:
      "<p>Build a fully managed CDC pipeline using Fivetran. Connect source databases to cloud warehouses with minimal configuration and zero infrastructure management.</p>",
    align: "center",
    actions: [
      { href: "#prereqs", label: "Check Prerequisites" },
      { href: "#setup", label: "Start Building", variant: "ghost" },
    ],
  },
  head_extra: `<link rel="stylesheet" href="${pathPrefix}/assets/css/pages/cloud-labs.css">`,
};
