/**
 * Toast Notification Module
 * Provides a configurable toast notification system with auto-dismiss,
 * action buttons, and progress indicators.
 *
 * @module toast
 * @exports {function} showToast - Display a toast notification
 * @exports {function} removeToast - Programmatically remove a toast
 */

const doc = document;

/**
 * Get or create the toast container element.
 * @returns {HTMLElement} The toast container
 */
const createToastContainer = () => {
  let container = doc.querySelector(".toast-container");
  if (!container) {
    container = doc.createElement("div");
    container.className = "toast-container";
    doc.body.appendChild(container);
  }
  return container;
};

/**
 * Get or create the visually hidden polite live region that announces toasts.
 * It must exist before its text changes, so it is created once and reused;
 * the visible toast itself is not a live region (it holds buttons).
 * @returns {HTMLElement} The live region
 */
const getLiveRegion = () => {
  let region = doc.querySelector(".toast-live-region");
  if (!region) {
    region = doc.createElement("div");
    region.className = "toast-live-region sr-only";
    region.setAttribute("role", "status");
    region.setAttribute("aria-live", "polite");
    region.setAttribute("aria-atomic", "true");
    doc.body.appendChild(region);
  }
  return region;
};

/** Delay between a region existing and its text changing, so a screen reader
 * that has just registered the region still announces the first message. */
const ANNOUNCE_DELAY_MS = 50;

/**
 * Join a title and message into one sentence-like announcement. A space
 * follows a title that already ends in punctuation ("Code copied!");
 * otherwise a full stop is added.
 * @param {string} title
 * @param {string} message
 * @returns {string}
 */
const announcementText = (title, message) => {
  if (!title || !message) return title || message || "";
  return /[.!?\u2026:;]$/.test(title.trim())
    ? `${title.trim()} ${message}`
    : `${title.trim()}. ${message}`;
};

/**
 * Announce a message to assistive technology. The text is set on a later
 * tick, and as a fresh child node, so the first message is not dropped and an
 * identical message (a second "Copied!") is read again.
 * @param {string} text - The message to announce
 */
const announce = (text) => {
  if (!text) return;
  const region = getLiveRegion();
  setTimeout(() => {
    const line = doc.createElement("p");
    line.textContent = text;
    region.replaceChildren(line);
  }, ANNOUNCE_DELAY_MS);
};

// Create the region as soon as the module loads (and the body exists), well
// before the first toast, so assistive technology already knows about it.
if (doc.body) {
  getLiveRegion();
} else {
  doc.addEventListener("DOMContentLoaded", getLiveRegion, { once: true });
}

/**
 * Display a toast notification.
 * @param {object} options - Toast configuration
 * @param {string} [options.title=""] - Toast title text
 * @param {string} [options.message=""] - Toast message body
 * @param {string} [options.type="info"] - Type: "info", "success", "warning", "error", "loading"
 * @param {number} [options.duration=5000] - Auto-dismiss time in ms (0 to disable)
 * @param {Array<{label: string, variant?: string, onClick?: function}>} [options.actions=[]] - Action buttons
 * @param {function|null} [options.onClose=null] - Callback on close
 * @returns {HTMLElement} The toast element
 */
const showToast = (options = {}) => {
  const {
    title = "",
    message = "",
    type = "info",
    duration = 5000,
    actions = [],
  } = options;

  const container = createToastContainer();
  getLiveRegion();

  const toast = doc.createElement("div");
  toast.className = `toast toast-${type}`;

  const icon = doc.createElement("div");
  icon.className = "toast-icon";

  const content = doc.createElement("div");
  content.className = "toast-content";

  if (title) {
    const titleEl = doc.createElement("div");
    titleEl.className = "toast-title";
    titleEl.textContent = title;
    content.appendChild(titleEl);
  }

  if (message) {
    const messageEl = doc.createElement("p");
    messageEl.className = "toast-message";
    messageEl.textContent = message;
    content.appendChild(messageEl);
  }

  if (actions.length > 0) {
    const actionsEl = doc.createElement("div");
    actionsEl.className = "toast-actions";
    actions.forEach((action) => {
      const btn = doc.createElement("button");
      btn.className = `toast-action toast-action-${
        action.variant || "primary"
      }`;
      btn.textContent = action.label;
      btn.onclick = () => {
        if (action.onClick) action.onClick();
        removeToast(toast);
      };
      actionsEl.appendChild(btn);
    });
    content.appendChild(actionsEl);
  }

  const closeBtn = doc.createElement("button");
  closeBtn.className = "toast-close";
  closeBtn.innerHTML = "×";
  closeBtn.setAttribute("aria-label", "Close notification");
  closeBtn.onclick = () => removeToast(toast);

  toast.appendChild(icon);
  toast.appendChild(content);
  toast.appendChild(closeBtn);

  // Add progress bar for auto-dismiss
  if (duration > 0 && type !== "loading") {
    const progress = doc.createElement("div");
    progress.className = "toast-progress";
    progress.style.animationDuration = `${duration}ms`;
    toast.appendChild(progress);
  }

  container.appendChild(toast);
  announce(announcementText(title, message));

  // Auto-dismiss
  if (duration > 0 && type !== "loading") {
    setTimeout(() => removeToast(toast), duration);
  }

  return toast;
};

/**
 * Remove a toast notification with an exit animation.
 * @param {HTMLElement} toast - The toast element to remove
 */
const removeToast = (toast) => {
  toast.classList.add("toast-removing");
  setTimeout(() => {
    if (toast.parentElement) {
      toast.parentElement.removeChild(toast);
    }
  }, 300);
};

export { showToast, removeToast, createToastContainer };
