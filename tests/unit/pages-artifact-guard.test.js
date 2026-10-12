/**
 * Guard: the Pages artifact action must keep dot-directories (P17-29).
 *
 * security.txt is built to _site/.well-known/. actions/upload-pages-artifact
 * v4 and later exclude dot-directories from the artifact, so bumping past @v3
 * would silently remove /.well-known/security.txt from production. This test
 * reads the deploy workflow (owned by the maintainer, not edited here) and
 * fails with the fix instead.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

export function artifactProblem(workflow) {
  const majors = [
    ...workflow.matchAll(/actions\/upload-pages-artifact@v(\d+)/g),
  ].map((m) => Number(m[1]));
  if (majors.some((v) => v >= 4))
    return (
      "actions/upload-pages-artifact@v4 or higher excludes dot-directories, " +
      "so _site/.well-known/security.txt would silently vanish from " +
      "production. Before bumping, add a copy step or rename the directory " +
      "so the file ships, then update this test."
    );
  return undefined;
}

describe("Pages artifact action keeps _site/.well-known", () => {
  it("deploy.yml does not use upload-pages-artifact v4 or later", () => {
    const yml = readFileSync(
      path.join(ROOT, ".github", "workflows", "deploy.yml"),
      "utf8",
    );
    expect(yml).toContain("actions/upload-pages-artifact@");
    const problem = artifactProblem(yml);
    expect(problem, problem).toBeUndefined();
  });

  it("flags v4 and v5 but not v3", () => {
    expect(artifactProblem("uses: actions/upload-pages-artifact@v3")).toBe(
      undefined,
    );
    expect(artifactProblem("uses: actions/upload-pages-artifact@v4")).toMatch(
      /copy step or rename/,
    );
    expect(artifactProblem("uses: actions/upload-pages-artifact@v5")).toMatch(
      /dot-directories/,
    );
  });
});
