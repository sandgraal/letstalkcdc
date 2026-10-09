/**
 * Single source of truth for the site's host (scheme + domain, no path).
 *
 * Everything that needs the host derives it from here:
 *   - src/_data/site.mjs        (templates: site.host / site.origin)
 *   - scripts/deployment-verify.mjs
 * The feed and sitemap read `site.host` from the data file above, and
 * robots.txt is a template, so none of them carry a literal host.
 *
 * Moving to another domain is therefore a variable change (SITE_HOST, and
 * ELEVENTY_PATH_PREFIX if the path changes), not a search-and-replace.
 * See docs/DOMAIN-MIGRATION.md.
 */

// The current production host. Only used when SITE_HOST is unset; deploy
// workflows set vars.SITE_HOST explicitly.
const DEFAULT_SITE_HOST = "https://sandgraal.github.io";

const normalizeHost = (host) => {
  if (!host) {
    return null;
  }

  return host.replace(/\/$/, "");
};

/** SITE_HOST with any trailing slash removed, or null when unset/blank. */
const getEnvSiteHost = () => normalizeHost(process.env.SITE_HOST);

/** The host to build for: SITE_HOST if set, otherwise the default. */
const getSiteHost = () => getEnvSiteHost() || DEFAULT_SITE_HOST;

export { DEFAULT_SITE_HOST, getEnvSiteHost, getSiteHost, normalizeHost };
