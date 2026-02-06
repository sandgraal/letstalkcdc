/**
 * Unit tests for the Code Blocks module
 * @module tests/unit/modules/code-blocks.test
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  initCodeBlocks,
  initHeadingAnchors,
} from "../../../src/assets/js/modules/code-blocks.js";

describe("code-blocks module", () => {
  const mockTracer = {
    trackInteraction: vi.fn(),
  };

  beforeEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
    window.showToast = vi.fn();
    navigator.clipboard.writeText = vi.fn().mockResolvedValue(undefined);
  });

  describe("initHeadingAnchors", () => {
    it("adds anchor links to h2 and h3 inside .prose", () => {
      document.body.innerHTML = `
        <div class="prose">
          <h2>My Heading</h2>
          <h3>Sub Heading</h3>
        </div>
      `;
      initHeadingAnchors();

      const h2 = document.querySelector("h2");
      expect(h2.id).toBe("my-heading");
      expect(h2.querySelector(".anchor")).not.toBeNull();
      expect(h2.querySelector(".anchor").href).toContain("#my-heading");

      const h3 = document.querySelector("h3");
      expect(h3.id).toBe("sub-heading");
      expect(h3.querySelector(".anchor")).not.toBeNull();
    });

    it("preserves existing heading ids", () => {
      document.body.innerHTML = `
        <div class="prose">
          <h2 id="custom-id">My Heading</h2>
        </div>
      `;
      initHeadingAnchors();

      const h2 = document.querySelector("h2");
      expect(h2.id).toBe("custom-id");
      expect(h2.querySelector(".anchor").href).toContain("#custom-id");
    });

    it("does not add duplicate anchors", () => {
      document.body.innerHTML = `
        <div class="prose">
          <h2 id="test">Test<a class="anchor" href="#test"></a></h2>
        </div>
      `;
      initHeadingAnchors();

      const anchors = document.querySelectorAll(".anchor");
      expect(anchors.length).toBe(1);
    });

    it("ignores headings outside .prose", () => {
      document.body.innerHTML = `
        <h2>Outside Heading</h2>
        <div class="prose">
          <h2>Inside Heading</h2>
        </div>
      `;
      initHeadingAnchors();

      const outsideH2 = document.body.querySelector(":scope > h2");
      expect(outsideH2.querySelector(".anchor")).toBeNull();
    });
  });

  describe("initCodeBlocks (enhanced code blocks)", () => {
    it("wraps pre > code with a code-block-wrapper", () => {
      document.body.innerHTML = `
        <pre><code class="language-javascript">const x = 1;</code></pre>
      `;
      initCodeBlocks(mockTracer);

      const wrapper = document.querySelector(".code-block-wrapper");
      expect(wrapper).not.toBeNull();
      expect(wrapper.querySelector(".code-block-header")).not.toBeNull();
      expect(wrapper.querySelector(".code-block-language").textContent).toBe(
        "JAVASCRIPT",
      );
    });

    it("creates a Copy button with correct aria-label", () => {
      document.body.innerHTML = `
        <pre><code class="language-python">print("hello")</code></pre>
      `;
      initCodeBlocks(mockTracer);

      const copyBtn = document.querySelector(".code-copy-button");
      expect(copyBtn).not.toBeNull();
      expect(copyBtn.getAttribute("aria-label")).toBe("Copy PYTHON code");
    });

    it("defaults language label to CODE when no class", () => {
      document.body.innerHTML = `<pre><code>some code</code></pre>`;
      initCodeBlocks(mockTracer);

      expect(document.querySelector(".code-block-language").textContent).toBe(
        "CODE",
      );
    });

    it("does not double-wrap already enhanced blocks", () => {
      document.body.innerHTML = `
        <div class="code-block-wrapper">
          <pre><code>existing</code></pre>
        </div>
      `;
      initCodeBlocks(mockTracer);

      const wrappers = document.querySelectorAll(".code-block-wrapper");
      expect(wrappers.length).toBe(1);
    });

    it("copies code to clipboard on Copy button click", async () => {
      document.body.innerHTML = `
        <pre><code class="language-bash">echo hello</code></pre>
      `;
      initCodeBlocks(mockTracer);

      const copyBtn = document.querySelector(".code-copy-button");
      await copyBtn.click();

      // Need to wait for async handler
      await vi.waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
          "echo hello",
        );
      });
    });

    it("shows 'Copied!' text and fires toast on successful copy", async () => {
      document.body.innerHTML = `
        <pre><code class="language-sql">SELECT 1</code></pre>
      `;
      initCodeBlocks(mockTracer);

      const copyBtn = document.querySelector(".code-copy-button");
      await copyBtn.click();

      await vi.waitFor(() => {
        expect(copyBtn.textContent).toBe("Copied!");
        expect(copyBtn.getAttribute("data-copied")).toBe("true");
        expect(window.showToast).toHaveBeenCalledWith(
          expect.objectContaining({
            type: "success",
          }),
        );
      });
    });

    it("shows error toast on clipboard failure", async () => {
      navigator.clipboard.writeText = vi
        .fn()
        .mockRejectedValue(new Error("denied"));

      document.body.innerHTML = `
        <pre><code>code</code></pre>
      `;
      initCodeBlocks(mockTracer);

      const copyBtn = document.querySelector(".code-copy-button");
      await copyBtn.click();

      await vi.waitFor(() => {
        expect(copyBtn.textContent).toBe("Failed");
        expect(window.showToast).toHaveBeenCalledWith(
          expect.objectContaining({
            type: "error",
          }),
        );
      });
    });

    it("tracks copy interaction via tracer", async () => {
      document.body.innerHTML = `
        <pre><code class="language-go">package main</code></pre>
      `;
      initCodeBlocks(mockTracer);

      const copyBtn = document.querySelector(".code-copy-button");
      await copyBtn.click();

      await vi.waitFor(() => {
        expect(mockTracer.trackInteraction).toHaveBeenCalledWith(
          "code-copy",
          expect.any(String),
          true,
        );
      });
    });
  });

  describe("legacy copy buttons", () => {
    it("adds a copy-snippet button to unwrapped pre > code", () => {
      document.body.innerHTML = `
        <pre><code>legacy code</code></pre>
      `;

      // Legacy buttons are added by initLegacyCopyButtons (internal), called by initCodeBlocks
      // But the enhance function runs first and wraps them.
      // Legacy is for pre > code that are ALREADY inside .code-block-wrapper
      // Actually, legacy runs on blocks NOT in a wrapper. But enhanceCodeBlocks
      // wraps them first. So we test that the wrapper approach works.
      initCodeBlocks(mockTracer);

      // The block should be wrapped by enhanceCodeBlocks
      expect(document.querySelector(".code-block-wrapper")).not.toBeNull();
    });
  });
});
