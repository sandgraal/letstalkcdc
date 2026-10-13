/**
 * Locate the self-hosted third-party libraries (P17-23).
 *
 * The page template publishes their same-origin URLs (and, for classic
 * scripts, the SRI hash) in <meta name="cdc-vendor-*"> tags, because the hashed
 * file names only exist after the build. Chart.js is looked up the same way by
 * src/scripts/dashboard.js, which is served unbundled and so cannot import this.
 */

const metaFor = (name) =>
  document.querySelector(`meta[name="cdc-vendor-${name}"]`);

/**
 * @returns {{ src: string, integrity: string } | null} Absolute same-origin
 *   URL and SRI value for Mermaid, or null when the page does not declare it.
 */
const getMermaidScript = () => {
  const meta = metaFor("mermaid");
  const content = meta?.getAttribute("content");
  const integrity = meta?.dataset.integrity;
  if (!content || !integrity) return null;
  return { src: new URL(content, document.baseURI).href, integrity };
};

export { getMermaidScript };
