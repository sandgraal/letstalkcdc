/**
 * Unit tests for the Depth Toggle module
 * @module tests/unit/modules/depth-toggle.test
 */
import { describe, it, expect, beforeEach } from "vitest";
import { initDepthToggle } from "../../../src/assets/js/modules/depth-toggle.js";

describe("depth-toggle module", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-depth");
    document.body.innerHTML = "";
    localStorage.clear();
  });

  it("does nothing when no .depth-toggle element exists", () => {
    initDepthToggle();
    expect(document.documentElement.dataset.depth).toBeUndefined();
  });

  it("defaults to beginner when no stored preference", () => {
    document.body.innerHTML = `
      <div class="depth-toggle">
        <button class="depth-btn" data-depth="beginner">Beginner</button>
        <button class="depth-btn" data-depth="practitioner">Practitioner</button>
      </div>
      <div data-level="beginner">Beginner content</div>
      <div data-level="practitioner">Practitioner content</div>
    `;
    initDepthToggle();
    expect(document.documentElement.dataset.depth).toBe("beginner");
    // Use button selector — doc.documentElement also gets data-depth
    const beginnerBtn = document.querySelector('button[data-depth="beginner"]');
    expect(beginnerBtn.getAttribute("aria-pressed")).toBe("true");
  });

  it("reads stored preference from localStorage", () => {
    localStorage.setItem("cdcDepth", "practitioner");
    document.body.innerHTML = `
      <div class="depth-toggle">
        <button class="depth-btn" data-depth="beginner">Beginner</button>
        <button class="depth-btn" data-depth="practitioner">Practitioner</button>
      </div>
      <div data-level="beginner">Beginner content</div>
      <div data-level="practitioner">Practitioner content</div>
    `;
    initDepthToggle();
    expect(document.documentElement.dataset.depth).toBe("practitioner");
    const practitionerBtn = document.querySelector(
      'button[data-depth="practitioner"]',
    );
    expect(practitionerBtn.getAttribute("aria-pressed")).toBe("true");
  });

  it("toggles level sections on button click", () => {
    document.body.innerHTML = `
      <div class="depth-toggle">
        <button class="depth-btn" data-depth="beginner">Beginner</button>
        <button class="depth-btn" data-depth="practitioner">Practitioner</button>
      </div>
      <div data-level="beginner">Beginner content</div>
      <div data-level="practitioner">Practitioner content</div>
    `;
    initDepthToggle();

    const practitionerBtn = document.querySelector(
      'button[data-depth="practitioner"]',
    );
    practitionerBtn.click();

    expect(document.documentElement.dataset.depth).toBe("practitioner");
    expect(localStorage.getItem("cdcDepth")).toBe("practitioner");

    const beginnerContent = document.querySelector('[data-level="beginner"]');
    const practitionerContent = document.querySelector(
      '[data-level="practitioner"]',
    );
    expect(practitionerContent.classList.contains("is-active")).toBe(true);
    expect(beginnerContent.classList.contains("is-active")).toBe(false);
  });

  it("updates aria-pressed on all buttons when toggling", () => {
    document.body.innerHTML = `
      <div class="depth-toggle">
        <button class="depth-btn" data-depth="beginner">Beginner</button>
        <button class="depth-btn" data-depth="practitioner">Practitioner</button>
      </div>
    `;
    initDepthToggle();

    const beginnerBtn = document.querySelector('button[data-depth="beginner"]');
    const practitionerBtn = document.querySelector(
      'button[data-depth="practitioner"]',
    );

    practitionerBtn.click();
    expect(practitionerBtn.getAttribute("aria-pressed")).toBe("true");
    expect(beginnerBtn.getAttribute("aria-pressed")).toBe("false");

    beginnerBtn.click();
    expect(beginnerBtn.getAttribute("aria-pressed")).toBe("true");
    expect(practitionerBtn.getAttribute("aria-pressed")).toBe("false");
  });

  it("ignores clicks on non-depth-btn elements", () => {
    document.body.innerHTML = `
      <div class="depth-toggle">
        <button class="depth-btn" data-depth="beginner">Beginner</button>
        <span>Not a button</span>
      </div>
    `;
    initDepthToggle();
    const span = document.querySelector("span");
    span.click();
    expect(document.documentElement.dataset.depth).toBe("beginner");
  });
});
