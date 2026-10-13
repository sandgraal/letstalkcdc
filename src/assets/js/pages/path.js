/**
 * /path/ progress (P17-31). Progressive enhancement: the page is complete
 * without this script. It reads the same localStorage record the rest of the
 * site writes (local-progress.js) and labels each step in words, so state is
 * never carried by colour alone. Nothing is sent anywhere.
 */
import { getCompletedModules, getVisitedModules } from "../local-progress.js";

/**
 * Label every step and update each track's summary line.
 * @param {ParentNode} root
 * @param {Set<string>} completed series keys marked complete
 * @param {Record<string, unknown>} visited series keys opened at least once
 */
export function applyPathProgress(root, completed, visited) {
  root.querySelectorAll("[data-path-track]").forEach((track) => {
    const steps = [...track.querySelectorAll("[data-path-step]")];
    let done = 0;
    steps.forEach((step) => {
      const key = step.dataset.seriesKey;
      const status = step.querySelector("[data-path-status]");
      let state = "not-started";
      let label = "";
      if (completed.has(key)) {
        state = "completed";
        label = "(completed)";
        done += 1;
      } else if (visited[key]) {
        state = "visited";
        label = "(opened, not marked complete)";
      }
      step.dataset.state = state;
      if (status) status.textContent = label ? ` ${label}` : "";
    });

    const summary = track.querySelector("[data-path-progress]");
    if (summary && steps.length) {
      const next = steps.find((s) => s.dataset.state !== "completed");
      const tail = next
        ? ` Next: ${next.querySelector("a")?.textContent.trim()}.`
        : " Track complete.";
      summary.textContent = `${done} of ${steps.length} steps complete.${tail}`;
    }
  });
}

function refresh() {
  applyPathProgress(document, getCompletedModules(), getVisitedModules());
}

if (typeof document !== "undefined") {
  const start = () => {
    refresh();
    window.addEventListener("cdc:progress-updated", refresh);
    window.addEventListener("storage", refresh);
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
}
