/**
 * Timeline Module
 *
 * Handles interactive timeline behavior:
 * - Click/tap events to expand detail panels
 * - Keyboard navigation between events
 * - Animated scroll-into-view for active events
 * - OpenTelemetry interaction tracking
 *
 * @module timeline
 * @exports {function} initTimelines
 */

const doc = document;

/**
 * Initialize all timeline components on the page.
 * Adds click handlers, keyboard navigation, and ARIA management.
 *
 * @param {object} [tracer] - Optional OpenTelemetry tracer
 */
const initTimelines = (tracer) => {
  const timelines = doc.querySelectorAll(".timeline");
  if (timelines.length === 0) return;

  timelines.forEach((timeline) => {
    const events = timeline.querySelectorAll(".timeline-event");
    if (events.length === 0) return;

    let activeIndex = -1;

    /**
     * Set a timeline event as active (expanded).
     * @param {number} index - Event index to activate (-1 to deactivate all)
     */
    const setActive = (index) => {
      events.forEach((ev, i) => {
        const detail = ev.querySelector(".timeline-detail");
        const marker = ev.querySelector(".timeline-marker");
        const isActive = i === index;

        ev.classList.toggle("is-active", isActive);
        ev.setAttribute("aria-expanded", String(isActive));

        if (detail) {
          detail.hidden = !isActive;
        }
        if (marker) {
          marker.setAttribute("aria-pressed", String(isActive));
        }
      });
      activeIndex = index;
    };

    // Click/tap handler for each event
    events.forEach((ev, i) => {
      const marker = ev.querySelector(".timeline-marker");
      const clickTarget = marker || ev;

      clickTarget.addEventListener("click", () => {
        const newIndex = activeIndex === i ? -1 : i;
        setActive(newIndex);

        // Scroll into view
        if (newIndex >= 0 && typeof ev.scrollIntoView === "function") {
          ev.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }

        // Track interaction
        if (tracer && typeof tracer.trackInteraction === "function") {
          try {
            tracer.trackInteraction("timeline-click", {
              timelineId: timeline.id || "unknown",
              eventIndex: i,
              eventLabel:
                ev.querySelector(".timeline-title")?.textContent || "",
            });
          } catch {
            /* silent */
          }
        }
      });
    });

    // Keyboard navigation
    timeline.addEventListener("keydown", (e) => {
      if (!["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(e.key)) return;

      e.preventDefault();

      if (e.key === "ArrowDown") {
        const next = activeIndex < events.length - 1 ? activeIndex + 1 : 0;
        setActive(next);
        events[next].querySelector(".timeline-marker")?.focus();
      } else if (e.key === "ArrowUp") {
        const prev = activeIndex > 0 ? activeIndex - 1 : events.length - 1;
        setActive(prev);
        events[prev].querySelector(".timeline-marker")?.focus();
      } else if (e.key === "Enter") {
        if (activeIndex >= 0) {
          // Toggle current
          setActive(activeIndex === activeIndex ? -1 : activeIndex);
        }
      } else if (e.key === "Escape") {
        setActive(-1);
      }
    });

    // Initialize all details as hidden
    setActive(-1);
  });
};

export { initTimelines };
