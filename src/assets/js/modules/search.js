/**
 * Search Module
 * Fuzzy search overlay powered by Fuse.js with keyboard navigation,
 * match highlighting, and OpenTelemetry search tracking.
 *
 * @module search
 * @exports {function} initSearch - Initialize the search overlay
 */

import Fuse from "fuse.js";
import { withBasePath } from "../utils/path-prefix.js";

const doc = document;

/** Fuse.js configuration */
const FUSE_OPTIONS = {
  keys: [
    { name: "title", weight: 0.4 },
    { name: "description", weight: 0.25 },
    { name: "headings", weight: 0.2 },
    { name: "tags", weight: 0.1 },
    { name: "text", weight: 0.05 },
  ],
  threshold: 0.35,
  ignoreLocation: true,
  includeScore: true,
  includeMatches: true,
  minMatchCharLength: 2,
  shouldSort: true,
};

const MAX_RESULTS = 30;

/**
 * Highlight matched portions of text using <mark> tags.
 * @param {string} text - The original text
 * @param {Array} indices - Array of [start, end] index pairs from Fuse.js
 * @returns {string} HTML string with <mark> wrapped matches
 */
const highlightMatches = (text, indices) => {
  if (!indices || indices.length === 0) return escapeHtml(text);

  const result = [];
  let lastIndex = 0;

  // Sort indices by start position
  const sorted = [...indices].sort((a, b) => a[0] - b[0]);

  for (const [start, end] of sorted) {
    if (start > lastIndex) {
      result.push(escapeHtml(text.slice(lastIndex, start)));
    }
    result.push(`<mark>${escapeHtml(text.slice(start, end + 1))}</mark>`);
    lastIndex = end + 1;
  }

  if (lastIndex < text.length) {
    result.push(escapeHtml(text.slice(lastIndex)));
  }

  return result.join("");
};

const escapeHtml = (str) => str.replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Initialize the search overlay, fetch the search index, and set up
 * keyboard shortcuts, fuzzy search, and result rendering.
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
        <input type="search" id="searchInput" placeholder="Search pages, concepts, and code..." aria-label="Search text" autocomplete="off">
        <button class="btn close-search" aria-label="Close search">×</button>
      </div>
      <div class="search-meta" aria-live="polite"></div>
      <div id="searchResults" class="search-results" role="listbox" aria-label="Search results"></div>
      <div class="search-hint">Press <kbd>/</kbd> to open · <kbd>↑</kbd><kbd>↓</kbd> to navigate · <kbd>Enter</kbd> to go · <kbd>Esc</kbd> to close</div>
    </div>`;
  doc.body.appendChild(overlay);

  const input = overlay.querySelector("#searchInput");
  const results = overlay.querySelector("#searchResults");
  const meta = overlay.querySelector(".search-meta");
  const closeBtn = overlay.querySelector(".close-search");
  let fuse = null;
  let activeIndex = -1;

  // Fetch search index and build Fuse instance
  fetch(withBasePath("/search-index.json"), { cache: "force-cache" })
    .then((res) => (res.ok ? res.json() : []))
    .then((json) => {
      if (Array.isArray(json) && json.length > 0) {
        fuse = new Fuse(json, FUSE_OPTIONS);
      }
    })
    .catch(() => {
      fuse = null;
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
    meta.textContent = "";
    activeIndex = -1;
    input.focus();
  };

  const closeOverlay = () => {
    overlay.classList.add("hidden");
    activeIndex = -1;
  };

  /**
   * Update the visually active result and apply aria-activedescendant.
   * @param {number} index - The index to highlight (-1 clears)
   */
  const setActiveResult = (index) => {
    const items = results.querySelectorAll(".result");
    items.forEach((el, i) => {
      el.classList.toggle("is-active", i === index);
      el.setAttribute("aria-selected", i === index ? "true" : "false");
    });
    activeIndex = index;
    if (index >= 0 && items[index]) {
      input.setAttribute("aria-activedescendant", items[index].id);
      if (typeof items[index].scrollIntoView === "function") {
        items[index].scrollIntoView({ block: "nearest" });
      }
    } else {
      input.removeAttribute("aria-activedescendant");
    }
  };

  // Global keyboard shortcuts
  doc.addEventListener("keydown", (event) => {
    if (
      event.key === "/" &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey
    ) {
      const tag = (event.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
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

  /**
   * Render fuzzy search results with match highlighting.
   * @param {Array} fuseResults - Fuse.js result objects
   */
  const render = (fuseResults) => {
    if (fuseResults.length === 0) {
      results.innerHTML =
        '<div class="search-empty" role="status">No results found. Try a different search term.</div>';
      meta.textContent = "";
      return;
    }

    const count = Math.min(fuseResults.length, MAX_RESULTS);
    meta.textContent = `${fuseResults.length} result${fuseResults.length !== 1 ? "s" : ""} found`;

    results.innerHTML = fuseResults
      .slice(0, MAX_RESULTS)
      .map((result, i) => {
        const item = result.item;
        // Find the best match for title
        const titleMatch = (result.matches || []).find(
          (m) => m.key === "title",
        );
        const titleHtml = titleMatch
          ? highlightMatches(item.title, titleMatch.indices)
          : escapeHtml(item.title);

        // Find snippet match (description > text > headings)
        let snippetHtml = "";
        const descMatch = (result.matches || []).find(
          (m) => m.key === "description",
        );
        const textMatch = (result.matches || []).find((m) => m.key === "text");

        if (descMatch) {
          const snippet = item.description.slice(0, 200);
          snippetHtml = highlightMatches(
            snippet,
            descMatch.indices.filter(([s]) => s < 200),
          );
        } else if (textMatch && textMatch.indices.length > 0) {
          // Show text around the first match
          const firstIdx = textMatch.indices[0][0];
          const start = Math.max(0, firstIdx - 40);
          const end = Math.min(item.text.length, firstIdx + 200);
          const snippet =
            (start > 0 ? "..." : "") + item.text.slice(start, end);
          const adjustedIndices = textMatch.indices
            .filter(([s, e]) => s >= start && e < end)
            .map(([s, e]) => [
              s - start + (start > 0 ? 3 : 0),
              e - start + (start > 0 ? 3 : 0),
            ]);
          snippetHtml = highlightMatches(snippet, adjustedIndices);
        } else {
          snippetHtml = escapeHtml(
            (item.description || item.text || "").slice(0, 200),
          );
        }

        const tagsHtml =
          item.tags && item.tags.length > 0
            ? `<div class="result-tags">${item.tags.map((t) => `<span class="result-tag">${escapeHtml(t)}</span>`).join("")}</div>`
            : "";

        return `<a class="result" id="search-result-${i}" href="${item.path}" role="option" aria-selected="false">
          <strong>${titleHtml}</strong>
          <div class="snippet">${snippetHtml}</div>
          ${tagsHtml}
        </a>`;
      })
      .join("");
  };

  // Search input handler with debounce
  let debounceTimer = null;
  input.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const query = input.value.trim();
      activeIndex = -1;

      if (!query || query.length < 2) {
        results.innerHTML = "";
        meta.textContent = "";
        return;
      }

      if (!fuse) {
        results.innerHTML =
          '<div class="search-empty" role="status">Search index loading...</div>';
        return;
      }

      const fuseResults = fuse.search(query);
      render(fuseResults);

      try {
        tracer.trackSearch(query, fuseResults.length);
      } catch (error) {
        console.debug("Search tracking failed:", error);
      }
    }, 150);
  });

  // Keyboard navigation within results
  input.addEventListener("keydown", (event) => {
    const items = results.querySelectorAll(".result");
    if (items.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      const next = activeIndex < items.length - 1 ? activeIndex + 1 : 0;
      setActiveResult(next);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      const prev = activeIndex > 0 ? activeIndex - 1 : items.length - 1;
      setActiveResult(prev);
    } else if (
      event.key === "Enter" &&
      activeIndex >= 0 &&
      items[activeIndex]
    ) {
      event.preventDefault();
      items[activeIndex].click();
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
