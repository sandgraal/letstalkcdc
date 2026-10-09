/**
 * Guard (P15-33): `cta-button`, `btn-primary` and `btn-secondary` matched no
 * CSS rule, so the calls to action using them rendered as plain links. Site
 * templates and content use the shared `.button` classes instead
 * (`.button.primary`, `.button.secondary`).
 *
 * `playground/` is a separate app with its own stylesheet where `btn-primary`
 * is defined, so only `src/` is scanned.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../src",
);
const MARKUP = /\.(njk|md|html|liquid)$/;
// Matches the class as a whole token, not as part of e.g. `btn-primary-lg`.
const UNSTYLED = /(?<![\w-])(cta-button|btn-primary|btn-secondary)(?![\w-])/g;

/** @param {string} dir */
function markupFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return markupFiles(full);
    return MARKUP.test(entry.name) ? [full] : [];
  });
}

describe("button class names", () => {
  it("no src template or content page uses a class that has no CSS", () => {
    const hits = markupFiles(SRC).flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(UNSTYLED)].map(
        (m) => `${path.relative(SRC, file)}: ${m[1]}`,
      ),
    );
    expect(hits).toEqual([]);
  });
});
