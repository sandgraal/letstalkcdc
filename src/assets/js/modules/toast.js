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
