/**
 * Unit tests for the Toast module
 * @module tests/unit/modules/toast.test
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  showToast,
  removeToast,
  createToastContainer,
} from "../../../src/assets/js/modules/toast.js";

describe("toast module", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  describe("createToastContainer", () => {
    it("creates a container if none exists", () => {
      const container = createToastContainer();
      expect(container).toBeInstanceOf(HTMLElement);
      expect(container.className).toBe("toast-container");
      expect(document.body.contains(container)).toBe(true);
    });

    it("returns existing container if already in DOM", () => {
      const first = createToastContainer();
      const second = createToastContainer();
      expect(first).toBe(second);
    });
  });

  describe("showToast", () => {
    it("creates a toast element and appends to container", () => {
      const toast = showToast({ title: "Hello", message: "World" });
      expect(toast).toBeInstanceOf(HTMLElement);
      expect(toast.classList.contains("toast")).toBe(true);
      expect(toast.classList.contains("toast-info")).toBe(true);
    });

    it("renders title and message", () => {
      const toast = showToast({ title: "Test", message: "Body text" });
      expect(toast.querySelector(".toast-title").textContent).toBe("Test");
      expect(toast.querySelector(".toast-message").textContent).toBe(
        "Body text",
      );
    });

    it("applies correct type class", () => {
      const toast = showToast({ type: "success" });
      expect(toast.classList.contains("toast-success")).toBe(true);
    });

    it("renders action buttons", () => {
      const onClick = vi.fn();
      const toast = showToast({
        actions: [{ label: "Undo", onClick }],
      });
      const btn = toast.querySelector(".toast-action");
      expect(btn).not.toBeNull();
      expect(btn.textContent).toBe("Undo");
    });

    it("calls action callback and removes toast on click", () => {
      const onClick = vi.fn();
      const toast = showToast({
        actions: [{ label: "Do it", onClick }],
        duration: 0,
      });
      const btn = toast.querySelector(".toast-action");
      btn.click();
      expect(onClick).toHaveBeenCalledOnce();
    });

    it("has a close button", () => {
      const toast = showToast({ title: "Closable", duration: 0 });
      const closeBtn = toast.querySelector(".toast-close");
      expect(closeBtn).not.toBeNull();
      expect(closeBtn.getAttribute("aria-label")).toBe("Close notification");
    });

    it("auto-dismisses after duration", () => {
      vi.useFakeTimers();
      const toast = showToast({ title: "Auto", duration: 1000 });
      expect(toast.classList.contains("toast-removing")).toBe(false);

      vi.advanceTimersByTime(1000);
      expect(toast.classList.contains("toast-removing")).toBe(true);
      vi.useRealTimers();
    });

    it("does not auto-dismiss for loading type", () => {
      vi.useFakeTimers();
      const toast = showToast({ type: "loading", duration: 1000 });
      vi.advanceTimersByTime(2000);
      expect(toast.classList.contains("toast-removing")).toBe(false);
      vi.useRealTimers();
    });

    it("adds progress bar when duration > 0", () => {
      const toast = showToast({ duration: 3000 });
      const progress = toast.querySelector(".toast-progress");
      expect(progress).not.toBeNull();
      expect(progress.style.animationDuration).toBe("3000ms");
    });

    it("does not add progress bar when duration is 0", () => {
      const toast = showToast({ duration: 0 });
      const progress = toast.querySelector(".toast-progress");
      expect(progress).toBeNull();
    });

    it("creates toast with no title or message", () => {
      const toast = showToast({});
      expect(toast.querySelector(".toast-title")).toBeNull();
      expect(toast.querySelector(".toast-message")).toBeNull();
    });
  });

  describe("removeToast", () => {
    it("adds removing class and removes from DOM", () => {
      vi.useFakeTimers();
      const toast = showToast({ title: "Remove me", duration: 0 });
      removeToast(toast);
      expect(toast.classList.contains("toast-removing")).toBe(true);

      vi.advanceTimersByTime(300);
      expect(toast.parentElement).toBeNull();
      vi.useRealTimers();
    });

    it("handles removing a toast that is already detached", () => {
      vi.useFakeTimers();
      const toast = showToast({ duration: 0 });
      toast.remove();
      expect(() => removeToast(toast)).not.toThrow();
      vi.advanceTimersByTime(300);
      vi.useRealTimers();
    });
  });

  describe("multiple toasts", () => {
    it("stacks multiple toasts in the same container", () => {
      showToast({ title: "First", duration: 0 });
      showToast({ title: "Second", duration: 0 });
      const container = document.querySelector(".toast-container");
      expect(container.children.length).toBe(2);
    });
  });
});
