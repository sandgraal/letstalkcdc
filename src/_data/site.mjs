import { getPathPrefix, getPathPrefixForHost } from "../../lib/path-prefix.mjs";

const normalizeHost = (host) => {
  if (!host) {
    return null;
  }

  return host.replace(/\/$/, "");
};

// Production lives at https://sandgraal.github.io/letstalkcdc/, so this
// default matches reality. CI / deploy workflows should still set
// SITE_HOST explicitly (see .github/workflows/deploy.yml,
// linkcheck.yml); this default is a fallback so canonical / OG / JSON-LD
// URLs don't ship pointing at a host that doesn't exist.
const defaultHost = "https://sandgraal.github.io";
const pathPrefix = getPathPrefix();
const hostPathPrefix = getPathPrefixForHost(pathPrefix);
const envHost = normalizeHost(process.env.SITE_HOST);

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
    "© 2025 Christopher Ennis. A deep dive into the world of Change Data Capture.",
  repository: "sandgraal/letstalkcdc",
  pathPrefix,
};
