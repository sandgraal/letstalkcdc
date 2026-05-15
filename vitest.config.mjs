import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    // jsdom 28 disables Web Storage on opaque origins (the default
    // `about:blank` URL). Pin a non-opaque URL so localStorage/sessionStorage
    // are available to the suite.
    environmentOptions: {
      jsdom: {
        url: "http://localhost/",
      },
    },
    setupFiles: "./tests/setup.js",
    include: ["tests/unit/**/*.test.js"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/assets/js/modules/**"],
      exclude: ["node_modules/", "tests/", "_site/", "dist/"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
    },
  },
});
