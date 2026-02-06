/**
 * Unit tests for the Scorecard module
 * Tests the exported initScorecards function and the internal helpers
 * (toOrder, toCount, createStorage, parseProgressState) via their effects.
 *
 * @module tests/unit/modules/scorecard.test
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { initScorecards } from "../../../src/assets/js/modules/scorecard.js";

describe("scorecard module", () => {
  const mockTracer = {
    trackInteraction: vi.fn(),
    trackProgress: vi.fn(),
  };

  beforeEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
    vi.clearAllMocks();
    window.CDCProgress = undefined;
    window.CDC_JOURNEY_SLUG = undefined;
    document.body.removeAttribute("data-journey-slug");
  });

  it("returns early when no [data-scorecard] elements exist", () => {
    expect(() => initScorecards(mockTracer)).not.toThrow();
  });

  describe("single scorecard", () => {
    beforeEach(() => {
      document.body.innerHTML = `
        <section id="basics">
          <div data-scorecard="basics-checklist"
               data-scorecard-group="default"
               data-scorecard-section-id="basics"
               data-scorecard-summary-label="Basics Checklist">
            <caption>Basics Checklist</caption>
            <table>
              <tr data-scorecard-item="item-1">
                <td><input type="checkbox" data-scorecard-control data-scorecard-item="item-1" /></td>
                <td>Understand CDC</td>
              </tr>
              <tr data-scorecard-item="item-2">
                <td><input type="checkbox" data-scorecard-control data-scorecard-item="item-2" /></td>
                <td>Install Debezium</td>
              </tr>
              <tr data-scorecard-item="item-3">
                <td><input type="checkbox" data-scorecard-control data-scorecard-item="item-3" /></td>
                <td>Configure connector</td>
              </tr>
            </table>
            <div data-scorecard-progress></div>
          </div>
        </section>
      `;
    });

    it("initializes without errors", () => {
      expect(() => initScorecards(mockTracer)).not.toThrow();
    });

    it("renders initial count as 0 of N", () => {
      initScorecards(mockTracer);
      const progress = document.querySelector("[data-scorecard-progress]");
      expect(progress.textContent).toContain("0");
      expect(progress.textContent).toContain("3");
    });

    it("updates count when checkbox is checked", () => {
      initScorecards(mockTracer);
      const checkbox = document.querySelector(
        'input[data-scorecard-item="item-1"]',
      );
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event("change", { bubbles: true }));

      const progress = document.querySelector("[data-scorecard-progress]");
      expect(progress.textContent).toContain("1");
    });

    it("dispatches scorecard:update event on change", () => {
      initScorecards(mockTracer);
      const listener = vi.fn();
      document.addEventListener("scorecard:update", listener);

      const checkbox = document.querySelector(
        'input[data-scorecard-item="item-1"]',
      );
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event("change", { bubbles: true }));

      expect(listener).toHaveBeenCalled();
      const detail = listener.mock.calls[0][0].detail;
      expect(detail).toHaveProperty("sectionId");
      expect(detail).toHaveProperty("completed");
      expect(detail).toHaveProperty("total");

      document.removeEventListener("scorecard:update", listener);
    });

    it("persists checked state to localStorage", () => {
      initScorecards(mockTracer);
      const checkbox = document.querySelector(
        'input[data-scorecard-item="item-1"]',
      );
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event("change", { bubbles: true }));

      // Storage key is scorecard:<data-scorecard value>
      const stored = localStorage.getItem("scorecard:basics-checklist");
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored);
      expect(parsed).toContain("item-1");
    });

    it("restores checked state from localStorage on init", () => {
      // Pre-populate localStorage with checked item
      localStorage.setItem(
        "scorecard:basics-checklist",
        JSON.stringify(["item-1"]),
      );

      initScorecards(mockTracer);

      const checkbox = document.querySelector(
        'input[data-scorecard-item="item-1"]',
      );
      expect(checkbox.checked).toBe(true);
    });
  });

  describe("scorecard summary", () => {
    beforeEach(() => {
      document.body.innerHTML = `
        <section id="overview">
          <div data-scorecard-summary="readiness">
            <div data-scorecard-summary-progress></div>
            <div data-scorecard-summary-meter aria-valuenow="0" aria-valuemax="100">
              <div data-scorecard-summary-meter-fill style="width: 0%"></div>
            </div>
            <ul data-scorecard-summary-list></ul>
            <div data-scorecard-summary-empty>No checklists yet</div>
          </div>
        </section>

        <section id="section-a">
          <h2>Section A</h2>
          <div data-scorecard="section-a-checklist"
               data-scorecard-group="readiness"
               data-scorecard-summary-label="Section A Check"
               data-scorecard-order="1">
            <table>
              <tr data-scorecard-item="a1">
                <td><input type="checkbox" data-scorecard-control data-scorecard-item="a1" /></td>
                <td>Check A1</td>
              </tr>
              <tr data-scorecard-item="a2">
                <td><input type="checkbox" data-scorecard-control data-scorecard-item="a2" /></td>
                <td>Check A2</td>
              </tr>
            </table>
            <div data-scorecard-progress></div>
          </div>
        </section>
      `;
    });

    it("renders summary with 0 of N initially", () => {
      initScorecards(mockTracer);
      const progress = document.querySelector(
        "[data-scorecard-summary-progress]",
      );
      if (progress) {
        expect(progress.textContent).toContain("0");
        expect(progress.textContent).toContain("2");
      }
    });

    it("updates summary when items are checked", () => {
      initScorecards(mockTracer);

      const checkbox = document.querySelector(
        'input[data-scorecard-item="a1"]',
      );
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event("change", { bubbles: true }));

      const progress = document.querySelector(
        "[data-scorecard-summary-progress]",
      );
      if (progress) {
        expect(progress.textContent).toContain("1");
      }
    });

    it("updates meter fill width on progress", () => {
      initScorecards(mockTracer);

      // Check both items
      document
        .querySelectorAll("input[data-scorecard-control]")
        .forEach((cb) => {
          cb.checked = true;
          cb.dispatchEvent(new Event("change", { bubbles: true }));
        });

      const meterFill = document.querySelector(
        "[data-scorecard-summary-meter-fill]",
      );
      if (meterFill) {
        expect(meterFill.style.width).toBe("100%");
      }
    });

    it("renders summary list items", () => {
      initScorecards(mockTracer);

      const list = document.querySelector("[data-scorecard-summary-list]");
      const items = list.querySelectorAll(".scorecard-summary-item");
      expect(items.length).toBeGreaterThan(0);
    });

    it("dispatches scorecard:summary event", () => {
      const listener = vi.fn();
      document.addEventListener("scorecard:summary", listener);

      initScorecards(mockTracer);
      expect(listener).toHaveBeenCalled();

      document.removeEventListener("scorecard:summary", listener);
    });
  });

  describe("reset functionality", () => {
    beforeEach(() => {
      document.body.innerHTML = `
        <section id="reset-section">
          <div data-scorecard="reset-card" data-scorecard-group="default">
            <table>
              <tr data-scorecard-item="r1">
                <td><input type="checkbox" data-scorecard-control data-scorecard-item="r1" /></td>
                <td>Item 1</td>
              </tr>
              <tr data-scorecard-item="r2">
                <td><input type="checkbox" data-scorecard-control data-scorecard-item="r2" /></td>
                <td>Item 2</td>
              </tr>
            </table>
            <div data-scorecard-progress></div>
            <button data-scorecard-reset>Reset</button>
          </div>
        </section>
      `;
    });

    it("clears all checked items on reset button click", () => {
      initScorecards(mockTracer);

      // Check both items
      document
        .querySelectorAll("input[data-scorecard-control]")
        .forEach((cb) => {
          cb.checked = true;
          cb.dispatchEvent(new Event("change", { bubbles: true }));
        });

      const progress = document.querySelector("[data-scorecard-progress]");
      expect(progress.textContent).toContain("2");

      // Click reset
      document.querySelector("[data-scorecard-reset]").click();

      expect(progress.textContent).toContain("0 of 2");
      const checkboxes = document.querySelectorAll(
        "input[data-scorecard-control]",
      );
      checkboxes.forEach((cb) => expect(cb.checked).toBe(false));
    });

    it("removes localStorage on reset", () => {
      initScorecards(mockTracer);

      const cb = document.querySelector('input[data-scorecard-item="r1"]');
      cb.checked = true;
      cb.dispatchEvent(new Event("change", { bubbles: true }));
      expect(localStorage.getItem("scorecard:reset-card")).not.toBeNull();

      document.querySelector("[data-scorecard-reset]").click();
      expect(localStorage.getItem("scorecard:reset-card")).toBeNull();
    });

    it("responds to scorecard:reset custom event", () => {
      initScorecards(mockTracer);

      const cb = document.querySelector('input[data-scorecard-item="r1"]');
      cb.checked = true;
      cb.dispatchEvent(new Event("change", { bubbles: true }));

      const card = document.querySelector("[data-scorecard]");
      card.dispatchEvent(
        new CustomEvent("scorecard:reset", { detail: { focus: false } }),
      );

      const progress = document.querySelector("[data-scorecard-progress]");
      expect(progress.textContent).toContain("0 of 2");
    });

    it("does nothing when reset called with no progress", () => {
      initScorecards(mockTracer);
      const progress = document.querySelector("[data-scorecard-progress]");
      const textBefore = progress.textContent;

      document.querySelector("[data-scorecard-reset]").click();
      expect(progress.textContent).toBe(textBefore);
    });
  });

  describe("filter functionality", () => {
    beforeEach(() => {
      document.body.innerHTML = `
        <section id="filter-section">
          <div data-scorecard="filter-card" data-scorecard-group="default">
            <table>
              <tr data-scorecard-item="f1">
                <td><input type="checkbox" data-scorecard-control data-scorecard-item="f1" /></td>
                <td>Item 1</td>
              </tr>
              <tr data-scorecard-item="f2">
                <td><input type="checkbox" data-scorecard-control data-scorecard-item="f2" /></td>
                <td>Item 2</td>
              </tr>
            </table>
            <div data-scorecard-progress></div>
            <button data-scorecard-filter data-label-incomplete="Show incomplete" data-label-all="Show all">Show incomplete</button>
            <div data-scorecard-empty hidden>All done!</div>
          </div>
        </section>
      `;
    });

    it("toggles filter mode on button click", () => {
      initScorecards(mockTracer);
      const filter = document.querySelector("button[data-scorecard-filter]");
      const card = document.querySelector("[data-scorecard]");

      expect(card.dataset.scorecardFilter).toBe("all");

      filter.click();
      expect(card.dataset.scorecardFilter).toBe("incomplete");
      expect(filter.getAttribute("aria-pressed")).toBe("true");
      expect(filter.textContent).toBe("Show all");

      filter.click();
      expect(card.dataset.scorecardFilter).toBe("all");
      expect(filter.getAttribute("aria-pressed")).toBe("false");
    });

    it("hides completed rows when filter is incomplete", () => {
      initScorecards(mockTracer);

      const cb = document.querySelector('input[data-scorecard-item="f1"]');
      cb.checked = true;
      cb.dispatchEvent(new Event("change", { bubbles: true }));

      const filter = document.querySelector("button[data-scorecard-filter]");
      filter.click(); // Switch to incomplete

      const row1 = document.querySelector('tr[data-scorecard-item="f1"]');
      const row2 = document.querySelector('tr[data-scorecard-item="f2"]');
      expect(row1.hidden).toBe(true);
      expect(row2.hidden).toBe(false);
    });

    it("shows empty message when all items complete and filter is incomplete", () => {
      initScorecards(mockTracer);

      // Complete all items
      document
        .querySelectorAll("input[data-scorecard-control]")
        .forEach((cb) => {
          cb.checked = true;
          cb.dispatchEvent(new Event("change", { bubbles: true }));
        });

      const filter = document.querySelector("button[data-scorecard-filter]");
      filter.click();

      const emptyEl = document.querySelector("[data-scorecard-empty]");
      expect(emptyEl.hidden).toBe(false);
    });
  });

  describe("copy functionality", () => {
    beforeEach(() => {
      document.body.innerHTML = `
        <section id="copy-section">
          <div data-scorecard="copy-card" data-scorecard-group="default">
            <caption>My Checklist</caption>
            <table>
              <tr data-scorecard-item="c1">
                <td><div class="scorecard-label"><span>Item One</span></div></td>
                <td>Ready text</td>
                <td>Action text</td>
                <td><input type="checkbox" data-scorecard-control data-scorecard-item="c1" /></td>
              </tr>
              <tr data-scorecard-item="c2">
                <td><div class="scorecard-label"><span>Item Two</span></div></td>
                <td>Ready text 2</td>
                <td>Action text 2</td>
                <td><input type="checkbox" data-scorecard-control data-scorecard-item="c2" /></td>
              </tr>
            </table>
            <div data-scorecard-progress></div>
            <button data-scorecard-copy data-label-default="Copy" data-label-success="Copied!" data-label-error="Failed">Copy</button>
          </div>
        </section>
      `;
    });

    it("copies report to clipboard on click", async () => {
      vi.useFakeTimers();
      initScorecards(mockTracer);

      const copy = document.querySelector("[data-scorecard-copy]");
      copy.click();

      await vi.advanceTimersByTimeAsync(10);

      expect(navigator.clipboard.writeText).toHaveBeenCalled();
      expect(copy.textContent).toBe("Copied!");
      expect(copy.disabled).toBe(true);

      vi.advanceTimersByTime(1600);
      expect(copy.disabled).toBe(false);
      expect(copy.textContent).toBe("Copy");

      vi.useRealTimers();
    });

    it("shows error state when clipboard fails", async () => {
      vi.useFakeTimers();
      navigator.clipboard.writeText = vi
        .fn()
        .mockRejectedValue(new Error("denied"));

      initScorecards(mockTracer);

      const copy = document.querySelector("[data-scorecard-copy]");
      copy.click();

      await vi.advanceTimersByTimeAsync(10);

      expect(copy.textContent).toBe("Failed");

      vi.advanceTimersByTime(1600);
      expect(copy.textContent).toBe("Copy");

      vi.useRealTimers();
    });
  });

  describe("summary reset button", () => {
    it("resets all group cards when summary reset is clicked", () => {
      document.body.innerHTML = `
        <div data-scorecard-summary="grp">
          <div data-scorecard-summary-progress></div>
          <ul data-scorecard-summary-list></ul>
          <button data-scorecard-summary-reset>Reset All</button>
        </div>
        <section id="s1">
          <h2>S1</h2>
          <div data-scorecard="grp-card" data-scorecard-group="grp">
            <table>
              <tr data-scorecard-item="g1">
                <td><input type="checkbox" data-scorecard-control data-scorecard-item="g1" /></td>
                <td>G1</td>
              </tr>
            </table>
            <div data-scorecard-progress></div>
          </div>
        </section>
      `;

      initScorecards(mockTracer);

      const cb = document.querySelector('input[data-scorecard-item="g1"]');
      cb.checked = true;
      cb.dispatchEvent(new Event("change", { bubbles: true }));

      document.querySelector("[data-scorecard-summary-reset]").click();

      expect(cb.checked).toBe(false);
    });
  });

  describe("journey progress", () => {
    it("dispatches journey progress when slug is set", async () => {
      window.CDC_JOURNEY_SLUG = "intro";
      document.body.innerHTML = `
        <section id="basics">
          <div data-scorecard="journey-checklist"
               data-scorecard-group="default">
            <table>
              <tr data-scorecard-item="x1">
                <td><input type="checkbox" data-scorecard-control data-scorecard-item="x1" /></td>
                <td>Item</td>
              </tr>
            </table>
            <div data-scorecard-progress></div>
          </div>
        </section>
      `;

      const onStepChange = vi.fn();
      window.CDCProgress = {
        onStepChange,
        ready: Promise.resolve(),
      };

      initScorecards(mockTracer);

      const checkbox = document.querySelector(
        'input[data-scorecard-item="x1"]',
      );
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event("change", { bubbles: true }));

      // Allow promise to resolve
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(onStepChange).toHaveBeenCalled();
    });

    it("queues progress updates when CDCProgress is not ready", async () => {
      window.CDC_JOURNEY_SLUG = "intro";
      document.body.innerHTML = `
        <section id="basics">
          <div data-scorecard="queue-checklist" data-scorecard-group="default">
            <table>
              <tr data-scorecard-item="q1">
                <td><input type="checkbox" data-scorecard-control data-scorecard-item="q1" /></td>
                <td>Item</td>
              </tr>
            </table>
            <div data-scorecard-progress></div>
          </div>
        </section>
      `;

      // No CDCProgress initially
      initScorecards(mockTracer);

      const cb = document.querySelector('input[data-scorecard-item="q1"]');
      cb.checked = true;
      cb.dispatchEvent(new Event("change", { bubbles: true }));

      // Now set up CDCProgress and fire event
      const onStepChange = vi.fn();
      window.CDCProgress = { onStepChange, ready: Promise.resolve() };
      window.dispatchEvent(new Event("cdc-progress-ready"));

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(onStepChange).toHaveBeenCalled();
    });

    it("does not dispatch journey progress without a slug", () => {
      document.body.innerHTML = `
        <section id="basics">
          <div data-scorecard="no-slug" data-scorecard-group="default">
            <table>
              <tr data-scorecard-item="n1">
                <td><input type="checkbox" data-scorecard-control data-scorecard-item="n1" /></td>
                <td>Item</td>
              </tr>
            </table>
            <div data-scorecard-progress></div>
          </div>
        </section>
      `;

      const onStepChange = vi.fn();
      window.CDCProgress = { onStepChange };

      initScorecards(mockTracer);

      const cb = document.querySelector('input[data-scorecard-item="n1"]');
      cb.checked = true;
      cb.dispatchEvent(new Event("change", { bubbles: true }));

      expect(onStepChange).not.toHaveBeenCalled();
    });
  });

  describe("remote progress sync", () => {
    it("applies remote progress on cdc-progress-ready event", async () => {
      window.CDC_JOURNEY_SLUG = "intro";
      document.body.innerHTML = `
        <section id="remote-section">
          <div data-scorecard="remote-card" data-scorecard-group="default">
            <table>
              <tr data-scorecard-item="rm1">
                <td><input type="checkbox" data-scorecard-control data-scorecard-item="rm1" /></td>
                <td>Item 1</td>
              </tr>
              <tr data-scorecard-item="rm2">
                <td><input type="checkbox" data-scorecard-control data-scorecard-item="rm2" /></td>
                <td>Item 2</td>
              </tr>
            </table>
            <div data-scorecard-progress></div>
          </div>
        </section>
      `;

      const getProgress = vi.fn().mockReturnValue({
        state: JSON.stringify({
          checklists: {
            "remote-card": { completed: ["rm1"], total: 2 },
          },
        }),
      });

      window.CDCProgress = {
        getProgress,
        ready: Promise.resolve(),
        onStepChange: vi.fn(),
      };

      initScorecards(mockTracer);

      await new Promise((resolve) => setTimeout(resolve, 50));

      const cb = document.querySelector('input[data-scorecard-item="rm1"]');
      expect(cb.checked).toBe(true);
    });

    it("applies remote progress on cdc-progress-change event", async () => {
      window.CDC_JOURNEY_SLUG = "intro";
      document.body.innerHTML = `
        <section id="change-section">
          <div data-scorecard="change-card" data-scorecard-group="default">
            <table>
              <tr data-scorecard-item="ch1">
                <td><input type="checkbox" data-scorecard-control data-scorecard-item="ch1" /></td>
                <td>Item 1</td>
              </tr>
            </table>
            <div data-scorecard-progress></div>
          </div>
        </section>
      `;

      window.CDCProgress = {
        onStepChange: vi.fn(),
        ready: Promise.resolve(),
      };

      initScorecards(mockTracer);

      window.dispatchEvent(
        new CustomEvent("cdc-progress-change", {
          detail: {
            journeySlug: "intro",
            entry: {
              state: {
                checklists: {
                  "change-card": { completed: ["ch1"] },
                },
              },
            },
          },
        }),
      );

      const cb = document.querySelector('input[data-scorecard-item="ch1"]');
      expect(cb.checked).toBe(true);
    });

    it("ignores cdc-progress-change for different journey slug", () => {
      window.CDC_JOURNEY_SLUG = "intro";
      document.body.innerHTML = `
        <section id="ignore-section">
          <div data-scorecard="ignore-card" data-scorecard-group="default">
            <table>
              <tr data-scorecard-item="ig1">
                <td><input type="checkbox" data-scorecard-control data-scorecard-item="ig1" /></td>
                <td>Item</td>
              </tr>
            </table>
            <div data-scorecard-progress></div>
          </div>
        </section>
      `;

      window.CDCProgress = {
        onStepChange: vi.fn(),
      };

      initScorecards(mockTracer);

      window.dispatchEvent(
        new CustomEvent("cdc-progress-change", {
          detail: {
            journeySlug: "other-journey",
            entry: {
              state: {
                checklists: {
                  "ignore-card": { completed: ["ig1"] },
                },
              },
            },
          },
        }),
      );

      const cb = document.querySelector('input[data-scorecard-item="ig1"]');
      expect(cb.checked).toBe(false);
    });
  });

  describe("internal helper behaviors (via side effects)", () => {
    it("handles non-numeric order values gracefully", () => {
      document.body.innerHTML = `
        <div data-scorecard-summary="test">
          <ul data-scorecard-summary-list></ul>
        </div>
        <div data-scorecard="test-card" data-scorecard-group="test" data-scorecard-order="not-a-number">
          <table>
            <tr data-scorecard-item="i1">
              <td><input type="checkbox" data-scorecard-control data-scorecard-item="i1" /></td>
              <td>I</td>
            </tr>
          </table>
          <div data-scorecard-progress></div>
        </div>
      `;
      expect(() => initScorecards(mockTracer)).not.toThrow();
    });

    it("works when localStorage is unavailable", () => {
      const originalSetItem = localStorage.setItem;
      localStorage.setItem = () => {
        throw new Error("No storage");
      };

      document.body.innerHTML = `
        <div data-scorecard="broken-storage" data-scorecard-group="default">
          <table>
            <tr data-scorecard-item="z1">
              <td><input type="checkbox" data-scorecard-control data-scorecard-item="z1" /></td>
              <td>Z</td>
            </tr>
          </table>
          <div data-scorecard-progress></div>
        </div>
      `;

      expect(() => initScorecards(mockTracer)).not.toThrow();

      localStorage.setItem = originalSetItem;
    });
  });
});
