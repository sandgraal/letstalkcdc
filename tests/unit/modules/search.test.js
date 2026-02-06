/**
 * Unit tests for the Search module (Fuse.js fuzzy search)
 * @module tests/unit/modules/search.test
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock path-prefix before importing search
vi.mock("../../../src/assets/js/utils/path-prefix.js", () => ({
  withBasePath: (path) => `/letstalkcdc${path}`,
  pathPrefix: "/letstalkcdc",
}));

// Must import after mock
const { initSearch } = await import(
  "../../../src/assets/js/modules/search.js"
);

describe("search module", () => {
  const mockTracer = { trackSearch: vi.fn() };

  const mockIndex = [
    {
      title: "Introduction to CDC",
      path: "/intro/",
      description: "Learn the fundamentals of Change Data Capture",
      tags: ["core-concept", "beginner"],
      headings: ["What is CDC", "Why CDC Matters"],
      text: "Change Data Capture (CDC) is a technique for tracking changes in database tables",
    },
    {
      title: "Snapshotting Guide",
      path: "/snapshotting/",
      description: "How to capture initial database state with snapshots",
      tags: ["advanced"],
      headings: ["Initial Snapshot", "Incremental Snapshots"],
      text: "Snapshotting captures the initial state of your database before streaming begins",
    },
    {
      title: "Debezium Setup",
      path: "/quickstarts/",
      description: "Get started with the Debezium CDC platform quickly",
      tags: ["quickstart", "debezium"],
      headings: ["Installing Debezium", "Kafka Connect Configuration"],
      text: "Debezium is an open-source CDC platform built on Kafka Connect for streaming changes",
    },
  ];

  /** Initialize search and wait for Fuse.js index to be ready */
  const setupSearch = async () => {
    initSearch(mockTracer);
    await vi.advanceTimersByTimeAsync(0);
  };

  /** Type a query and wait for the debounce to fire */
  const typeSearch = async (query) => {
    const input = document.querySelector("#searchInput");
    input.value = query;
    input.dispatchEvent(new Event("input"));
    await vi.advanceTimersByTimeAsync(200);
    return input;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = "";
    vi.clearAllMocks();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockIndex),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Overlay structure ─────────────────────────────────────────────

  it("creates a search overlay element in the DOM", async () => {
    await setupSearch();
    const overlay = document.querySelector(".search-overlay");
    expect(overlay).not.toBeNull();
    expect(overlay.classList.contains("hidden")).toBe(true);
  });

  it("contains required UI elements", async () => {
    await setupSearch();
    expect(document.querySelector("#searchInput")).not.toBeNull();
    expect(document.querySelector("#searchResults")).not.toBeNull();
    expect(document.querySelector(".close-search")).not.toBeNull();
    expect(document.querySelector("#searchTitle")).not.toBeNull();
    expect(document.querySelector(".search-meta")).not.toBeNull();
    expect(document.querySelector(".search-hint")).not.toBeNull();
  });

  it("fetches search index with correct URL", async () => {
    await setupSearch();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/letstalkcdc/search-index.json",
      { cache: "force-cache" },
    );
  });

  // ── Open / close ──────────────────────────────────────────────────

  it("opens overlay on / key press", async () => {
    await setupSearch();
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "/", bubbles: true }),
    );
    expect(
      document.querySelector(".search-overlay").classList.contains("hidden"),
    ).toBe(false);
  });

  it("does not open on / when meta key is held", async () => {
    await setupSearch();
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "/",
        metaKey: true,
        bubbles: true,
      }),
    );
    expect(
      document.querySelector(".search-overlay").classList.contains("hidden"),
    ).toBe(true);
  });

  it("does not open on / when focus is in an input field", async () => {
    document.body.innerHTML = '<input type="text" id="otherInput">';
    await setupSearch();
    const otherInput = document.querySelector("#otherInput");
    otherInput.dispatchEvent(
      new KeyboardEvent("keydown", { key: "/", bubbles: true }),
    );
    expect(
      document.querySelector(".search-overlay").classList.contains("hidden"),
    ).toBe(true);
  });

  it("closes overlay on Escape", async () => {
    await setupSearch();
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "/", bubbles: true }),
    );
    expect(
      document.querySelector(".search-overlay").classList.contains("hidden"),
    ).toBe(false);

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(
      document.querySelector(".search-overlay").classList.contains("hidden"),
    ).toBe(true);
  });

  it("closes overlay on close button click", async () => {
    await setupSearch();
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "/", bubbles: true }),
    );
    document.querySelector(".close-search").click();
    expect(
      document.querySelector(".search-overlay").classList.contains("hidden"),
    ).toBe(true);
  });

  // ── Fuzzy search + rendering ──────────────────────────────────────

  it("renders results matching search query", async () => {
    await setupSearch();
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "/", bubbles: true }),
    );
    await typeSearch("debezium");

    const firstResult = document.querySelector("#searchResults .result");
    expect(firstResult).not.toBeNull();
    expect(firstResult.querySelector("strong").textContent).toContain(
      "Debezium",
    );
  });

  it("ranks title matches higher than text-only matches", async () => {
    await setupSearch();
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "/", bubbles: true }),
    );
    await typeSearch("snapshot");

    const firstResult = document.querySelector("#searchResults .result");
    expect(firstResult).not.toBeNull();
    expect(firstResult.querySelector("strong").textContent).toContain(
      "Snapshot",
    );
  });

  it("supports fuzzy matching for approximate queries", async () => {
    await setupSearch();
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "/", bubbles: true }),
    );
    // "debezum" is a typo for "debezium" — fuzzy match should still find it
    await typeSearch("debezum");

    const results = document.querySelectorAll("#searchResults .result");
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("shows no-results message for unmatched query", async () => {
    await setupSearch();
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "/", bubbles: true }),
    );
    await typeSearch("zzzzzznotexist");

    const empty = document.querySelector(".search-empty");
    expect(empty).not.toBeNull();
    expect(empty.textContent).toContain("No results found");
  });

  it("displays match count in search meta", async () => {
    await setupSearch();
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "/", bubbles: true }),
    );
    await typeSearch("CDC");

    const meta = document.querySelector(".search-meta");
    expect(meta.textContent).toMatch(/\d+ results? found/);
  });

  it("highlights matches with mark tags", async () => {
    await setupSearch();
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "/", bubbles: true }),
    );
    await typeSearch("debezium");

    const marks = document.querySelectorAll("#searchResults mark");
    expect(marks.length).toBeGreaterThan(0);
  });

  it("renders tags for results that have them", async () => {
    await setupSearch();
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "/", bubbles: true }),
    );
    await typeSearch("debezium");

    const tags = document.querySelectorAll("#searchResults .result-tag");
    expect(tags.length).toBeGreaterThan(0);
  });

  it("clears results when query is empty", async () => {
    await setupSearch();
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "/", bubbles: true }),
    );
    await typeSearch("CDC");
    expect(document.querySelector("#searchResults").innerHTML).not.toBe("");

    await typeSearch("");
    expect(document.querySelector("#searchResults").innerHTML).toBe("");
  });

  // ── Keyboard navigation ───────────────────────────────────────────

  it("ArrowDown selects the first result", async () => {
    await setupSearch();
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "/", bubbles: true }),
    );
    await typeSearch("CDC");

    const input = document.querySelector("#searchInput");
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );

    const firstResult = document.querySelector("#searchResults .result");
    expect(firstResult.classList.contains("is-active")).toBe(true);
    expect(firstResult.getAttribute("aria-selected")).toBe("true");
  });

  it("ArrowDown wraps to first result after last", async () => {
    await setupSearch();
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "/", bubbles: true }),
    );
    await typeSearch("CDC");

    const input = document.querySelector("#searchInput");
    const count = document.querySelectorAll("#searchResults .result").length;
    for (let i = 0; i <= count; i++) {
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
      );
    }

    const firstResult = document.querySelector("#searchResults .result");
    expect(firstResult.classList.contains("is-active")).toBe(true);
  });

  it("ArrowUp selects the last result when nothing selected", async () => {
    await setupSearch();
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "/", bubbles: true }),
    );
    await typeSearch("CDC");

    const input = document.querySelector("#searchInput");
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }),
    );

    const allResults = document.querySelectorAll("#searchResults .result");
    const lastResult = allResults[allResults.length - 1];
    expect(lastResult.classList.contains("is-active")).toBe(true);
  });

  it("Enter navigates to the active result", async () => {
    await setupSearch();
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "/", bubbles: true }),
    );
    await typeSearch("debezium");

    const input = document.querySelector("#searchInput");
    const clickSpy = vi.fn();
    document
      .querySelector("#searchResults .result")
      .addEventListener("click", clickSpy);

    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );

    expect(clickSpy).toHaveBeenCalled();
  });

  // ── Tracking ──────────────────────────────────────────────────────

  it("tracks search via tracer", async () => {
    await setupSearch();
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "/", bubbles: true }),
    );
    await typeSearch("kafka");

    expect(mockTracer.trackSearch).toHaveBeenCalledWith(
      "kafka",
      expect.any(Number),
    );
  });

  // ── Error handling ────────────────────────────────────────────────

  it("handles fetch failure gracefully", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));
    await setupSearch();
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "/", bubbles: true }),
    );
    await typeSearch("anything");

    // fuse is null, so should show loading indicator
    expect(document.querySelector("#searchResults").textContent).toContain(
      "Search index loading",
    );
  });

  // ── Search button ─────────────────────────────────────────────────

  it("adds search button to .nav-utilities if present", async () => {
    document.body.innerHTML = '<div class="nav-utilities"></div>';
    await setupSearch();

    const searchBtn = document.querySelector(".search-btn");
    expect(searchBtn).not.toBeNull();
    expect(searchBtn.textContent).toBe("Search");
  });
});
