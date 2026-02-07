const { getPathPrefix } = require("../../../lib/path-prefix.mjs");

const pathPrefix = getPathPrefix().replace(/\/$/, ""); // Remove trailing slash

module.exports = {
  seriesKey: "lab-snowflake-cdc",
  heroConfig: {
    title: "Cloud Lab: Snowflake CDC with Kafka Connect",
    description:
      "<p>Implement CDC pipelines using Snowflake with Kafka Connect and Snowpipe for real-time data ingestion. Includes connector configuration and streaming setup.</p>",
    align: "center",
    actions: [
      { href: "#prereqs", label: "Check Prerequisites" },
      { href: "#setup", label: "Start Building", variant: "ghost" },
    ],
  },
  head_extra: `<link rel="stylesheet" href="${pathPrefix}/assets/css/pages/cloud-labs.css">`,
};
