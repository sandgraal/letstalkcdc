/**
 * Unit tests for the Search module
 * @module tests/unit/modules/search.test
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock path-prefix before importing search
vi.mock("../../../src/assets/js/utils/path-prefix.js", () => ({
  withBasePath: (path) => `/letstalkcdc${path}`,
  pathPrefix: "/letstalkcdc",
}));

// Must import after mock
const { initSearch } = await import("../../../src/assets/js/modules/search.js");

describe("search module", () => {
  const mockTracer = {
    trackSearch: vi.fn(),
  };

  const mockIndex = [
    {
      title: "Introduction to CDC",
      path: "/intro/",
      text: "Change Data Capture (CDC) is a technique for tracking changes",
    },
    {
      title: "Snapshotting Guide",
      path: "/snapshotting/",
      text: "Snapshotting captures the initial state of your database",
    },
    {
      title: "Debezium Setup",
      path: "/quickstarts/",
      text: "Debezium is an open-source CDC platform built on Kafka Connect",
    },
  ];

  beforeEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();

    // Mock fetch for search index
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockIndex),
    });
  });

  it("creates a search overlay element in the DOM", () => {
    initSearch(mockTracer);
    const overlay = document.querySelector(".search-overlay");
    expect(overlay).not.toBeNull();
    expect(overlay.classList.contains("hidden")).toBe(true);
  });

  it("contains required UI elements", () => {
    initSearch(mockTracer);
    expect(document.querySelector("#searchInput")).not.toBeNull();
    expect(document.querySelector("#searchResults")).not.toBeNull();
    expect(document.querySelector(".close-search")).not.toBeNull();
    expect(document.querySelector("#searchTitle")).not.toBeNull();
  });

  it("fetches search index with correct URL", () => {
    initSearch(mockTracer);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/letstalkcdc/search-index.json",
      { cache: "force-cache" },
    );
  });

  it("opens overlay on / key press", async () => {
    initSearch(mockTracer);
    // Wait for fetch to complete
    await vi.waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "/", bubbles: true }),
    );

    const overlay = document.querySelector(".search-overlay");
    expect(overlay.classList.contains("hidden")).toBe(false);
  });

  it("does not open on / when meta key is held", () => {
    initSearch(mockTracer);

    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "/",
        metaKey: true,
        bubbles: true,
      }),
    );

    const overlay = document.querySelector(".search-overlay");
    expect(overlay.classList.contains("hidden")).toBe(true);
  });

  it("closes overlay on Escape", () => {
    initSearch(mockTracer);

    // Open first
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "/", bubbles: true }),
    );
    expect(
      document.querySelector(".search-overlay").classList.contains("hidden"),
    ).toBe(false);

    // Close
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(
      document.querySelector(".search-overlay").classList.contains("hidden"),
    ).toBe(true);
  });

  it("closes overlay on close button click", () => {
    initSearch(mockTracer);

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "/", bubbles: true }),
    );

    document.querySelector(".close-search").click();
    expect(
      document.querySelector(".search-overlay").classList.contains("hidden"),
    ).toBe(true);
  });

  it("renders results matching search query", async () => {
    initSearch(mockTracer);
    await vi.waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });
    // Wait for fetch promise chain
    await new Promise((r) => setTimeout(r, 0));

    // Open and type
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "/", bubbles: true }),
    );

    const input = document.querySelector("#searchInput");
    input.value = "debezium";
    input.dispatchEvent(new Event("input"));

    const results = document.querySelector("#searchResults");
    expect(results.innerHTML).toContain("Debezium Setup");
  });

  it("scores title matches higher than text matches", async () => {
    initSearch(mockTracer);
    await new Promise((r) => setTimeout(r, 0));

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "/", bubbles: true }),
    );

    const input = document.querySelector("#searchInput");
    input.value = "snapshot";
    input.dispatchEvent(new Event("input"));

    const firstResult = document.querySelector("#searchResults .result");
    expect(firstResult).not.toBeNull();
    expect(firstResult.querySelector("strong").textContent).toBe(
      "Snapshotting Guide",
    );
  });

  it("clears results when query is empty", async () => {
    initSearch(mockTracer);
    await new Promise((r) => setTimeout(r, 0));

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "/", bubbles: true }),
    );

    const input = document.querySelector("#searchInput");
    input.value = "CDC";
    input.dispatchEvent(new Event("input"));
    expect(document.querySelector("#searchResults").innerHTML).not.toBe("");

    input.value = "";
    input.dispatchEvent(new Event("input"));
    expect(document.querySelector("#searchResults").innerHTML).toBe("");
  });

  it("tracks search via tracer", async () => {
    initSearch(mockTracer);
    await new Promise((r) => setTimeout(r, 0));

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "/", bubbles: true }),
    );

    const input = document.querySelector("#searchInput");
    input.value = "kafka";
    input.dispatchEvent(new Event("input"));

    expect(mockTracer.trackSearch).toHaveBeenCalledWith(
      "kafka",
      expect.any(Number),
    );
  });

  it("handles fetch failure gracefully", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));
    initSearch(mockTracer);
    await new Promise((r) => setTimeout(r, 0));

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "/", bubbles: true }),
    );

    const input = document.querySelector("#searchInput");
    input.value = "anything";
    input.dispatchEvent(new Event("input"));

    // Should not throw, just show no results
    expect(document.querySelector("#searchResults").innerHTML).toBe("");
  });

  it("adds search button to .nav-utilities if present", () => {
    document.body.innerHTML = `<div class="nav-utilities"></div>`;
    initSearch(mockTracer);

    const searchBtn = document.querySelector(".search-btn");
    expect(searchBtn).not.toBeNull();
    expect(searchBtn.textContent).toBe("Search");
  });
});
