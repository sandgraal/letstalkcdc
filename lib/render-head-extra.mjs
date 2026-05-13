/**
 * `head_extra` mini-renderer.
 *
 * Front-matter strings aren't re-parsed by Nunjucks, so `head_extra`
 * blocks need their own pass for the handful of expressions templates
 * use. This is deliberately a regex stand-in, not a real template
 * engine: full Nunjucks rendering of front-matter is overkill for the
 * patterns the site actually emits.
 *
 * Supported expressions (in order of frequency):
 *
 *   {{ '/some/path' | url }}    → pathPrefix + path
 *   {{ site.host }}             → site.host (host + pathPrefix)
 *   {{ site.origin }}           → site.origin (bare host, no prefix)
 *
 * Anything else passes through unchanged.
 *
 * **If you add another `{{ ... }}` expression to a `head_extra` block,
 * mirror it here AND add a case to `tests/unit/lib/render-head-extra.test.js`.**
 * The bug Codex caught on PR #265 was exactly this: `{{ site.origin }}`
 * was added to four `head_extra` blocks but the filter only knew about
 * `{{ site.host }}`, so production shipped the literal string.
 *
 * @param {string} str        The raw `head_extra` value from front-matter.
 * @param {object} options
 * @param {string} options.pathPrefix  Path prefix WITHOUT trailing slash,
 *                                     e.g. `/letstalkcdc` (or `""` for root).
 * @param {string} options.host        Full host string including prefix.
 * @param {string} options.origin      Bare host without prefix.
 * @returns {string}
 */
export function renderHeadExtra(
  str,
  { pathPrefix = "", host = "", origin = "" } = {},
) {
  if (!str) return "";
  return str
    .replace(
      /\{\{\s*['"]([^'"]+)['"]\s*\|\s*url\s*\}\}/g,
      (_, p) => `${pathPrefix}${p}`,
    )
    .replace(/\{\{\s*site\.host\s*\}\}/g, host)
    .replace(/\{\{\s*site\.origin\s*\}\}/g, origin);
}
