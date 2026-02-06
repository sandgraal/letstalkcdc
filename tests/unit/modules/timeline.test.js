/**
 * Unit tests for the Timeline module
 *
 * @module tests/unit/modules/timeline.test
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { initTimelines } from "../../../src/assets/js/modules/timeline.js";

/**
 * Build a minimal timeline DOM structure with N events.
 * @param {number} count - Number of events
 * @param {string} id - Timeline id attribute
 * @returns {string} - HTML string
 */
const buildTimeline = (count = 3, id = "test-timeline") => {
  const events = Array.from(
    { length: count },
    (_, i) => `
    <li class="timeline-event" aria-expanded="false">
      <button class="timeline-marker" aria-pressed="false">•</button>
      <div class="timeline-content">
        <h3 class="timeline-title">Event ${i + 1}</h3>
        <p class="timeline-summary">Summary ${i + 1}</p>
        <div class="timeline-detail" hidden>Detail ${i + 1}</div>
      </div>
    </li>
  `,
  ).join("");
  return `<ol class="timeline" id="${id}" role="list">${events}</ol>`;
};

describe("timeline module", () => {
  const mockTracer = {
    trackInteraction: vi.fn(),
  };

  beforeEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("returns early when no .timeline elements exist", () => {
    expect(() => initTimelines(mockTracer)).not.toThrow();
  });

  it("initializes all details as hidden", () => {
    document.body.innerHTML = buildTimeline(3);
    initTimelines(mockTracer);

    const details = document.querySelectorAll(".timeline-detail");
    details.forEach((d) => {
      expect(d.hidden).toBe(true);
    });
  });

  it("initializes all events with aria-expanded false", () => {
    document.body.innerHTML = buildTimeline(3);
    initTimelines(mockTracer);

    const events = document.querySelectorAll(".timeline-event");
    events.forEach((ev) => {
      expect(ev.getAttribute("aria-expanded")).toBe("false");
    });
  });

  describe("click interaction", () => {
    beforeEach(() => {
      document.body.innerHTML = buildTimeline(3);
      initTimelines(mockTracer);
    });

    it("expands an event on marker click", () => {
      const markers = document.querySelectorAll(".timeline-marker");
      markers[1].click();

      const events = document.querySelectorAll(".timeline-event");
      expect(events[1].classList.contains("is-active")).toBe(true);
      expect(events[1].getAttribute("aria-expanded")).toBe("true");
      expect(events[1].querySelector(".timeline-detail").hidden).toBe(false);
    });

    it("collapses other events when a new one is clicked", () => {
      const markers = document.querySelectorAll(".timeline-marker");
      markers[0].click();
      markers[2].click();

      const events = document.querySelectorAll(".timeline-event");
      expect(events[0].classList.contains("is-active")).toBe(false);
      expect(events[2].classList.contains("is-active")).toBe(true);
    });

    it("toggles off when clicking the same event", () => {
      const markers = document.querySelectorAll(".timeline-marker");
      markers[1].click();
      markers[1].click();

      const events = document.querySelectorAll(".timeline-event");
      expect(events[1].classList.contains("is-active")).toBe(false);
      expect(events[1].querySelector(".timeline-detail").hidden).toBe(true);
    });

    it("updates aria-pressed on markers", () => {
      const markers = document.querySelectorAll(".timeline-marker");
      markers[0].click();

      expect(markers[0].getAttribute("aria-pressed")).toBe("true");
      expect(markers[1].getAttribute("aria-pressed")).toBe("false");
    });

    it("tracks interaction via tracer", () => {
      const markers = document.querySelectorAll(".timeline-marker");
      markers[1].click();

      expect(mockTracer.trackInteraction).toHaveBeenCalledWith(
        "timeline-click",
        expect.objectContaining({
          timelineId: "test-timeline",
          eventIndex: 1,
          eventLabel: "Event 2",
        }),
      );
    });
  });

  describe("keyboard navigation", () => {
    beforeEach(() => {
      document.body.innerHTML = buildTimeline(3);
      initTimelines(mockTracer);
    });

    const fireKey = (target, key) => {
      target.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true }),
      );
    };

    it("ArrowDown moves to the next event", () => {
      const timeline = document.querySelector(".timeline");
      // First arrow down when nothing is active should go to index 0
      // (activeIndex starts at -1, -1 + 1 = 0)
      fireKey(timeline, "ArrowDown");

      const events = document.querySelectorAll(".timeline-event");
      expect(events[0].classList.contains("is-active")).toBe(true);
    });

    it("ArrowDown wraps from last to first", () => {
      const timeline = document.querySelector(".timeline");
      const markers = document.querySelectorAll(".timeline-marker");

      // Click last event first
      markers[2].click();
      // Then ArrowDown
      fireKey(timeline, "ArrowDown");

      const events = document.querySelectorAll(".timeline-event");
      expect(events[0].classList.contains("is-active")).toBe(true);
    });

    it("ArrowUp moves to the previous event", () => {
      const timeline = document.querySelector(".timeline");
      const markers = document.querySelectorAll(".timeline-marker");

      markers[2].click();
      fireKey(timeline, "ArrowUp");

      const events = document.querySelectorAll(".timeline-event");
      expect(events[1].classList.contains("is-active")).toBe(true);
    });

    it("ArrowUp wraps from first to last", () => {
      const timeline = document.querySelector(".timeline");
      const markers = document.querySelectorAll(".timeline-marker");

      markers[0].click();
      fireKey(timeline, "ArrowUp");

      const events = document.querySelectorAll(".timeline-event");
      expect(events[2].classList.contains("is-active")).toBe(true);
    });

    it("Escape deactivates all events", () => {
      const timeline = document.querySelector(".timeline");
      const markers = document.querySelectorAll(".timeline-marker");

      markers[1].click();
      fireKey(timeline, "Escape");

      const events = document.querySelectorAll(".timeline-event");
      events.forEach((ev) => {
        expect(ev.classList.contains("is-active")).toBe(false);
      });
    });

    it("ignores non-navigation keys", () => {
      const timeline = document.querySelector(".timeline");
      fireKey(timeline, "Tab");
      fireKey(timeline, "a");

      // Nothing should be active
      const events = document.querySelectorAll(".timeline-event");
      events.forEach((ev) => {
        expect(ev.classList.contains("is-active")).toBe(false);
      });
    });
  });

  describe("multiple timelines", () => {
    it("initializes each timeline independently", () => {
      document.body.innerHTML =
        buildTimeline(2, "tl-1") + buildTimeline(2, "tl-2");
      initTimelines(mockTracer);

      const tl1Markers = document
        .querySelector("#tl-1")
        .querySelectorAll(".timeline-marker");
      const tl2Events = document
        .querySelector("#tl-2")
        .querySelectorAll(".timeline-event");

      tl1Markers[0].click();

      // Only tl-1 event should be active
      expect(
        document
          .querySelector("#tl-1 .timeline-event")
          .classList.contains("is-active"),
      ).toBe(true);
      tl2Events.forEach((ev) => {
        expect(ev.classList.contains("is-active")).toBe(false);
      });
    });
  });

  describe("tracer robustness", () => {
    it("works without a tracer", () => {
      document.body.innerHTML = buildTimeline(2);
      initTimelines();

      const markers = document.querySelectorAll(".timeline-marker");
      expect(() => markers[0].click()).not.toThrow();
    });

    it("works with a tracer missing trackInteraction", () => {
      document.body.innerHTML = buildTimeline(2);
      initTimelines({});

      const markers = document.querySelectorAll(".timeline-marker");
      expect(() => markers[0].click()).not.toThrow();
    });
  });
});
