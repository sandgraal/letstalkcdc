const { getPathPrefix } = require("../../../lib/path-prefix.mjs");

const pathPrefix = getPathPrefix().replace(/\/$/, ""); // Remove trailing slash

module.exports = {
  datePublished: "2026-08-25",
  dateModified: "2026-08-25",
  seriesKey: "lab-aws-dms",
  heroConfig: {
    title: "Cloud Lab: AWS DMS CDC Pipeline",
    description:
      "<p>Learn to implement Change Data Capture using AWS Database Migration Service (DMS) to replicate changes from RDS to S3/Redshift. Includes Terraform templates and IAM setup.</p>",
    align: "center",
    actions: [
      { href: "#prereqs", label: "Check Prerequisites" },
      { href: "#setup", label: "Start Building", variant: "ghost" },
    ],
  },
  head_extra: `<link rel="stylesheet" href="${pathPrefix}/assets/css/pages/cloud-labs.css">`,
};
