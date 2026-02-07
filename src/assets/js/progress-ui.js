/**
 * Progress UI Components
 * Handles visual updates for progress tracking
 */

import {
  getCompletedModules,
  getOverallProgress,
  getEarnedBadges,
  isModuleCompleted,
} from "./local-progress.js";

/**
 * Update the global progress bar in the header
 */
function updateGlobalProgressBar() {
  const modules = window.CDC_MODULES || [];
  const progressBar = document.querySelector("[data-global-progress-bar]");
  const progressText = document.querySelector("[data-global-progress-text]");

  if (!progressBar && !progressText) return;

  const percentage = getOverallProgress(modules);

  if (progressBar) {
    progressBar.style.width = `${percentage}%`;
    progressBar.setAttribute("aria-valuenow", percentage);
  }

  if (progressText) {
    progressText.textContent = `${percentage}%`;
  }
}

/**
 * Add completion badges to series cards
 */
function updateSeriesCards() {
  const completed = getCompletedModules();

  document.querySelectorAll(".series-card[data-series-key]").forEach((card) => {
    const moduleKey = card.dataset.seriesKey;
    const isCompleted = completed.has(moduleKey);
    const existingBadge = card.querySelector(".completion-badge");

    // Add/remove completed class
    card.classList.toggle("is-completed", isCompleted);

    // Add completion badge if not already present
    if (isCompleted && !existingBadge) {
      const badge = document.createElement("div");
      badge.className = "completion-badge";
      badge.innerHTML = '<span class="badge badge--success">✓ Completed</span>';
      badge.setAttribute("aria-label", "Module completed");

      const cardMeta = card.querySelector(".card-meta");
      if (cardMeta) {
        cardMeta.appendChild(badge);
      } else {
        card.insertBefore(badge, card.firstChild);
      }
    } else if (!isCompleted && existingBadge) {
      // Remove badge if module is no longer completed
      existingBadge.remove();
    }
  });
}

/**
 * Show earned badges notification
 */
function showBadgesNotification() {
  const modules = window.CDC_MODULES || [];
  const badges = getEarnedBadges(modules);
  const existingNotif = document.querySelector(".badges-notification");

  // Only show if we have badges and haven't shown notification yet
  if (badges.length === 0 || existingNotif) return;

  // Check if we've shown this badge before
  const lastShownBadge = sessionStorage.getItem("cdc-last-badge");
  const currentBadge = badges[badges.length - 1].category;

  // Don't show if it's the same badge we already showed
  if (lastShownBadge === currentBadge) return;

  // Mark this badge as shown
  sessionStorage.setItem("cdc-last-badge", currentBadge);

  const notification = document.createElement("div");
  notification.className = "badges-notification";
  notification.setAttribute("role", "alert");
  notification.innerHTML = `
    <div class="badges-notification__content">
      <h3>🎉 Badge Earned!</h3>
      <p>${badges[badges.length - 1].title}</p>
      <p class="text-muted">${badges[badges.length - 1].description}</p>
      <button type="button" class="button ghost" data-dismiss-badges>Got it!</button>
    </div>
  `;

  document.body.appendChild(notification);

  // Auto-dismiss after 5 seconds
  setTimeout(() => {
    notification.classList.add("fade-out");
    setTimeout(() => notification.remove(), 300);
  }, 5000);

  // Manual dismiss
  notification
    .querySelector("[data-dismiss-badges]")
    ?.addEventListener("click", () => {
      notification.classList.add("fade-out");
      setTimeout(() => notification.remove(), 300);
    });
}

/**
 * Add "Mark as Complete" button to module pages
 */
function addCompletionButton() {
  const journeySlug = document.body.dataset.journeySlug;
  if (!journeySlug) return;

  // Don't add if already completed
  if (isModuleCompleted(journeySlug)) return;

  // Find the series navigation
  const seriesNav = document.querySelector(".series-nav");
  if (!seriesNav) return;

  // Check if button already exists
  if (document.querySelector("[data-mark-complete]")) return;

  // Create completion button
  const buttonContainer = document.createElement("div");
  buttonContainer.className = "completion-actions";
  buttonContainer.innerHTML = `
    <button type="button" class="button secondary" data-mark-complete>
      Mark as Complete
    </button>
  `;

  // Insert before the progress toolbar
  const toolbar = seriesNav.parentElement?.querySelector(
    "[data-progress-toolbar]",
  );
  if (toolbar && toolbar.parentElement) {
    toolbar.parentElement.insertBefore(buttonContainer, toolbar);
  } else {
    // Fallback: insert after series nav if toolbar not found
    seriesNav.parentElement?.insertBefore(
      buttonContainer,
      seriesNav.nextSibling,
    );
  }

  // Handle click
  buttonContainer
    .querySelector("[data-mark-complete]")
    ?.addEventListener("click", () => {
      window.dispatchEvent(
        new CustomEvent("cdc:mark-complete", {
          detail: { moduleKey: journeySlug },
        }),
      );

      // Update button
      const btn = buttonContainer.querySelector("[data-mark-complete]");
      if (btn) {
        btn.textContent = "✓ Completed";
        btn.disabled = true;
        btn.classList.add("success");
      }

      // Update the UI
      updateAllProgressIndicators();
      showBadgesNotification();
    });
}

/**
 * Update all progress indicators on the page
 */
function updateAllProgressIndicators() {
  updateGlobalProgressBar();
  updateSeriesCards();
  addCompletionButton();
}

/**
 * Initialize progress UI
 */
export function initializeProgressUI() {
  // Update on page load
  updateAllProgressIndicators();

  // Update when progress changes
  window.addEventListener("cdc:progress-updated", () => {
    updateAllProgressIndicators();
  });

  // Update when modules data is loaded
  if (window.CDC_MODULES) {
    updateAllProgressIndicators();
  }
}

// Auto-initialize
if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeProgressUI);
  } else {
    initializeProgressUI();
  }
}
