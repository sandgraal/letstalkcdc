/**
 * Unit tests for the Theme module
 * @module tests/unit/modules/theme.test
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { initTheme, applyTheme } from "../../../src/assets/js/modules/theme.js";

describe("theme module", () => {
  // Track document-level listeners added by initTheme so we can clean up
  const trackedListeners = [];
  const origAddEventListener = document.addEventListener.bind(document);

  beforeEach(() => {
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.classList.remove("reduce-motion");
    document.body.innerHTML = `
      <button data-toggle-theme aria-pressed="false">Toggle</button>
    `;
    localStorage.clear();

    // Intercept document.addEventListener to track and clean up
    vi.spyOn(document, "addEventListener").mockImplementation(
      (type, fn, opts) => {
        trackedListeners.push({ type, fn, opts });
        origAddEventListener(type, fn, opts);
      },
    );

    // Reset matchMedia to default (light mode, motion allowed)
    window.matchMedia = vi.fn().mockImplementation((query) => {
      const mql = {
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      };
      return mql;
    });
  });

  afterEach(() => {
    // Remove all document-level listeners added during this test
    trackedListeners.forEach(({ type, fn, opts }) => {
      document.removeEventListener(type, fn, opts);
    });
    trackedListeners.length = 0;
    vi.restoreAllMocks();
  });

  describe("applyTheme", () => {
    it("sets data-theme attribute on documentElement", () => {
      applyTheme("dark");
      expect(document.documentElement.dataset.theme).toBe("dark");
    });

    it("syncs toggle button aria-pressed for dark mode", () => {
      applyTheme("dark");
      const btn = document.querySelector("[data-toggle-theme]");
      expect(btn.getAttribute("aria-pressed")).toBe("true");
    });

    it("syncs toggle button aria-pressed for light mode", () => {
      applyTheme("light");
      const btn = document.querySelector("[data-toggle-theme]");
      expect(btn.getAttribute("aria-pressed")).toBe("false");
    });
  });

  describe("initTheme", () => {
    it("defaults to light when no preference stored and system is light", () => {
      initTheme();
      expect(document.documentElement.dataset.theme).toBe("light");
    });

    it("uses stored preference from localStorage", () => {
      localStorage.setItem("theme", "dark");
      initTheme();
      expect(document.documentElement.dataset.theme).toBe("dark");
    });

    it("uses system dark preference when no stored value", () => {
      window.matchMedia = vi.fn().mockImplementation((query) => ({
        matches: query === "(prefers-color-scheme: dark)",
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));
      initTheme();
      expect(document.documentElement.dataset.theme).toBe("dark");
    });

    it("toggles theme on button click", () => {
      initTheme();
      expect(document.documentElement.dataset.theme).toBe("light");

      const btn = document.querySelector("[data-toggle-theme]");
      btn.click();
      expect(document.documentElement.dataset.theme).toBe("dark");
      expect(localStorage.getItem("theme")).toBe("dark");

      btn.click();
      expect(document.documentElement.dataset.theme).toBe("light");
      expect(localStorage.getItem("theme")).toBe("light");
    });

    it("responds to system preference change when no stored theme", () => {
      let changeHandler;
      window.matchMedia = vi.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn((event, handler) => {
          if (query === "(prefers-color-scheme: dark)") {
            changeHandler = handler;
          }
        }),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      initTheme();
      expect(document.documentElement.dataset.theme).toBe("light");

      // Simulate system changing to dark
      if (changeHandler) {
        changeHandler({ matches: true });
      }
      expect(document.documentElement.dataset.theme).toBe("dark");
    });

    it("ignores system preference change when theme is stored", () => {
      let changeHandler;
      localStorage.setItem("theme", "light");
      window.matchMedia = vi.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn((event, handler) => {
          if (query === "(prefers-color-scheme: dark)") {
            changeHandler = handler;
          }
        }),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      initTheme();
      if (changeHandler) {
        changeHandler({ matches: true });
      }
      // Should remain light because user stored preference overrides
      expect(document.documentElement.dataset.theme).toBe("light");
    });

    it("adds reduce-motion class when system prefers", () => {
      window.matchMedia = vi.fn().mockImplementation((query) => ({
        matches: query === "(prefers-reduced-motion: reduce)",
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      initTheme();
      expect(document.documentElement.classList.contains("reduce-motion")).toBe(
        true,
      );
    });
  });
});
