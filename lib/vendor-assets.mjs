// Self-hosted third-party browser libraries (P17-23).
//
// Mermaid is a classic (non-module) script, so it is copied verbatim from the
// pinned npm package to a content-hashed path under /assets/vendor/ and loaded
// with a Subresource Integrity hash. Both the hashed file name and the
// integrity value are derived from the file's bytes at build time, so they can
// never drift from what is served. Chart.js is not handled here: it goes
// through the Vite build as a lazily imported chunk (see vite.config.mjs).
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const MERMAID_SOURCE = path.join(
  ROOT,
  "node_modules",
  "mermaid",
  "dist",
  "mermaid.min.js",
);

let cached = null;

/**
 * Describe the vendored Mermaid file.
 * @returns {{ source: string, outputPath: string, publicPath: string, integrity: string }}
 *   outputPath is relative to the site root (no leading slash, no prefix);
 *   publicPath is the same with a leading slash, for use with `| url`.
 */
export function getMermaidAsset() {
  if (cached) return cached;
  let bytes;
  try {
    bytes = readFileSync(MERMAID_SOURCE);
  } catch (error) {
    throw new Error(
      `Cannot read ${MERMAID_SOURCE}. Run "npm ci" (mermaid is a pinned devDependency that is vendored at build time).`,
      { cause: error },
    );
  }
  const name = `mermaid.${createHash("sha256").update(bytes).digest("hex").slice(0, 12)}.min.js`;
  const integrity = `sha384-${createHash("sha384").update(bytes).digest("base64")}`;
  cached = {
    source: MERMAID_SOURCE,
    outputPath: `assets/vendor/${name}`,
    publicPath: `/assets/vendor/${name}`,
    integrity,
  };
  return cached;
}
