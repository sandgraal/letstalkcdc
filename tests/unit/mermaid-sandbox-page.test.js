/**
 * The Mermaid sandbox page script (P17-23): it reads the vendored Mermaid
 * location from a <meta> tag, and says so when that tag is missing instead of
 * leaving the reader with an unexplained empty page.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const SANDBOX = "../../src/assets/js/pages/mermaid-sandbox.js";

describe("mermaid-sandbox page script", () => {
  beforeEach(() => {
    vi.resetModules();
    document.head
      .querySelectorAll('meta[name^="cdc-vendor-"], script[src*="mermaid"]')
      .forEach((n) => n.remove());
    document.body.innerHTML = '<pre class="mermaid">graph LR; A-->B;</pre>';
    delete window.mermaid;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("warns once and loads nothing when the vendor meta tag is missing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await import(SANDBOX);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/Mermaid\.js failed to load/);
    expect(String(warn.mock.calls[0][1])).toMatch(/location not found/);
    expect(document.querySelector('script[src*="mermaid"]')).toBeNull();
  });

  it("does not warn when the page declares the Mermaid file", async () => {
    const meta = document.createElement("meta");
    meta.name = "cdc-vendor-mermaid";
    meta.content = "/assets/vendor/mermaid.0123456789ab.min.js";
    meta.dataset.integrity = `sha384-${"A".repeat(64)}`;
    document.head.appendChild(meta);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(document.head, "appendChild").mockImplementation((el) => el);

    await import(SANDBOX);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(warn).not.toHaveBeenCalled();
    expect(document.head.appendChild).toHaveBeenCalled();
  });
});
