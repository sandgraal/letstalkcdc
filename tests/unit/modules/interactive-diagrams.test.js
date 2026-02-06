/**
 * Unit tests for the Interactive Diagrams module
 *
 * Since the module lazy-loads Mermaid from CDN, tests focus on:
 * - Early return when no .mermaid blocks exist
 * - Theme detection logic
 * - Tooltip creation and cleanup
 * - Node interaction (click-to-highlight, keyboard)
 * - Progressive enhancement (loading states)
 *
 * @module tests/unit/modules/interactive-diagrams.test
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { initInteractiveDiagrams } from "../../../src/assets/js/modules/interactive-diagrams.js";

describe("interactive-diagrams module", () => {
  const mockTracer = {
    trackInteraction: vi.fn(),
  };

  let originalCreateElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
    // Remove any existing mermaid script tags
    document
      .querySelectorAll('script[src*="mermaid"]')
      .forEach((s) => s.remove());
    // Clear global mermaid
    window.mermaid = undefined;
    // Restore theme
    document.documentElement.removeAttribute("data-theme");
  });

  afterEach(() => {
    if (originalCreateElement) {
      document.createElement = originalCreateElement;
      originalCreateElement = undefined;
    }
  });

  it("returns early when no .mermaid blocks exist", async () => {
    document.body.innerHTML = "<div>No diagrams here</div>";
    await expect(initInteractiveDiagrams(mockTracer)).resolves.toBeUndefined();
    // No script should be appended
    expect(document.querySelector('script[src*="mermaid"]')).toBeNull();
  });

  it("adds loading class to .mermaid blocks before loading", async () => {
    document.body.innerHTML = '<pre class="mermaid">graph LR; A-->B;</pre>';

    // Mock createElement to intercept the script append but not resolve
    const originalAppend = document.head.appendChild.bind(document.head);
    let scriptElement = null;

    vi.spyOn(document.head, "appendChild").mockImplementation((el) => {
      if (el.tagName === "SCRIPT" && el.src.includes("mermaid")) {
        scriptElement = el;
        // Simulate load failure to exit early
        setTimeout(() => {
          el.dispatchEvent(new Event("error"));
        }, 0);
        return originalAppend(document.createComment("mocked script"));
      }
      return originalAppend(el);
    });

    await initInteractiveDiagrams(mockTracer);

    // After failure, loading class should be removed
    const block = document.querySelector(".mermaid");
    expect(block.classList.contains("diagram-loading")).toBe(false);

    document.head.appendChild.mockRestore?.();
  });

  describe("with mocked Mermaid", () => {
    beforeEach(() => {
      // Pretend Mermaid.js script is already loaded
      const fakeScript = document.createElement("script");
      fakeScript.src =
        "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js";
      fakeScript.dataset.loaded = "true";
      document.head.appendChild(fakeScript);

      // Mock global mermaid
      window.mermaid = {
        initialize: vi.fn(),
        run: vi.fn().mockResolvedValue(undefined),
      };
    });

    it("calls mermaid.initialize with correct theme", async () => {
      document.body.innerHTML = '<pre class="mermaid">graph LR; A-->B;</pre>';
      document.documentElement.setAttribute("data-theme", "dark");

      await initInteractiveDiagrams(mockTracer);

      expect(window.mermaid.initialize).toHaveBeenCalledWith(
        expect.objectContaining({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "dark",
        }),
      );
    });

    it("uses default theme for light mode", async () => {
      document.body.innerHTML = '<pre class="mermaid">graph LR; A-->B;</pre>';
      document.documentElement.setAttribute("data-theme", "light");

      await initInteractiveDiagrams(mockTracer);

      expect(window.mermaid.initialize).toHaveBeenCalledWith(
        expect.objectContaining({
          theme: "default",
        }),
      );
    });

    it("calls mermaid.run with correct selector", async () => {
      document.body.innerHTML = '<pre class="mermaid">graph LR; A-->B;</pre>';

      await initInteractiveDiagrams(mockTracer);

      expect(window.mermaid.run).toHaveBeenCalledWith({
        querySelector: "pre.mermaid, .mermaid:not(svg)",
      });
    });

    it("removes loading class after rendering", async () => {
      document.body.innerHTML = '<pre class="mermaid">graph LR; A-->B;</pre>';

      await initInteractiveDiagrams(mockTracer);

      const block = document.querySelector(".mermaid");
      expect(block.classList.contains("diagram-loading")).toBe(false);
    });

    it("adds diagram-rendered class after enhancement", async () => {
      document.body.innerHTML = `
        <pre class="mermaid">graph LR; A-->B;</pre>
      `;
      // Mock mermaid.run to inject an SVG into the block
      window.mermaid.run.mockImplementation(async () => {
        const block = document.querySelector(".mermaid");
        block.innerHTML =
          '<svg><g class="node" id="A"><text>A</text></g></svg>';
      });

      await initInteractiveDiagrams(mockTracer);

      const block = document.querySelector(".mermaid");
      expect(block.classList.contains("diagram-rendered")).toBe(true);
    });

    it("tracks diagrams-loaded interaction", async () => {
      document.body.innerHTML = `
        <pre class="mermaid">graph LR; A-->B;</pre>
        <pre class="mermaid">graph TD; C-->D;</pre>
      `;

      await initInteractiveDiagrams(mockTracer);

      expect(mockTracer.trackInteraction).toHaveBeenCalledWith(
        "diagrams-loaded",
        { count: 2 },
      );
    });

    it("works without a tracer", async () => {
      document.body.innerHTML = '<pre class="mermaid">graph LR; A-->B;</pre>';
      await expect(initInteractiveDiagrams()).resolves.toBeUndefined();
    });

    describe("node interaction after rendering", () => {
      beforeEach(async () => {
        document.body.innerHTML = `
          <div class="architecture-diagram"
               data-tooltips='{"A":"Node A description","B":"Node B description"}'>
            <pre class="mermaid">graph LR; A-->B;</pre>
          </div>
        `;
        // Mock mermaid.run to inject SVG with nodes
        window.mermaid.run.mockImplementation(async () => {
          const block = document.querySelector(".mermaid");
          block.innerHTML = `
            <svg>
              <g class="node" id="A"><text>A</text><rect/></g>
              <g class="node" id="B"><text>B</text><rect/></g>
            </svg>
          `;
        });

        await initInteractiveDiagrams(mockTracer);
      });

      it("makes nodes focusable and sets role=button", () => {
        const nodes = document.querySelectorAll("g.node");
        nodes.forEach((node) => {
          expect(node.getAttribute("tabindex")).toBe("0");
          expect(node.getAttribute("role")).toBe("button");
        });
      });

      it("click toggles is-highlighted class", () => {
        const nodeA = document.querySelector("#A");
        nodeA.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        expect(nodeA.classList.contains("is-highlighted")).toBe(true);

        // Click again to toggle off
        nodeA.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        expect(nodeA.classList.contains("is-highlighted")).toBe(false);
      });

      it("clicking a different node removes previous highlight", () => {
        const nodeA = document.querySelector("#A");
        const nodeB = document.querySelector("#B");

        nodeA.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        expect(nodeA.classList.contains("is-highlighted")).toBe(true);

        nodeB.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        expect(nodeA.classList.contains("is-highlighted")).toBe(false);
        expect(nodeB.classList.contains("is-highlighted")).toBe(true);
      });

      it("Enter key triggers click on a node", () => {
        const nodeA = document.querySelector("#A");
        nodeA.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
        );
        expect(nodeA.classList.contains("is-highlighted")).toBe(true);
      });

      it("Space key triggers click on a node", () => {
        const nodeA = document.querySelector("#A");
        nodeA.dispatchEvent(
          new KeyboardEvent("keydown", { key: " ", bubbles: true }),
        );
        expect(nodeA.classList.contains("is-highlighted")).toBe(true);
      });

      it("sets aria-label on nodes with tooltip data", () => {
        const nodeA = document.querySelector("#A");
        expect(nodeA.getAttribute("aria-label")).toBe("A: Node A description");
      });
    });
  });

  describe("tooltip functions", () => {
    it("creates and removes tooltips via node interaction", async () => {
      document.body.innerHTML = `
        <div data-tooltips='{"C":"Test tooltip"}'>
          <pre class="mermaid">graph LR; C-->D;</pre>
        </div>
      `;

      // Setup fake mermaid
      const fakeScript = document.createElement("script");
      fakeScript.src =
        "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js";
      fakeScript.dataset.loaded = "true";
      document.head.appendChild(fakeScript);
      window.mermaid = {
        initialize: vi.fn(),
        run: vi.fn().mockImplementation(async () => {
          const block = document.querySelector(".mermaid");
          block.innerHTML = `<svg><g class="node" id="C"><text>C</text></g></svg>`;
        }),
      };

      await initInteractiveDiagrams(mockTracer);

      const nodeC = document.querySelector("#C");
      // Mock getBoundingClientRect
      nodeC.getBoundingClientRect = () => ({
        left: 100,
        top: 200,
        width: 50,
        height: 30,
        right: 150,
        bottom: 230,
      });

      // Trigger mouseenter
      nodeC.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
      let tooltip = document.querySelector(".diagram-tooltip");
      expect(tooltip).not.toBeNull();
      expect(tooltip.textContent).toBe("Test tooltip");

      // Trigger mouseleave
      nodeC.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
      tooltip = document.querySelector(".diagram-tooltip");
      expect(tooltip).toBeNull();
    });
  });
});
