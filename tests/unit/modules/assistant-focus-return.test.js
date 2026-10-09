/**
 * Focus return for the assistant panel (P15-15 b).
 *
 * Imports the real `src/js/assistant.js`, lets its DOMContentLoaded bootstrap
 * run against a minimal page, and checks that every way of closing the panel
 * puts focus back on the floating button.
 *
 * @module tests/unit/modules/assistant-focus-return.test
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

let fab;
let panel;

beforeAll(async () => {
  globalThis.fetch = vi.fn(async () => ({
    json: async () => ({ intents: [] }),
  }));
  // jsdom has no layout; the open handler defers focus to a frame.
  globalThis.requestAnimationFrame = (cb) => {
    cb(0);
    return 0;
  };
  document.body.innerHTML = `
    <button id="outside" type="button">outside</button>
    <button id="askBtn" type="button" aria-expanded="false" aria-controls="askPanel">chat</button>
    <div id="askPanel" hidden></div>`;
  await import("../../../src/js/assistant.js");
  document.dispatchEvent(new Event("DOMContentLoaded"));
  // loadKB is async; wait for the panel markup to be injected.
  await vi.waitFor(() => {
    if (!document.querySelector("#askPanel .assistant-close"))
      throw new Error("panel not built");
  });
  fab = document.getElementById("askBtn");
  panel = document.getElementById("askPanel");
});

function open() {
  fab.focus();
  fab.click();
  expect(panel.hidden).toBe(false);
}

describe("assistant panel – focus return on close", () => {
  beforeEach(() => {
    if (!panel.hidden) fab.click();
    document.getElementById("outside").focus();
  });

  it("moves focus into the input on open", () => {
    open();
    expect(document.activeElement).toBe(
      panel.querySelector(".assistant-input"),
    );
  });

  it("returns focus to the floating button when the close button is used", () => {
    open();
    const close = panel.querySelector(".assistant-close");
    close.focus();
    close.click();
    expect(panel.hidden).toBe(true);
    expect(fab.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(fab);
  });

  it("returns focus to the floating button on Escape", () => {
    open();
    panel
      .querySelector(".assistant-input")
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    expect(panel.hidden).toBe(true);
    expect(document.activeElement).toBe(fab);
  });

  it("keeps focus on the floating button when it toggles the panel closed", () => {
    open();
    fab.focus();
    fab.click();
    expect(panel.hidden).toBe(true);
    expect(document.activeElement).toBe(fab);
  });

  it("does not close or move focus for other keys", () => {
    open();
    const input = panel.querySelector(".assistant-input");
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "a", bubbles: true }),
    );
    expect(panel.hidden).toBe(false);
    expect(document.activeElement).toBe(input);
  });
});
