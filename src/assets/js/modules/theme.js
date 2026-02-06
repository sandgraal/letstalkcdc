/**
 * Theme Module
 * Manages dark/light theme toggling, persistence, and system preference detection.
 * Also handles prefers-reduced-motion detection.
 *
 * @module theme
 * @exports {function} initTheme - Initialize theme management
 * @exports {function} applyTheme - Apply a specific theme mode
 */

const doc = document;

/**
 * Sync all theme toggle button ARIA states to match current mode.
 * @param {string} mode - "dark" or "light"
 */
const syncThemeToggle = (mode) => {
  doc.querySelectorAll("[data-toggle-theme]").forEach((button) => {
    button.setAttribute("aria-pressed", mode === "dark" ? "true" : "false");
  });
};

/**
 * Apply the given theme mode to the document and update toggle states.
 * @param {string} mode - "dark" or "light"
 */
const applyTheme = (mode) => {
  doc.documentElement.dataset.theme = mode;
  syncThemeToggle(mode);
};

/**
 * Retrieve the stored theme preference from localStorage.
 * @returns {string|null} The stored theme, or null if unavailable
 */
const getStoredTheme = () => {
  try {
    return localStorage.getItem("theme");
  } catch (_) {
    return null;
  }
};

/**
 * Persist the theme preference to localStorage.
 * @param {string} mode - "dark" or "light"
 */
const setStoredTheme = (mode) => {
  try {
    localStorage.setItem("theme", mode);
  } catch (_) {
    /* storage denied */
  }
};

/**
 * Initialize theme management.
 * Sets the initial theme from localStorage or system preference,
 * attaches click listeners for theme toggle buttons,
 * listens for system preference changes, and handles prefers-reduced-motion.
 */
const initTheme = () => {
  const themeMediaQuery = window.matchMedia
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : null;

  const initialTheme =
    getStoredTheme() ?? (themeMediaQuery?.matches ? "dark" : "light");

  applyTheme(initialTheme);

  doc.addEventListener("click", (event) => {
    const target = event.target.closest("[data-toggle-theme]");
    if (!target) return;
    const next =
      doc.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(next);
    setStoredTheme(next);
  });

  if (themeMediaQuery) {
    themeMediaQuery.addEventListener("change", (event) => {
      if (getStoredTheme()) return;
      applyTheme(event.matches ? "dark" : "light");
    });
  }

  if (window.matchMedia) {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduceMotion.matches) {
      doc.documentElement.classList.add("reduce-motion");
    }
    reduceMotion.addEventListener("change", (event) => {
      doc.documentElement.classList.toggle("reduce-motion", event.matches);
    });
  }
};

export { initTheme, applyTheme };
