/**
 * Vitest global test setup
 * Provides mocks for browser APIs not available in jsdom.
 */

// --- Build-time variables ---
// Several tests spawn real Eleventy builds with `...process.env`. A variable
// exported in the developer's shell (BUTTONDOWN_USERNAME, SUPABASE_*, ...)
// would silently change what those builds render, so the suite starts from
// an unset state. Tests that need a value pass it explicitly in the spawn env.
for (const key of [
  "BUTTONDOWN_USERNAME",
  "GOATCOUNTER_CODE",
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
]) {
  delete process.env[key];
}

// --- localStorage / sessionStorage polyfill ---
// vitest 4's jsdom 28 environment ships without a working `Storage` impl, and
// Node 26's experimental `--localstorage-file` flag is gated behind a CLI arg
// we don't pass. Define a minimal in-memory Storage that satisfies every
// production code path (getItem/setItem/removeItem/clear + .length + index
// access). Mounted on `globalThis`, `window`, and `globalThis.localStorage`
// so all spelling styles resolve.
class MemoryStorage {
  constructor() {
    this._data = new Map();
  }
  get length() {
    return this._data.size;
  }
  key(i) {
    return Array.from(this._data.keys())[i] ?? null;
  }
  getItem(k) {
    return this._data.has(String(k)) ? this._data.get(String(k)) : null;
  }
  setItem(k, v) {
    this._data.set(String(k), String(v));
  }
  removeItem(k) {
    this._data.delete(String(k));
  }
  clear() {
    this._data.clear();
  }
}
const installStorage = (name) => {
  const store = new MemoryStorage();
  Object.defineProperty(globalThis, name, {
    value: store,
    writable: true,
    configurable: true,
  });
  if (typeof window !== "undefined" && window !== globalThis) {
    Object.defineProperty(window, name, {
      value: store,
      writable: true,
      configurable: true,
    });
  }
};
installStorage("localStorage");
installStorage("sessionStorage");

beforeEach(() => {
  globalThis.localStorage.clear();
  globalThis.sessionStorage.clear();
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
