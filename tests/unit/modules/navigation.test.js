/**
 * Unit tests for the Navigation module
 * @module tests/unit/modules/navigation.test
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  initNavigation,
  initMobileNav,
  initDropdowns,
} from "../../../src/assets/js/modules/navigation.js";

describe("navigation module", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.body.removeAttribute("data-mobile-nav-open");
    document.body.classList.remove("nav-open");

    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  describe("initMobileNav", () => {
    it("does nothing when toggle element is missing", () => {
      expect(() => initMobileNav()).not.toThrow();
    });

    it("opens mobile nav on toggle click", () => {
      document.body.innerHTML = `
        <button data-mobile-menu-toggle aria-expanded="false">Menu</button>
        <nav data-mobile-nav>
          <a href="/">Home</a>
        </nav>
      `;
      initMobileNav();

      const toggle = document.querySelector("[data-mobile-menu-toggle]");
      toggle.click();

      const nav = document.querySelector("[data-mobile-nav]");
      expect(nav.hasAttribute("data-mobile-nav-open")).toBe(true);
      expect(toggle.getAttribute("aria-expanded")).toBe("true");
      expect(document.body.hasAttribute("data-mobile-nav-open")).toBe(true);
    });

    it("closes mobile nav on second toggle click", () => {
      document.body.innerHTML = `
        <button data-mobile-menu-toggle aria-expanded="false">Menu</button>
        <nav data-mobile-nav>
          <a href="/">Home</a>
        </nav>
      `;
      initMobileNav();

      const toggle = document.querySelector("[data-mobile-menu-toggle]");
      toggle.click(); // open
      toggle.click(); // close

      const nav = document.querySelector("[data-mobile-nav]");
      expect(nav.hasAttribute("data-mobile-nav-open")).toBe(false);
      expect(toggle.getAttribute("aria-expanded")).toBe("false");
    });

    it("closes mobile nav on Escape key", () => {
      document.body.innerHTML = `
        <button data-mobile-menu-toggle aria-expanded="false">Menu</button>
        <nav data-mobile-nav>
          <a href="/">Home</a>
        </nav>
      `;
      initMobileNav();

      const toggle = document.querySelector("[data-mobile-menu-toggle]");
      toggle.click();

      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

      const nav = document.querySelector("[data-mobile-nav]");
      expect(nav.hasAttribute("data-mobile-nav-open")).toBe(false);
    });

    it("closes mobile nav on click outside", () => {
      document.body.innerHTML = `
        <button data-mobile-menu-toggle aria-expanded="false">Menu</button>
        <nav data-mobile-nav>
          <a href="/">Home</a>
        </nav>
        <div id="outside">Outside</div>
      `;
      initMobileNav();

      const toggle = document.querySelector("[data-mobile-menu-toggle]");
      toggle.click();

      document.body.click();

      const nav = document.querySelector("[data-mobile-nav]");
      expect(nav.hasAttribute("data-mobile-nav-open")).toBe(false);
    });

    it("closes mobile nav when a link is clicked inside", () => {
      document.body.innerHTML = `
        <button data-mobile-menu-toggle aria-expanded="false">Menu</button>
        <nav data-mobile-nav>
          <a href="/">Home</a>
        </nav>
      `;
      initMobileNav();

      const toggle = document.querySelector("[data-mobile-menu-toggle]");
      toggle.click();

      const link = document.querySelector("[data-mobile-nav] a");
      link.click();

      const nav = document.querySelector("[data-mobile-nav]");
      expect(nav.hasAttribute("data-mobile-nav-open")).toBe(false);
    });
  });

  describe("initDropdowns", () => {
    it("does nothing if no dropdown toggles exist", () => {
      expect(() => initDropdowns()).not.toThrow();
    });

    it("toggles dropdown on click", () => {
      document.body.innerHTML = `
        <div class="nav-dropdown">
          <button class="nav-dropdown-toggle" aria-expanded="false">Menu</button>
          <div class="nav-dropdown-menu">
            <a href="/">Item 1</a>
          </div>
        </div>
      `;
      initDropdowns();

      const toggle = document.querySelector(".nav-dropdown-toggle");
      toggle.click();
      expect(toggle.getAttribute("aria-expanded")).toBe("true");

      toggle.click();
      expect(toggle.getAttribute("aria-expanded")).toBe("false");
    });

    it("closes other dropdowns when opening one", () => {
      document.body.innerHTML = `
        <div class="nav-dropdown">
          <button class="nav-dropdown-toggle" aria-expanded="false">A</button>
          <div class="nav-dropdown-menu"><a href="/">A1</a></div>
        </div>
        <div class="nav-dropdown">
          <button class="nav-dropdown-toggle" aria-expanded="false">B</button>
          <div class="nav-dropdown-menu"><a href="/">B1</a></div>
        </div>
      `;
      initDropdowns();

      const [toggleA, toggleB] = document.querySelectorAll(
        ".nav-dropdown-toggle",
      );
      toggleA.click();
      expect(toggleA.getAttribute("aria-expanded")).toBe("true");

      toggleB.click();
      expect(toggleA.getAttribute("aria-expanded")).toBe("false");
      expect(toggleB.getAttribute("aria-expanded")).toBe("true");
    });

    it("closes dropdown on Escape key from toggle", () => {
      document.body.innerHTML = `
        <div class="nav-dropdown">
          <button class="nav-dropdown-toggle" aria-expanded="false">Menu</button>
          <div class="nav-dropdown-menu"><a href="/">Item</a></div>
        </div>
      `;
      initDropdowns();

      const toggle = document.querySelector(".nav-dropdown-toggle");
      toggle.click();
      expect(toggle.getAttribute("aria-expanded")).toBe("true");

      toggle.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      expect(toggle.getAttribute("aria-expanded")).toBe("false");
    });

    it("closes dropdown on click outside", () => {
      document.body.innerHTML = `
        <div class="nav-dropdown">
          <button class="nav-dropdown-toggle" aria-expanded="false">Menu</button>
          <div class="nav-dropdown-menu"><a href="/">Item</a></div>
        </div>
        <div id="outside">Outside</div>
      `;
      initDropdowns();

      const toggle = document.querySelector(".nav-dropdown-toggle");
      toggle.click();

      document.getElementById("outside").click();
      expect(toggle.getAttribute("aria-expanded")).toBe("false");
    });
  });

  describe("initNavigation", () => {
    it("initializes all sub-components without errors", () => {
      document.body.innerHTML = `
        <button data-mobile-menu-toggle aria-expanded="false">Menu</button>
        <nav data-mobile-nav><a href="/">Home</a></nav>
        <div class="nav-dropdown">
          <button class="nav-dropdown-toggle" aria-expanded="false">More</button>
          <div class="nav-dropdown-menu"><a href="/">Link</a></div>
        </div>
      `;
      expect(() => initNavigation()).not.toThrow();
    });
  });

  describe("initLegacyNavPanel", () => {
    it("does nothing without toggle or panel elements", () => {
      expect(() => initNavigation()).not.toThrow();
    });

    it("toggles legacy nav panel on click", () => {
      document.body.innerHTML = `
        <button data-nav-toggle aria-expanded="false">Menu</button>
        <nav data-nav-panel>
          <a href="/">Home</a>
        </nav>
      `;
      initNavigation();

      const toggle = document.querySelector("[data-nav-toggle]");
      toggle.click();

      const panel = document.querySelector("[data-nav-panel]");
      expect(panel.classList.contains("is-open")).toBe(true);
      expect(toggle.getAttribute("aria-expanded")).toBe("true");
      expect(document.body.classList.contains("nav-open")).toBe(true);
    });

    it("closes legacy nav panel on second click", () => {
      document.body.innerHTML = `
        <button data-nav-toggle aria-expanded="false">Menu</button>
        <nav data-nav-panel>
          <a href="/">Home</a>
        </nav>
      `;
      initNavigation();

      const toggle = document.querySelector("[data-nav-toggle]");
      toggle.click(); // open
      toggle.click(); // close

      const panel = document.querySelector("[data-nav-panel]");
      expect(panel.classList.contains("is-open")).toBe(false);
      expect(toggle.getAttribute("aria-expanded")).toBe("false");
    });

    it("closes legacy nav panel on Escape key", () => {
      document.body.innerHTML = `
        <button data-nav-toggle aria-expanded="false">Menu</button>
        <nav data-nav-panel>
          <a href="/">Home</a>
        </nav>
      `;
      initNavigation();

      const toggle = document.querySelector("[data-nav-toggle]");
      toggle.click();

      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

      const panel = document.querySelector("[data-nav-panel]");
      expect(panel.classList.contains("is-open")).toBe(false);
    });

    it("closes legacy nav panel when a link inside is clicked", () => {
      document.body.innerHTML = `
        <button data-nav-toggle aria-expanded="false">Menu</button>
        <nav data-nav-panel>
          <a href="/">Home</a>
        </nav>
      `;
      initNavigation();

      const toggle = document.querySelector("[data-nav-toggle]");
      toggle.click();

      const link = document.querySelector("[data-nav-panel] a");
      link.click();

      const panel = document.querySelector("[data-nav-panel]");
      expect(panel.classList.contains("is-open")).toBe(false);
    });

    it("closes legacy nav panel on resize to desktop", () => {
      document.body.innerHTML = `
        <button data-nav-toggle aria-expanded="false">Menu</button>
        <nav data-nav-panel>
          <a href="/">Home</a>
        </nav>
      `;

      // Mock matchMedia for mobile initially
      window.matchMedia = vi.fn().mockImplementation((query) => ({
        matches: query === "(min-width: 901px)",
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      initNavigation();
      const toggle = document.querySelector("[data-nav-toggle]");
      toggle.click();

      // Simulate resize
      window.dispatchEvent(new Event("resize"));

      const panel = document.querySelector("[data-nav-panel]");
      expect(panel.classList.contains("is-open")).toBe(false);
    });
  });

  describe("dropdown keyboard navigation", () => {
    it("opens dropdown on Enter key", () => {
      document.body.innerHTML = `
        <div class="nav-dropdown">
          <button class="nav-dropdown-toggle" aria-expanded="false">Menu</button>
          <div class="nav-dropdown-menu"><a href="/">Item</a></div>
        </div>
      `;
      initDropdowns();

      const toggle = document.querySelector(".nav-dropdown-toggle");
      toggle.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
      expect(toggle.getAttribute("aria-expanded")).toBe("true");
    });

    it("opens dropdown on Space key", () => {
      document.body.innerHTML = `
        <div class="nav-dropdown">
          <button class="nav-dropdown-toggle" aria-expanded="false">Menu</button>
          <div class="nav-dropdown-menu"><a href="/">Item</a></div>
        </div>
      `;
      initDropdowns();

      const toggle = document.querySelector(".nav-dropdown-toggle");
      toggle.dispatchEvent(
        new KeyboardEvent("keydown", { key: " ", bubbles: true }),
      );
      expect(toggle.getAttribute("aria-expanded")).toBe("true");
    });

    it("closes dropdown on Escape key from menu", () => {
      document.body.innerHTML = `
        <div class="nav-dropdown">
          <button class="nav-dropdown-toggle" aria-expanded="false">Menu</button>
          <div class="nav-dropdown-menu"><a href="/">Item</a></div>
        </div>
      `;
      initDropdowns();

      const toggle = document.querySelector(".nav-dropdown-toggle");
      toggle.click();

      const menu = document.querySelector(".nav-dropdown-menu");
      menu.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      expect(toggle.getAttribute("aria-expanded")).toBe("false");
    });
  });
});
