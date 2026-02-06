/**
 * Vitest global test setup
 * Provides mocks for browser APIs not available in jsdom.
 */

// --- localStorage mock (jsdom has a basic one, but we ensure reset) ---
beforeEach(() => {
  localStorage.clear();
});

// --- Mock IntersectionObserver ---
class MockIntersectionObserver {
  constructor(callback, options = {}) {
    this._callback = callback;
    this._options = options;
    this._entries = [];
    MockIntersectionObserver._instances.push(this);
  }

  observe(target) {
    this._entries.push({
      target,
      isIntersecting: false,
      intersectionRatio: 0,
      boundingClientRect: target.getBoundingClientRect(),
      intersectionRect: target.getBoundingClientRect(),
      rootBounds: null,
      time: Date.now(),
    });
  }

  unobserve() {}
  disconnect() {}

  // Test helper: simulate intersections
  _trigger(entries) {
    this._callback(entries, this);
  }
}
MockIntersectionObserver._instances = [];

if (!globalThis.IntersectionObserver) {
  globalThis.IntersectionObserver = MockIntersectionObserver;
}

// Reset instances between tests
beforeEach(() => {
  MockIntersectionObserver._instances = [];
});

// --- Mock matchMedia ---
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

// --- Mock navigator.clipboard ---
if (!navigator.clipboard) {
  Object.defineProperty(navigator, "clipboard", {
    value: {
      writeText: vi.fn().mockResolvedValue(undefined),
      readText: vi.fn().mockResolvedValue(""),
    },
    writable: true,
  });
}

// --- Suppress console.debug in tests ---
vi.spyOn(console, "debug").mockImplementation(() => {});
