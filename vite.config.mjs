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
      input: {
        app: resolve("src/assets/js/app.js"),
        search: resolve("src/assets/js/search.js"),
        "progress-ui": resolve("src/assets/js/progress-ui.js"),
        "video-embed": resolve("src/assets/js/video-embed.js"),
        "web-vitals-dashboard": resolve(
          "src/assets/js/web-vitals-dashboard.js",
        ),
      },
      output: {
        entryFileNames: "js/[name].[hash].js",
        chunkFileNames: "js/chunks/[name].[hash].js",
        assetFileNames: "[ext]/[name].[hash][extname]",
      },
    },
  },
});
