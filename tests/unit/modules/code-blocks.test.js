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

  describe("one copy control per block", () => {
    const controls = (root) =>
      Array.from(root.querySelectorAll("button")).filter((b) =>
        /copy/i.test(`${b.className} ${b.textContent}`),
      );

    it("gives a plain pre > code exactly one copy button", () => {
      document.body.innerHTML = `<pre><code>plain</code></pre>`;
      initCodeBlocks(mockTracer);

      expect(document.querySelectorAll(".copy-snippet").length).toBe(0);
      expect(controls(document.body).length).toBe(1);
      expect(controls(document.body)[0].classList).toContain(
        "code-copy-button",
      );
    });

    it("replaces a static button.copy (failure-drills markup)", () => {
      document.body.innerHTML = `
        <pre><button class="copy">copy</button><code>docker ps</code></pre>
        <pre><button class="copy">copy</button><code>docker logs</code></pre>
      `;
      initCodeBlocks(mockTracer);

      const wrappers = document.querySelectorAll(".code-block-wrapper");
      expect(wrappers.length).toBe(2);
      wrappers.forEach((wrapper) => {
        expect(controls(wrapper).length).toBe(1);
        expect(wrapper.querySelector("pre > button")).toBeNull();
      });
    });

    it("replaces a static button.copy-btn (snapshotting markup)", () => {
      document.body.innerHTML = `
        <pre><button class="copy-btn" type="button">Copy</button><code>SELECT 1</code></pre>
      `;
      initCodeBlocks(mockTracer);

      expect(document.querySelector(".copy-btn")).toBeNull();
      expect(controls(document.body).length).toBe(1);
    });

    it("does not leave a button after the code (legacy order)", () => {
      document.body.innerHTML = `
        <pre><code>reuse</code><button class="copy-btn">Existing</button></pre>
      `;
      initCodeBlocks(mockTracer);

      expect(document.querySelector(".copy-btn")).toBeNull();
      expect(controls(document.body).length).toBe(1);
    });

    it("never doubles up when run twice", () => {
      document.body.innerHTML = `<pre><button class="copy">copy</button><code>twice</code></pre>`;
      initCodeBlocks(mockTracer);
      initCodeBlocks(mockTracer);

      expect(controls(document.body).length).toBe(1);
    });

    it("keeps the remaining control labelled and keyboard-reachable", () => {
      document.body.innerHTML = `
        <pre><button class="copy">copy</button><code class="language-bash">ls</code></pre>
      `;
      initCodeBlocks(mockTracer);

      const button = document.querySelector(".code-copy-button");
      expect(button.type).toBe("button");
      expect(button.tabIndex).toBe(0);
      expect(button.getAttribute("aria-label")).toBe("Copy BASH code");
    });

    it("copies the code, not the removed button's label", async () => {
      document.body.innerHTML = `
        <pre><button class="copy">copy</button><code>echo hi</code></pre>
      `;
      initCodeBlocks(mockTracer);

      const button = document.querySelector(".code-copy-button");
      await button.click();

      await vi.waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith("echo hi");
        expect(button.textContent).toBe("Copied!");
      });
    });

    it("shows Failed on clipboard error", async () => {
      navigator.clipboard.writeText = vi
        .fn()
        .mockRejectedValue(new Error("blocked"));
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      document.body.innerHTML = `<pre><code>fail text</code></pre>`;
      initCodeBlocks(mockTracer);

      const button = document.querySelector(".code-copy-button");
      await button.click();

      await vi.waitFor(() => {
        expect(button.textContent).toBe("Failed");
      });
      errorSpy.mockRestore();
    });

    it("uses pre.id for the tracer block id when available", async () => {
      document.body.innerHTML = `
        <pre id="my-block"><code>id block</code></pre>
      `;
      initCodeBlocks(mockTracer);

      await document.querySelector(".code-copy-button").click();

      await vi.waitFor(() => {
        expect(mockTracer.trackInteraction).toHaveBeenCalledWith(
          "code-copy",
          "my-block",
          true,
        );
      });
    });
  });

  describe("enhanced code blocks edge cases", () => {
    it("works without window.showToast on success", async () => {
      delete window.showToast;

      document.body.innerHTML = `
        <pre><code class="language-rust">fn main() {}</code></pre>
      `;
      initCodeBlocks(mockTracer);

      const copyBtn = document.querySelector(".code-copy-button");
      await copyBtn.click();

      await vi.waitFor(() => {
        expect(copyBtn.textContent).toBe("Copied!");
      });
      // No error thrown even without showToast
    });

    it("works without window.showToast on failure", async () => {
      delete window.showToast;
      navigator.clipboard.writeText = vi
        .fn()
        .mockRejectedValue(new Error("nope"));

      document.body.innerHTML = `
        <pre><code>fail no toast</code></pre>
      `;
      initCodeBlocks(mockTracer);

      const copyBtn = document.querySelector(".code-copy-button");
      await copyBtn.click();

      await vi.waitFor(() => {
        expect(copyBtn.textContent).toBe("Failed");
      });
    });

    it("handles tracer failure gracefully in enhanced copy", async () => {
      const failingTracer = {
        trackInteraction: vi.fn().mockImplementation(() => {
          throw new Error("tracer error");
        }),
      };

      document.body.innerHTML = `
        <pre><code class="language-go">package main</code></pre>
      `;
      initCodeBlocks(failingTracer);

      const copyBtn = document.querySelector(".code-copy-button");
      const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

      await copyBtn.click();

      await vi.waitFor(() => {
        expect(copyBtn.textContent).toBe("Copied!");
        expect(debugSpy).toHaveBeenCalledWith(
          "Code copy tracking failed:",
          expect.any(Error),
        );
      });

      debugSpy.mockRestore();
    });

    it("restores button text and removes data-copied after timeout", async () => {
      vi.useFakeTimers();

      document.body.innerHTML = `
        <pre><code class="language-js">let x = 1;</code></pre>
      `;
      initCodeBlocks(mockTracer);

      const copyBtn = document.querySelector(".code-copy-button");
      await copyBtn.click();
      await vi.advanceTimersByTimeAsync(0);

      expect(copyBtn.textContent).toBe("Copied!");
      expect(copyBtn.getAttribute("data-copied")).toBe("true");

      vi.advanceTimersByTime(2000);
      expect(copyBtn.textContent).toBe("Copy");
      expect(copyBtn.getAttribute("data-copied")).toBeNull();

      vi.useRealTimers();
    });

    it("restores Failed text after timeout on error", async () => {
      vi.useFakeTimers();
      navigator.clipboard.writeText = vi
        .fn()
        .mockRejectedValue(new Error("fail"));

      document.body.innerHTML = `
        <pre><code>err restore</code></pre>
      `;
      initCodeBlocks(mockTracer);

      const copyBtn = document.querySelector(".code-copy-button");
      await copyBtn.click();
      await vi.advanceTimersByTimeAsync(0);

      expect(copyBtn.textContent).toBe("Failed");

      vi.advanceTimersByTime(2000);
      expect(copyBtn.textContent).toBe("Copy");

      vi.useRealTimers();
    });
  });
});
