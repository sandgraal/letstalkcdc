import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkCssBaseline } from "../../scripts/check-css-baseline.mjs";

/**
 * Logic of scripts/check-css-baseline.mjs, exercised against temp files so it
 * never depends on a build having run.
 */

const sha = (text) => createHash("sha256").update(text).digest("hex");

describe("checkCssBaseline", () => {
  let dir;
  let cssPath;
  let baselinePath;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "css-baseline-"));
    cssPath = path.join(dir, "styles.min.css");
    baselinePath = path.join(dir, "css-baseline.sha256");
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("passes when the stylesheet hashes to the baseline", () => {
    fs.writeFileSync(cssPath, "a{color:red}");
    fs.writeFileSync(baselinePath, `${sha("a{color:red}")}\n`);
    const result = checkCssBaseline({ cssPath, baselinePath });
    expect(result.ok).toBe(true);
    expect(result.actual).toBe(result.expected);
  });

  it("fails and reports both hashes when the stylesheet changed", () => {
    fs.writeFileSync(cssPath, "a{color:blue}");
    fs.writeFileSync(baselinePath, `${sha("a{color:red}")}\n`);
    const result = checkCssBaseline({ cssPath, baselinePath });
    expect(result.ok).toBe(false);
    expect(result.actual).toBe(sha("a{color:blue}"));
    expect(result.expected).toBe(sha("a{color:red}"));
  });

  it("fails with the build hint when the stylesheet is missing", () => {
    fs.writeFileSync(baselinePath, `${sha("x")}\n`);
    const result = checkCssBaseline({ cssPath, baselinePath });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("NODE_ENV=production npm run build:css");
  });

  it("fails when the baseline file is missing", () => {
    fs.writeFileSync(cssPath, "a{}");
    const result = checkCssBaseline({ cssPath, baselinePath });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("missing");
  });

  it("fails when the baseline is not a 64-character hash", () => {
    fs.writeFileSync(cssPath, "a{}");
    fs.writeFileSync(baselinePath, "not-a-hash\n");
    const result = checkCssBaseline({ cssPath, baselinePath });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("64-character");
  });
});
