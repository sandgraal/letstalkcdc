/**
 * Search Module
 * Creates a search overlay with keyboard shortcuts, result ranking,
 * and OpenTelemetry search tracking.
 *
 * @module search
 * @exports {function} initSearch - Initialize the search overlay
 */

import { withBasePath } from "../utils/path-prefix.js";

const doc = document;

/**
 * Initialize the search overlay, fetch the search index, and set up
 * keyboard shortcuts and result rendering.
 *
 * @param {object} tracer - OpenTelemetry education tracer instance
 */
const initSearch = (tracer) => {
  const overlay = doc.createElement("div");
  overlay.className = "search-overlay hidden";
  overlay.innerHTML = `
    <div class="search-panel" role="dialog" aria-modal="true" aria-labelledby="searchTitle">
      <div class="search-header">
        <h2 id="searchTitle">Search the CDC Manual</h2>
        <input type="search" id="searchInput" placeholder="Search pages, concepts, and code..." aria-label="Search text">
        <button class="btn close-search" aria-label="Close search">×</button>
      </div>
      <div id="searchResults" class="search-results" role="listbox" aria-label="Search results"></div>
      <div class="search-hint">Press <kbd>/</kbd> to open. <kbd>Esc</kbd> to close.</div>
    </div>`;
  doc.body.appendChild(overlay);

  const input = overlay.querySelector("#searchInput");
  const results = overlay.querySelector("#searchResults");
  const closeBtn = overlay.querySelector(".close-search");
  let data = [];

  fetch(withBasePath("/search-index.json"), { cache: "force-cache" })
    .then((res) => (res.ok ? res.json() : []))
    .then((json) => {
      if (Array.isArray(json)) {
        data = json;
      }
    })
    .catch(() => {
      data = [];
    });

  const openOverlay = () => {
    const openNav = doc.querySelector("[data-nav-panel].is-open");
    if (openNav) {
      openNav.classList.remove("is-open");
      doc.body.classList.remove("nav-open");
      const navToggle = doc.querySelector("[data-nav-toggle]");
      if (navToggle) navToggle.setAttribute("aria-expanded", "false");
    }
    overlay.classList.remove("hidden");
    input.value = "";
    results.innerHTML = "";
    input.focus();
  };

  const closeOverlay = () => {
    overlay.classList.add("hidden");
  };

  doc.addEventListener("keydown", (event) => {
    if (
      event.key === "/" &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey
    ) {
      event.preventDefault();
      openOverlay();
    } else if (
      event.key === "Escape" &&
      !overlay.classList.contains("hidden")
    ) {
      closeOverlay();
    }
  });

  closeBtn.addEventListener("click", closeOverlay);

  const render = (items) => {
    results.innerHTML = items
      .slice(0, 30)
      .map((item) => {
        const snippet = (item.text || "").slice(0, 240).replace(/</g, "&lt;");
        return `<a class="result" href="${item.path}"><strong>${item.title}</strong><div class="snippet">${snippet}...</div></a>`;
      })
      .join("");
  };

  input.addEventListener("input", () => {
    const query = input.value.trim().toLowerCase();
    if (!query) {
      results.innerHTML = "";
      return;
    }
    const terms = query.split(/\s+/).filter(Boolean);
    const scored = data
      .map((item) => {
        let score = 0;
        const text = (item.text || "").toLowerCase();
        terms.forEach((term) => {
          const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const matches = (text.match(new RegExp(escaped, "g")) || []).length;
          score += matches * (term.length >= 4 ? 2 : 1);
          if ((item.title || "").toLowerCase().includes(term)) {
            score += 5;
          }
        });
        return { ...item, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);

    render(scored);

    try {
      tracer.trackSearch(query, scored.length);
    } catch (error) {
      console.debug("Search tracking failed:", error);
    }
  });

  // Add search trigger button to nav utilities
  const utilities =
    doc.querySelector(".nav-utilities") ||
    doc.querySelector(".nav-right, header .nav-links");
  if (utilities) {
    const trigger = doc.createElement("button");
    trigger.className = "button ghost search-btn";
    trigger.type = "button";
    trigger.textContent = "Search";
    trigger.addEventListener("click", openOverlay);
    utilities.appendChild(trigger);
  }
};

export { initSearch };
