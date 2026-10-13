/**
 * Vite Build Configuration — Phase 1.3 Build Pipeline Modernization
 *
 * Bundles, minifies, and content-hashes the client-side JavaScript modules.
 * Eleventy reads the generated manifest to inject correct <script> paths.
 *
 * Build output:  dist/                (intermediate, passthrough-copied by Eleventy)
 * Manifest:      dist/.vite/manifest.json
 *
 * Entry points match the <script> tags in base.njk.  Page-specific scripts
 * (pages/*.js) are left unbundled so that per-page passthrough copy and
 * existing smoke-test assertions remain unchanged.
 */

import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    manifest: true,
    sourcemap: false,
    target: "es2020",
    minify: "esbuild",
    rollupOptions: {
      // Vite drops entry exports for app builds; the Chart.js entry exists to
      // be imported dynamically and must keep `Chart` and `registerables`.
      // The other entries export nothing, so their output is unchanged.
      preserveEntrySignatures: "exports-only",
      input: {
        app: resolve("src/assets/js/app.js"),
        "progress-ui": resolve("src/assets/js/progress-ui.js"),
        "video-embed": resolve("src/assets/js/video-embed.js"),
        // Chart.js, lazily imported by src/scripts/dashboard.js (P17-23). Not
        // referenced by any <script> tag, so it stays out of the initial JS.
        "chart-vendor": resolve("src/vendor-entry/chart.js"),
      },
      output: {
        entryFileNames: "js/[name].[hash].js",
        chunkFileNames: "js/chunks/[name].[hash].js",
        assetFileNames: "[ext]/[name].[hash][extname]",
      },
    },
  },
});
