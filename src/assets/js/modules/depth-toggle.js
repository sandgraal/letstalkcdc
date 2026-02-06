/**
 * Depth Toggle Module
 * Manages beginner/practitioner content depth switching with localStorage persistence.
 *
 * @module depth-toggle
 * @exports {function} initDepthToggle - Initialize the depth toggle
 */

const doc = document;

/**
 * Initialize the content depth toggle (Beginner / Practitioner levels).
 * Reads stored preference from localStorage and toggles visibility of
 * content sections based on their data-level attribute.
 */
const initDepthToggle = () => {
  const toggle = doc.querySelector(".depth-toggle");
  if (!toggle) return;

  const setDepth = (level) => {
    toggle.querySelectorAll(".depth-btn").forEach((button) => {
      const isActive = button.dataset.depth === level;
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
    doc.querySelectorAll("[data-level]").forEach((el) => {
      el.classList.toggle("is-active", el.dataset.level === level);
    });
    doc.documentElement.dataset.depth = level;
  };

  const initialDepth = (() => {
    try {
      return localStorage.getItem("cdcDepth") || "beginner";
    } catch (_) {
      return "beginner";
    }
  })();

  setDepth(initialDepth);

  toggle.addEventListener("click", (event) => {
    const button = event.target.closest(".depth-btn");
    if (!button) return;
    const level = button.dataset.depth;
    setDepth(level);
    try {
      localStorage.setItem("cdcDepth", level);
    } catch (_) {
      /* ignore */
    }
  });
};

export { initDepthToggle };
