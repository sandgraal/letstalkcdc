// Client-side search functionality
// Uses the pre-generated search-index.json

import { withBasePath } from "./utils/path-prefix.js";

export function initSearch() {
  let searchIndex = null;
  let searchModal = null;
  let searchInput = null;
  let searchResults = null;

  // Lazy load search index
  async function loadSearchIndex() {
    if (searchIndex) return searchIndex;

    try {
      const response = await fetch(withBasePath("/search-index.json"));
      searchIndex = await response.json();
      console.debug("[search] ✓ Index loaded:", searchIndex.length, "pages");
      return searchIndex;
    } catch (err) {
      console.error("[search] ✗ Failed to load search index:", err);
      return [];
    }
  }

  // Create search modal
  function createSearchModal() {
    if (searchModal) return;

    searchModal = document.createElement("div");
    searchModal.id = "search-modal";
    searchModal.className = "search-modal";
    searchModal.innerHTML = `
      <div class="search-modal-backdrop"></div>
      <div class="search-modal-content">
        <div class="search-input-wrapper">
          <svg class="search-icon" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <path d="m21 21-4.35-4.35"></path>
          </svg>
          <input 
            type="text" 
            id="search-input" 
            class="search-input"
            placeholder="Search documentation..."
            autocomplete="off"
            spellcheck="false"
          />
          <kbd class="search-shortcut">ESC</kbd>
        </div>
        <div id="search-results" class="search-results"></div>
        <div class="search-footer">
          <span>Navigate with <kbd>↑</kbd><kbd>↓</kbd></span>
          <span>Select with <kbd>↵</kbd></span>
        </div>
      </div>
    `;

    document.body.appendChild(searchModal);
    searchInput = document.getElementById("search-input");
    searchResults = document.getElementById("search-results");

    // Event listeners
    searchModal
      .querySelector(".search-modal-backdrop")
      .addEventListener("click", closeSearch);
    searchInput.addEventListener("input", handleSearch);
    searchInput.addEventListener("keydown", handleKeyboard);
  }

  // Perform search
  function performSearch(query) {
    if (!searchIndex || !query || query.length < 2) {
      return [];
    }

    const lowerQuery = query.toLowerCase();
    const words = lowerQuery.split(/\s+/).filter((w) => w.length > 1);

    return searchIndex
      .map((page) => {
        let score = 0;

        // Title match (highest weight)
        if (page.title.toLowerCase().includes(lowerQuery)) {
          score += 100;
        }
        words.forEach((word) => {
          if (page.title.toLowerCase().includes(word)) score += 50;
        });

        // Description match
        if (
          page.description &&
          page.description.toLowerCase().includes(lowerQuery)
        ) {
          score += 50;
        }
        words.forEach((word) => {
          if (page.description && page.description.toLowerCase().includes(word))
            score += 25;
        });

        // Content match
        if (page.content && page.content.toLowerCase().includes(lowerQuery)) {
          score += 30;
        }
        words.forEach((word) => {
          if (page.content && page.content.toLowerCase().includes(word))
            score += 10;
        });

        // Tags match
        if (
          page.tags &&
          page.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))
        ) {
          score += 40;
        }

        return { ...page, score };
      })
      .filter((page) => page.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  }

  // Render search results
  function renderResults(results, query) {
    if (!results || results.length === 0) {
      searchResults.innerHTML = `
        <div class="search-no-results">
          <p>No results found for "<strong>${escapeHtml(query)}</strong>"</p>
          <p class="text-muted">Try different keywords or browse the <a href="${withBasePath('/overview/')}">module overview</a></p>
        </div>
      `;
      return;
    }

    const html = results
      .map((result, index) => {
        const excerpt = createExcerpt(
          result.content || result.description,
          query
        );
        return `
        <a href="${result.url}" class="search-result" data-index="${index}">
          <div class="search-result-title">${highlightMatch(
            result.title,
            query
          )}</div>
          ${
            result.description
              ? `<div class="search-result-description">${highlightMatch(
                  result.description,
                  query
                )}</div>`
              : ""
          }
          ${
            excerpt ? `<div class="search-result-excerpt">${excerpt}</div>` : ""
          }
        </a>
      `;
      })
      .join("");

    searchResults.innerHTML = html;

    // Select first result
    const firstResult = searchResults.querySelector(".search-result");
    if (firstResult) {
      firstResult.classList.add("selected");
    }
  }

  // Create excerpt with context
  function createExcerpt(text, query, length = 120) {
    if (!text) return "";

    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const index = lowerText.indexOf(lowerQuery);

    if (index === -1) return text.substring(0, length) + "...";

    const start = Math.max(0, index - 40);
    const end = Math.min(text.length, index + query.length + 80);

    let excerpt = text.substring(start, end);
    if (start > 0) excerpt = "..." + excerpt;
    if (end < text.length) excerpt = excerpt + "...";

    return highlightMatch(excerpt, query);
  }

  // Highlight matching text
  function highlightMatch(text, query) {
    if (!text || !query) return text;

    const regex = new RegExp(`(${escapeRegex(query)})`, "gi");
    return text.replace(regex, "<mark>$1</mark>");
  }

  // Escape HTML
  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // Escape regex special characters
  function escapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // Handle search input
  let searchTimeout;
  function handleSearch(e) {
    const query = e.target.value.trim();

    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async () => {
      if (query.length < 2) {
        searchResults.innerHTML =
          '<div class="search-hint">Type at least 2 characters to search...</div>';
        return;
      }

      await loadSearchIndex();
      const results = performSearch(query);
      renderResults(results, query);

      // Track search (if tracing enabled)
      if (window.educationTracer) {
        window.educationTracer.trackSearch(query, results.length);
      }
    }, 300);
  }

  // Handle keyboard navigation
  function handleKeyboard(e) {
    const results = searchResults.querySelectorAll(".search-result");
    const selected = searchResults.querySelector(".search-result.selected");
    const selectedIndex = selected ? parseInt(selected.dataset.index) : -1;

    if (e.key === "Escape") {
      e.preventDefault();
      closeSearch();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const nextIndex = Math.min(selectedIndex + 1, results.length - 1);
      selectResult(nextIndex);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prevIndex = Math.max(selectedIndex - 1, 0);
      selectResult(prevIndex);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selected) {
        window.location.href = selected.href;
      }
    }
  }

  // Select result by index
  function selectResult(index) {
    const results = searchResults.querySelectorAll(".search-result");
    results.forEach((r) => r.classList.remove("selected"));

    if (results[index]) {
      results[index].classList.add("selected");
      results[index].scrollIntoView({ block: "nearest" });
    }
  }

  // Open search modal
  function openSearch() {
    if (!searchModal) {
      createSearchModal();
    }

    searchModal.classList.add("active");
    document.body.style.overflow = "hidden";

    setTimeout(() => {
      searchInput.focus();
    }, 100);
  }

  // Close search modal
  function closeSearch() {
    if (searchModal) {
      searchModal.classList.remove("active");
      document.body.style.overflow = "";
      searchInput.value = "";
      searchResults.innerHTML = "";
    }
  }

  // Keyboard shortcut (/)
  document.addEventListener("keydown", (e) => {
    // Open with "/" key (unless in input/textarea)
    if (e.key === "/" && !["INPUT", "TEXTAREA"].includes(e.target.tagName)) {
      e.preventDefault();
      openSearch();
    }

    // Close with Escape (global)
    if (
      e.key === "Escape" &&
      searchModal &&
      searchModal.classList.contains("active")
    ) {
      closeSearch();
    }
  });

  // Search button click
  const searchTriggers = document.querySelectorAll("[data-search-trigger]");
  searchTriggers.forEach((trigger) => {
    trigger.addEventListener("click", (e) => {
      e.preventDefault();
      openSearch();
    });
  });

  console.log("[search] ✓ Search initialized (keyboard shortcut: /)");

  return { openSearch, closeSearch };
}

// Auto-initialize
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initSearch);
} else {
  initSearch();
}
