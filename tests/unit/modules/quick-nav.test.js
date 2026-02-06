/**
 * Unit tests for the Quick Nav module
 * @module tests/unit/modules/quick-nav.test
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { initQuickNav } from "../../../src/assets/js/modules/quick-nav.js";

describe("quick-nav module", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    window.location.hash = "";
  });

  it("returns early when no .intro-quick-nav elements exist", () => {
    expect(() => initQuickNav()).not.toThrow();
  });

  it("marks the first link as active by default", () => {
    document.body.innerHTML = `
      <nav class="intro-quick-nav">
        <a href="#section-a">Section A</a>
        <a href="#section-b">Section B</a>
      </nav>
      <div id="section-a">A</div>
      <div id="section-b">B</div>
    `;
    initQuickNav();

    const linkA = document.querySelector('a[href="#section-a"]');
    expect(linkA.classList.contains("is-active")).toBe(true);
    expect(linkA.getAttribute("aria-current")).toBe("true");
  });

  it("activates the link matching the current hash", () => {
    document.body.innerHTML = `
      <nav class="intro-quick-nav">
        <a href="#section-a">Section A</a>
        <a href="#section-b">Section B</a>
      </nav>
      <div id="section-a">A</div>
      <div id="section-b">B</div>
    `;
    window.location.hash = "#section-b";
    initQuickNav();

    const linkB = document.querySelector('a[href="#section-b"]');
    expect(linkB.classList.contains("is-active")).toBe(true);
  });

  it("updates active link on link click", () => {
    document.body.innerHTML = `
      <nav class="intro-quick-nav">
        <a href="#section-a">Section A</a>
        <a href="#section-b">Section B</a>
      </nav>
      <div id="section-a">A</div>
      <div id="section-b">B</div>
    `;
    initQuickNav();

    const linkB = document.querySelector('a[href="#section-b"]');
    linkB.click();

    expect(linkB.classList.contains("is-active")).toBe(true);
    const linkA = document.querySelector('a[href="#section-a"]');
    expect(linkA.classList.contains("is-active")).toBe(false);
  });

  it("applies progress badges from scorecard:update events", () => {
    document.body.innerHTML = `
      <nav class="intro-quick-nav">
        <a href="#section-a">Section A</a>
      </nav>
      <div id="section-a">A</div>
    `;
    initQuickNav();

    document.dispatchEvent(
      new CustomEvent("scorecard:update", {
        detail: { sectionId: "section-a", completed: 2, total: 5 },
      }),
    );

    const badge = document.querySelector(".quick-nav-badge");
    expect(badge).not.toBeNull();
    expect(badge.textContent).toBe("2/5");
    expect(badge.dataset.state).toBe("progress");
  });

  it("shows checkmark when all items complete", () => {
    document.body.innerHTML = `
      <nav class="intro-quick-nav">
        <a href="#section-a">Section A</a>
      </nav>
      <div id="section-a">A</div>
    `;
    initQuickNav();

    document.dispatchEvent(
      new CustomEvent("scorecard:update", {
        detail: { sectionId: "section-a", completed: 5, total: 5 },
      }),
    );

    const badge = document.querySelector(".quick-nav-badge");
    expect(badge.textContent).toBe("✓");
    expect(badge.dataset.state).toBe("complete");
  });

  it("removes badge when total is 0", () => {
    document.body.innerHTML = `
      <nav class="intro-quick-nav">
        <a href="#section-a">Section A</a>
      </nav>
      <div id="section-a">A</div>
    `;
    initQuickNav();

    // First add a badge
    document.dispatchEvent(
      new CustomEvent("scorecard:update", {
        detail: { sectionId: "section-a", completed: 1, total: 3 },
      }),
    );
    expect(document.querySelector(".quick-nav-badge")).not.toBeNull();

    // Then remove it
    document.dispatchEvent(
      new CustomEvent("scorecard:update", {
        detail: { sectionId: "section-a", completed: 0, total: 0 },
      }),
    );
    expect(document.querySelector(".quick-nav-badge")).toBeNull();
  });

  it("applies badges from scorecard:summary events", () => {
    document.body.innerHTML = `
      <nav class="intro-quick-nav">
        <a href="#section-a">Section A</a>
      </nav>
      <div id="section-a">A</div>
    `;
    initQuickNav();

    document.dispatchEvent(
      new CustomEvent("scorecard:summary", {
        detail: { sectionId: "section-a", completed: 3, total: 4 },
      }),
    );

    const badge = document.querySelector(".quick-nav-badge");
    expect(badge.textContent).toBe("3/4");
  });

  it("skips links that do not have hash hrefs", () => {
    document.body.innerHTML = `
      <nav class="intro-quick-nav">
        <a href="/other-page">External</a>
        <a href="#section-a">Section A</a>
      </nav>
      <div id="section-a">A</div>
    `;
    initQuickNav();
    const linkA = document.querySelector('a[href="#section-a"]');
    expect(linkA.classList.contains("is-active")).toBe(true);
  });

  it("sets up IntersectionObserver on sections", () => {
    document.body.innerHTML = `
      <nav class="intro-quick-nav">
        <a href="#section-a">Section A</a>
        <a href="#section-b">Section B</a>
      </nav>
      <div id="section-a">A</div>
      <div id="section-b">B</div>
    `;
    initQuickNav();

    // IntersectionObserver mock should have been called
    expect(IntersectionObserver._instances.length).toBeGreaterThan(0);
  });

  it("updates active link when IntersectionObserver triggers", () => {
    document.body.innerHTML = `
      <nav class="intro-quick-nav">
        <a href="#section-a">Section A</a>
        <a href="#section-b">Section B</a>
      </nav>
      <div id="section-a">A</div>
      <div id="section-b">B</div>
    `;
    initQuickNav();

    const observer = IntersectionObserver._instances[0];
    const sectionB = document.getElementById("section-b");

    // Simulate section-b becoming visible
    observer._trigger([{ target: sectionB, isIntersecting: true }]);

    const linkB = document.querySelector('a[href="#section-b"]');
    expect(linkB.classList.contains("is-active")).toBe(true);
  });
});
