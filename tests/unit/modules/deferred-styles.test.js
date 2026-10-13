/**
 * Deferred page stylesheets are switched on by a script, not an inline
 * onload handler (which the Content-Security-Policy blocks).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { applyDeferredStyles } from "../../../src/assets/js/utils/deferred-styles.js";

describe("deferred-styles", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
  });

  it("turns marked preloads into stylesheets and leaves other links alone", () => {
    document.head.innerHTML = `
      <link rel="preload" href="/a.css" as="style" data-deferred-style>
      <link rel="preload" href="/f.woff2" as="font" crossorigin>
      <link rel="stylesheet" href="/b.css">`;
    expect(applyDeferredStyles()).toBe(1);
    const a = document.head.querySelector('link[href="/a.css"]');
    expect(a.rel).toBe("stylesheet");
    expect(a.hasAttribute("data-deferred-style")).toBe(false);
    expect(document.head.querySelector('link[href="/f.woff2"]').rel).toBe(
      "preload",
    );
  });

  it("is a no-op the second time", () => {
    document.head.innerHTML = `<link rel="preload" href="/a.css" as="style" data-deferred-style>`;
    applyDeferredStyles();
    expect(applyDeferredStyles()).toBe(0);
  });
});
