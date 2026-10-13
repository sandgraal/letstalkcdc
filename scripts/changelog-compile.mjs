#!/usr/bin/env node
/**
 * Fold changelog fragments into CHANGELOG.md (P17-67).
 *
 *   npm run changelog:compile              fold and delete the fragments
 *   npm run changelog:compile -- --dry-run print what would change, write nothing
 *   npm run changelog:compile -- --check   validate the fragments, write nothing
 *
 * A pull request never edits CHANGELOG.md. It adds ONE new file under
 * changelog.d/ (unique name, so no merge conflict) and the conductor folds the
 * fragments into `## [Unreleased]` in one commit. See changelog.d/README.md.
 *
 * Fragment format: an optional first line `type: Added|Changed|Fixed|Removed|
 * Security|Docs` (default Changed), then the entry text exactly as it should
 * read inside a bullet (without the leading "- ").
 *
 * Each entry is inserted at the TOP of the first `### <Type>` heading inside
 * `## [Unreleased]` (newest first, as the file already does). A missing heading
 * is created in the order Added, Changed, Fixed, Removed, Security, Docs.
 * Folded fragments are deleted, so a second run finds nothing to do. No
 * dependencies.
 */
import {
  existsSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_DIR = path.join(root, "changelog.d");
export const DEFAULT_CHANGELOG = path.join(root, "CHANGELOG.md");
export const TYPES = [
  "Added",
  "Changed",
  "Fixed",
  "Removed",
  "Security",
  "Docs",
];
export const DEFAULT_TYPE = "Changed";
const UNRELEASED = /^## \[Unreleased\]\s*$/;

/**
 * Parse one fragment.
 * @param {string} name file name, used in problem messages
 * @param {string} raw file content
 * @returns {{name: string, type: string, lines: string[], problems: string[]}}
 */
export function parseFragment(name, raw) {
  const problems = [];
  const all = raw.replace(/\r\n?/g, "\n").split("\n");
  let type = DEFAULT_TYPE;
  let start = 0;
  while (start < all.length && all[start].trim() === "") start++;
  const m = /^type:\s*(.*?)\s*$/i.exec(all[start] ?? "");
  if (m) {
    if (TYPES.includes(m[1])) type = m[1];
    else
      problems.push(
        `${name}: unknown type "${m[1]}" (use ${TYPES.join(", ")})`,
      );
    start++;
  }
  const lines = all.slice(start);
  while (lines.length && lines[0].trim() === "") lines.shift();
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
  if (lines.length === 0) {
    problems.push(`${name}: the entry text is empty`);
  } else if (/^(?:[-*+]\s|\d+\.\s|#)/.test(lines[0])) {
    problems.push(
      `${name}: write the entry text only, without a leading "- ", "* ", a number or a "#" heading`,
    );
  }
  return { name, type, lines, problems };
}

/**
 * Read every fragment in a directory, sorted by file name. README.md and
 * dotfiles are skipped; any other file that is not .md is a problem.
 * @param {string} dir
 */
export function readFragments(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  const entries = readdirSync(dir, { withFileTypes: true })
    .filter((e) => !e.name.startsWith(".") && e.name !== "README.md")
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith(".md")) {
      out.push({
        name: e.name,
        type: DEFAULT_TYPE,
        lines: [],
        problems: [`${e.name}: fragments are single .md files`],
      });
      continue;
    }
    out.push(
      parseFragment(e.name, readFileSync(path.join(dir, e.name), "utf8")),
    );
  }
  return out;
}

/** The fragment as bullet lines: "- first", then continuation indented 2. */
function toBullet(fragment) {
  return fragment.lines.map((l, i) =>
    i === 0 ? `- ${l}` : l.trim() === "" ? "" : `  ${l}`,
  );
}

/**
 * Insert fragments into changelog text. Pure.
 * @param {string} text CHANGELOG.md content
 * @param {{type: string, lines: string[]}[]} fragments
 * @returns {string}
 */
export function insertFragments(text, fragments) {
  const lines = text.split("\n");
  const begin = lines.findIndex((l) => UNRELEASED.test(l));
  if (begin === -1) throw new Error("CHANGELOG.md has no `## [Unreleased]`");
  const endOf = () => {
    const next = lines.findIndex((l, i) => i > begin && /^## /.test(l));
    return next === -1 ? lines.length : next;
  };
  for (const type of TYPES) {
    const group = fragments.filter((f) => f.type === type);
    if (!group.length) continue;
    const block = group.flatMap(toBullet);
    const end = endOf();
    let h = -1;
    for (let i = begin + 1; i < end; i++) {
      if (lines[i] === `### ${type}`) {
        h = i;
        break;
      }
    }
    if (h === -1) {
      // Create the heading before the first later-ordered heading, else at
      // the end of the Unreleased section (before trailing blank lines).
      let at = -1;
      for (let i = begin + 1; i < end; i++) {
        const t = /^### (\w+)/.exec(lines[i]);
        if (t && TYPES.indexOf(t[1]) > TYPES.indexOf(type)) {
          at = i;
          break;
        }
      }
      if (at === -1) {
        at = end;
        while (at - 1 > begin && lines[at - 1].trim() === "") at--;
        lines.splice(at, 0, "", `### ${type}`, "", ...block);
      } else {
        lines.splice(at, 0, `### ${type}`, "", ...block, "");
      }
      continue;
    }
    if ((lines[h + 1] ?? "").trim() !== "") lines.splice(h + 1, 0, "");
    lines.splice(h + 2, 0, ...block);
    const after = lines[h + 2 + block.length];
    if (after !== undefined && after.trim() !== "" && !/^- /.test(after))
      lines.splice(h + 2 + block.length, 0, "");
  }
  return lines.join("\n");
}

/**
 * Validate and fold. Writes nothing when `check` or `dryRun` is set, and
 * nothing when any fragment is malformed.
 * @param {{dir?: string, changelog?: string, check?: boolean, dryRun?: boolean}} [opts]
 * @returns {{ok: boolean, problems: string[], folded: string[], output: string|null}}
 */
export function compile({
  dir = DEFAULT_DIR,
  changelog = DEFAULT_CHANGELOG,
  check = false,
  dryRun = false,
} = {}) {
  const fragments = readFragments(dir);
  const problems = fragments.flatMap((f) => f.problems);
  const folded = fragments.map((f) => f.name);
  if (problems.length) return { ok: false, problems, folded, output: null };
  if (check || fragments.length === 0)
    return { ok: true, problems, folded, output: null };
  if (!existsSync(changelog))
    return {
      ok: false,
      problems: [`${changelog} does not exist`],
      folded,
      output: null,
    };
  let output;
  try {
    output = insertFragments(readFileSync(changelog, "utf8"), fragments);
  } catch (err) {
    return { ok: false, problems: [err.message], folded, output: null };
  }
  if (!dryRun) {
    writeFileSync(changelog, output);
    for (const name of folded) unlinkSync(path.join(dir, name));
  }
  return { ok: true, problems, folded, output };
}

function main(argv) {
  const flag = (n) => argv.includes(n);
  const value = (n) => {
    const i = argv.indexOf(n);
    return i === -1 ? undefined : argv[i + 1];
  };
  if (flag("--help") || flag("-h")) {
    process.stdout.write(
      "Usage: changelog-compile [--check] [--dry-run] [--dir <path>] [--changelog <path>]\n",
    );
    return 0;
  }
  const check = flag("--check");
  const dryRun = flag("--dry-run");
  const result = compile({
    check,
    dryRun,
    dir: value("--dir") ? path.resolve(value("--dir")) : DEFAULT_DIR,
    changelog: value("--changelog")
      ? path.resolve(value("--changelog"))
      : DEFAULT_CHANGELOG,
  });
  if (!result.ok) {
    process.stderr.write(
      `changelog fragments rejected, nothing written:\n${result.problems
        .map((p) => `  - ${p}`)
        .join("\n")}\n`,
    );
    return 1;
  }
  const n = result.folded.length;
  if (check) {
    process.stdout.write(`changelog fragments ok: ${n} checked\n`);
  } else if (n === 0) {
    process.stdout.write("no changelog fragments to fold\n");
  } else if (dryRun) {
    process.stdout.write(
      `dry run, nothing written. Would fold ${n} fragment(s): ${result.folded.join(", ")}\n`,
    );
  } else {
    process.stdout.write(
      `folded ${n} fragment(s) into CHANGELOG.md and deleted them: ${result.folded.join(", ")}\n`,
    );
  }
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = main(process.argv.slice(2));
}
