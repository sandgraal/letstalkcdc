/**
 * Turn deferred stylesheet preloads into stylesheets.
 *
 * Page-level CSS is emitted as
 * `<link rel="preload" as="style" data-deferred-style>` (plus a `<noscript>`
 * stylesheet). It used to carry an inline `onload="...rel='stylesheet'"`
 * handler, which the site's Content-Security-Policy (script-src without
 * 'unsafe-inline' or 'unsafe-hashes') would block. This module does the same
 * swap from a script the policy allows. The preload has usually finished by
 * the time it runs, so the switch applies from cache.
 *
 * @module utils/deferred-styles
 */

export function applyDeferredStyles(root = document) {
  const links = root.querySelectorAll(
    'link[rel="preload"][as="style"][data-deferred-style]',
  );
  links.forEach((link) => {
    link.removeAttribute("data-deferred-style");
    link.rel = "stylesheet";
  });
  return links.length;
}

if (typeof document !== "undefined") {
  applyDeferredStyles();
}
