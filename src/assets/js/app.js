/**
 * Let's Talk CDC — Application Entry Point
 *
 * Orchestrates all UI modules: theme, navigation, search, code blocks,
 * depth toggle, scorecards, and toast notifications.
 *
 * Previously a monolithic 1821-line file, now modularized into
 * focused, independently testable modules under ./modules/.
 *
 * @module app
 */

import { initTheme } from "./modules/theme.js";
import { initNavigation } from "./modules/navigation.js";
import { initSearch } from "./modules/search.js";
import { initCodeBlocks } from "./modules/code-blocks.js";
import { initDepthToggle } from "./modules/depth-toggle.js";
import { initScorecards } from "./modules/scorecard.js";
import { showToast } from "./modules/toast.js";
import { initInteractiveDiagrams } from "./modules/interactive-diagrams.js";
import { initTimelines } from "./modules/timeline.js";

// Modules accept a `tracer` parameter shaped like the old EducationTracer.
// The full tracer was removed (it POSTed to localhost:4318 in every visitor's
// browser and was always swallowed). Passing this no-op keeps the per-module
// call sites stable for tests that pass their own mock tracers.
const educationTracer = {
  trackModuleView: () => {},
  trackProgress: () => {},
  trackInteraction: () => {},
  trackSearch: () => {},
  trackWebVital: () => {},
};

// --- Export toast globally for backward compatibility ---

if (typeof window !== "undefined") {
  window.showToast = showToast;
}

// --- Theme (runs immediately, before DOMContentLoaded) ---

initTheme();

// --- DOMContentLoaded initialization ---

const onReady = (callback) => {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", callback, { once: true });
  } else {
    callback();
  }
};

onReady(() => {
  // Track module view on page load
  try {
    const journeySlug =
      window.CDC_JOURNEY_SLUG || document.body?.dataset?.journeySlug || "";
    if (journeySlug) {
      const pageTitle = document.title;
      educationTracer.trackModuleView(journeySlug, pageTitle);
    }
  } catch (error) {
    console.debug("Module view tracking failed:", error);
  }

  // Initialize all modules
  initNavigation();
  initDepthToggle();
  initCodeBlocks(educationTracer);
  initSearch(educationTracer);
  initScorecards(educationTracer);
  initTimelines(educationTracer);
  initInteractiveDiagrams(educationTracer);
});
