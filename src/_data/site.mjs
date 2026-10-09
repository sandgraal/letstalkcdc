import { getPathPrefix, getPathPrefixForHost } from "../../lib/path-prefix.mjs";
import { DEFAULT_SITE_HOST, getEnvSiteHost } from "../../lib/site-host.mjs";

// The fallback host lives in lib/site-host.mjs (the one place it is
// written down). CI / deploy workflows should still set SITE_HOST
// explicitly (see .github/workflows/deploy.yml, linkcheck.yml); the
// default only keeps canonical / OG / JSON-LD URLs from shipping pointing
// at a host that doesn't exist.
const defaultHost = DEFAULT_SITE_HOST;
const pathPrefix = getPathPrefix();
const hostPathPrefix = getPathPrefixForHost(pathPrefix);
const envHost = getEnvSiteHost();

if (!envHost && process.env.NODE_ENV === "production") {
  console.warn(
    `[site] SITE_HOST is unset in a production build; falling back to ${defaultHost}. ` +
      `Set vars.SITE_HOST in repo Variables (or env) to silence this warning.`,
  );
}

const resolvedHost = envHost || defaultHost;
const hostWithPrefix = hostPathPrefix
  ? `${resolvedHost}${hostPathPrefix}`
  : resolvedHost;

export default {
  title: "CDC: The Missing Manual",
  tagline: "A Deep Dive into Change Data Capture",
  seoTitle: "CDC: The Missing Manual | A Deep Dive into Change Data Capture",
  description:
    "Learn why Change Data Capture (CDC) projects fail and how to build scalable, reliable, and production-ready data pipelines.",
  host: hostWithPrefix,
  origin: resolvedHost,
  author: "Christopher Ennis",
  copyright:
    "© 2025-2026 Christopher Ennis. A deep dive into the world of Change Data Capture.",
  repository: "sandgraal/letstalkcdc",
  pathPrefix,
};
