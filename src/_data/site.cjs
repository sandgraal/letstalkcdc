const { getPathPrefix, getPathPrefixForHost } = require("../../lib/path-prefix.cjs");

const normalizeHost = (host) => {
  if (!host) {
    return null;
  }

  return host.replace(/\/$/, "");
};

const defaultHost = "https://letstalkcdc.github.io";
const pathPrefix = getPathPrefix();
const hostPathPrefix = getPathPrefixForHost(pathPrefix);
const resolvedHost = normalizeHost(process.env.SITE_HOST) || defaultHost;
const hostWithPrefix = hostPathPrefix ? `${resolvedHost}${hostPathPrefix}` : resolvedHost;

module.exports = {
  title: "CDC: The Missing Manual",
  tagline: "A Deep Dive into Change Data Capture",
  seoTitle: "CDC: The Missing Manual | A Deep Dive into Change Data Capture",
  description: "Learn why Change Data Capture (CDC) projects fail and how to build scalable, reliable, and production-ready data pipelines.",
  host: hostWithPrefix,
  author: "Christopher Ennis",
  copyright: "© 2025 Christopher Ennis. A deep dive into the world of Change Data Capture.",
  pathPrefix,
};
