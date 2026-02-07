/**
 * Interactive Diagrams Module
 *
 * Lazy-loads Mermaid.js and enhances diagram blocks with:
 * - Theme-aware rendering (light/dark)
 * - Clickable nodes that highlight and show tooltips
 * - Animated transitions between states
 * - Progressive enhancement (raw text visible without JS)
 *
 * @module interactive-diagrams
 * @exports {function} initInteractiveDiagrams
 */

const doc = document;

/** CDN URL for Mermaid.js (ESM build) */
const MERMAID_CDN =
  "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js";

/**
 * Load an external script dynamically and return a promise.
 * @param {string} src - Script URL
 * @returns {Promise<void>}
 */
const loadScript = (src) =>
  new Promise((resolve, reject) => {
    const existing = doc.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === "true") {
        resolve();
        return;
      }
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error(`Failed: ${src}`)),
        { once: true },
      );
      return;
    }
    const script = doc.createElement("script");
    script.src = src;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      resolve();
    });
    script.addEventListener("error", () => reject(new Error(`Failed: ${src}`)));
    doc.head.appendChild(script);
  });

/**
 * Detect current theme preference.
 * @returns {'dark' | 'default'}
 */
const getTheme = () => {
  const html = doc.documentElement;
  const stored = html.getAttribute("data-theme") || html.dataset.theme;
  if (stored === "dark") return "dark";
  if (stored === "light") return "default";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "default";
};

/**
 * Create a tooltip element for diagram nodes.
 * @param {string} text - Tooltip content
 * @param {DOMRect} rect - Bounding rect of the target node
 * @returns {HTMLElement}
 */
const createTooltip = (text, rect) => {
  const tip = doc.createElement("div");
  tip.className = "diagram-tooltip";
  tip.setAttribute("role", "tooltip");
  tip.textContent = text;
  tip.style.left = `${rect.left + rect.width / 2}px`;
  tip.style.top = `${rect.top - 8}px`;
  doc.body.appendChild(tip);
  return tip;
};

/**
 * Remove all active tooltips.
 */
const clearTooltips = () => {
  doc.querySelectorAll(".diagram-tooltip").forEach((el) => el.remove());
};

/**
 * Enhance a rendered Mermaid SVG with interactive features.
 * @param {HTMLElement} container - The diagram container element
 */
const enhanceDiagram = (container) => {
  const svg = container.querySelector("svg");
  if (!svg) return;

  // Parse tooltip data from the container
  const tooltipData = {};
  try {
    const raw =
      container.dataset.tooltips ||
      container.closest("[data-tooltips]")?.dataset.tooltips;
    if (raw) Object.assign(tooltipData, JSON.parse(raw));
  } catch {
    /* ignore parse errors */
  }

  // Find all clickable nodes (g.node elements in Mermaid SVG)
  const nodes = svg.querySelectorAll("g.node, g.cluster");

  // If there are interactive child nodes, use role="group" to avoid
  // nested-interactive a11y violations.  Otherwise make the SVG itself
  // focusable so keyboard users can still reach the diagram.
  if (nodes.length) {
    svg.setAttribute("role", "group");
    // Walk up from the mermaid container to find any ancestor with role="img"
    // and switch it to role="figure" to avoid nested-interactive violations.
    let ancestor = container;
    while (ancestor && ancestor !== doc.body) {
      if (ancestor.getAttribute("role") === "img") {
        ancestor.setAttribute("role", "figure");
      }
      ancestor = ancestor.parentElement;
    }
  } else {
    svg.setAttribute("tabindex", "0");
    svg.setAttribute("role", "img");
  }
  const label = container.dataset.label || container.getAttribute("aria-label");
  if (label) svg.setAttribute("aria-label", label);

  nodes.forEach((node) => {
    // Extract the node ID from Mermaid's rendered structure
    const nodeId =
      node.id || node.querySelector("text")?.textContent?.trim() || "";

    node.classList.add("diagram-interactive-node");

    // Tooltip on hover
    if (tooltipData[nodeId]) {
      node.addEventListener("mouseenter", () => {
        clearTooltips();
        const rect = node.getBoundingClientRect();
        createTooltip(tooltipData[nodeId], rect);
      });
      node.addEventListener("mouseleave", clearTooltips);
      node.addEventListener("focus", () => {
        clearTooltips();
        const rect = node.getBoundingClientRect();
        createTooltip(tooltipData[nodeId], rect);
      });
      node.addEventListener("blur", clearTooltips);
    }

    // Click-to-highlight
    node.addEventListener("click", () => {
      const wasActive = node.classList.contains("is-highlighted");
      // Clear all highlights first
      nodes.forEach((n) => n.classList.remove("is-highlighted"));
      if (!wasActive) {
        node.classList.add("is-highlighted");
      }
    });

    // Make individual nodes focusable
    node.setAttribute("tabindex", "0");
    node.setAttribute("role", "button");
    if (tooltipData[nodeId]) {
      node.setAttribute("aria-label", `${nodeId}: ${tooltipData[nodeId]}`);
    }

    // Enter key triggers click
    node.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      }
    });
  });

  // Add animation class for entrance effect
  container.classList.add("diagram-rendered");
};

/**
 * Initialize interactive diagrams on the page.
 * Detects `.mermaid` blocks, lazy-loads Mermaid.js, renders them,
 * and adds interactive features.
 *
 * @param {object} [tracer] - Optional OpenTelemetry tracer
 */
const initInteractiveDiagrams = async (tracer) => {
  const blocks = doc.querySelectorAll("pre.mermaid, .mermaid:not(svg)");
  if (blocks.length === 0) return;

  // Add loading indicator to each block
  blocks.forEach((block) => {
    if (!block.classList.contains("diagram-loading")) {
      block.classList.add("diagram-loading");
    }
  });

  try {
    await loadScript(MERMAID_CDN);
  } catch (error) {
    console.warn("Mermaid.js failed to load:", error);
    blocks.forEach((block) => block.classList.remove("diagram-loading"));
    return;
  }

  const mermaid = window.mermaid;
  if (!mermaid) return;

  const theme = getTheme();
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme,
    fontFamily: "inherit",
  });

  try {
    await mermaid.run({ querySelector: "pre.mermaid, .mermaid:not(svg)" });
  } catch (error) {
    console.warn("Mermaid rendering failed:", error);
  }

  // Enhance each diagram after rendering
  blocks.forEach((block) => {
    block.classList.remove("diagram-loading");
    enhanceDiagram(block);
  });

  // Re-render on theme change
  const observer = new MutationObserver(() => {
    const newTheme = getTheme();
    if (newTheme !== theme) {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: newTheme,
        fontFamily: "inherit",
      });
      // Re-run would need original source — for now just update CSS
      doc.querySelectorAll(".diagram-rendered").forEach((el) => {
        el.dataset.theme = newTheme;
      });
    }
  });
  observer.observe(doc.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });

  // Track interaction
  if (tracer && typeof tracer.trackInteraction === "function") {
    try {
      tracer.trackInteraction("diagrams-loaded", {
        count: blocks.length,
      });
    } catch {
      /* silent */
    }
  }
};

export { initInteractiveDiagrams };
