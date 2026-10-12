/**
 * Decision for the `.well-known/security.txt` smoke check (P17-29, P17-64).
 *
 * In CI the smoke job gets `_site` from actions/upload-artifact, which drops
 * hidden files and directories unless `include-hidden-files: true` is set
 * (the default since v4.4). The workflow is the maintainer's, so until
 * P17-64 sets that flag the check is skipped, visibly, but only when the run
 * looks exactly like a stripped CI artifact. Everywhere else it stays strict.
 */

export const SKIP_NOTE =
  "skipped: actions/upload-artifact drops dot-directories; covered by " +
  "tests/unit/security-contact.test.js, which builds the site itself; to " +
  "restore this check set include-hidden-files: true on the upload-artifact " +
  "step in ci.yml (plan item P17-64)";

/** True when the environment says this is a GitHub Actions / CI run. */
export function isCiRun(env) {
  return env.GITHUB_ACTIONS === "true" || env.CI === "true";
}

/**
 * @param {{ env: Record<string,string|undefined>, wellKnownExists: boolean,
 *   dotDirs: string[] }} input  dotDirs: names of dot-directories directly
 *   inside the build output, including ".well-known" when present.
 * @returns {"strict" | "skip"} "skip" only when CI AND `.well-known` is
 *   absent AND the output has no other dot-directory; otherwise "strict"
 *   (a missing file then fails, a present file gets its content checks).
 */
export function securityTxtCheckMode({ env, wellKnownExists, dotDirs }) {
  if (wellKnownExists) return "strict";
  if (!isCiRun(env)) return "strict";
  const others = dotDirs.filter((d) => d !== ".well-known");
  return others.length === 0 ? "skip" : "strict";
}
