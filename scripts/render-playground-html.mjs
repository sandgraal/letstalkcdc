/**
 * Publish-time step for playground/index.html (P16-11).
 *
 * The playground is a static file that Eleventy never builds, so it cannot
 * use `site.host`. Its <head> carries the placeholder `__SITE_URL__` (host
 * plus path prefix, no trailing slash) in the canonical, Open Graph and
 * Twitter URLs. scripts/publish-playground.sh runs this file to replace it
 * with the same value the Eleventy build uses (SITE_HOST and
 * ELEVENTY_PATH_PREFIX, via lib/site-host.mjs and lib/path-prefix.mjs), so
 * moving domains is a variable change, not an edit to the playground.
 *
 * CLI: node scripts/render-playground-html.mjs <input.html> <output.html>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { getPathPrefix, getPathPrefixForHost } from "../lib/path-prefix.mjs";
import { getSiteHost } from "../lib/site-host.mjs";

export const SITE_URL_PLACEHOLDER = "__SITE_URL__";

/** Host plus path prefix with no trailing slash, as `site.host` is. */
export function resolveSiteUrl() {
  return `${getSiteHost()}${getPathPrefixForHost(getPathPrefix())}`;
}

/**
 * Replace every placeholder in `html` with `siteUrl`. Throws when the file
 * has no placeholder (the head was edited away and the substitution would
 * silently do nothing) or when the value would break out of an attribute.
 */
export function renderPlaygroundHtml(html, siteUrl = resolveSiteUrl()) {
  if (!/^https?:\/\/[^\s"'<>&]+$/.test(siteUrl) || siteUrl.endsWith("/")) {
    throw new Error(`Unusable site URL for the playground head: ${siteUrl}`);
  }
  if (!html.includes(SITE_URL_PLACEHOLDER)) {
    throw new Error(
      `playground/index.html has no ${SITE_URL_PLACEHOLDER} placeholder to replace`,
    );
  }
  return html.split(SITE_URL_PLACEHOLDER).join(siteUrl);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) {
    process.stderr.write(
      "usage: render-playground-html.mjs <input.html> <output.html>\n",
    );
    process.exit(2);
  }
  writeFileSync(output, renderPlaygroundHtml(readFileSync(input, "utf8")));
}
