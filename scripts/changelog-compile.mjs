#!/usr/bin/env node
/**
 * Fold changelog fragments into CHANGELOG.md (P17-67).
 *
 *   npm run changelog:compile              fold and delete the fragments
 *   npm run changelog:compile -- --dry-run print what would change, write nothing
 *   npm run changelog:compile -- --check   validate the fragments, write nothing
 *
 * Options: `--dir <path>` and `--changelog <path>` each take a value. A value
 * that is missing or starts with `--` (so `--dir --check` cannot swallow the
 * next flag) is rejected: usage on stderr, exit 2. Exit 1 means fragments were
 * rejected or a write/delete failed; exit 0 is success.
 * A pull request never edits CHANGELOG.md. It adds ONE new file under
 * changelog.d/ (unique name, so no merge conflict) and the conductor folds the
 * fragments into `## [Unreleased]` in one commit. See changelog.d/README.md.
 *
 * Fragment format: an optional first line `type: Added|Changed|Fixed|Removed|
 * Security|Docs` (default Changed), then the entry text exactly as it should
 * read inside a bullet (without the leading "- "). The entry may not start
 * with `#`, `- `, `* `, `+ ` or a number and a dot (`1. `): `#464 fixed X` is
 * rejected as a heading and must be reworded, e.g. `PR 464 fixed X`.
 *
 * Each entry is inserted at the TOP of the first `### <Type>` heading inside
 * `## [Unreleased]` (newest first, as the file already does). Within one type
 * group the entries are ordered by fragment FILE NAME (a before b), not by
 * date. A missing heading is created in the order Added, Changed, Fixed,
 * Removed, Security, Docs.
 *
 * Safety: CHANGELOG.md is written atomically (temp file in the same
 * directory, then rename) BEFORE any fragment is deleted. If a delete fails,
 * the script names the fragments that remain and exits 1. A rerun is safe: a
 * fragment whose exact bullet is already in `## [Unreleased]` under its type is
 * not inserted again, only deleted. No dependencies.
 */
import {
  existsSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
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
const REAL_IO = { writeFileSync, renameSync, unlinkSync, rmSync };

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
 * True when the fragment's exact bullet (first line and every continuation
 * line) already sits under a `### <type>` heading inside `## [Unreleased]`.
 * This is what makes a rerun after a partial delete safe. Pure.
 * @param {string} text CHANGELOG.md content
 * @param {{type: string, lines: string[]}} fragment
 */
export function isPresent(text, fragment) {
  const lines = text.split("\n");
  const begin = lines.findIndex((l) => UNRELEASED.test(l));
  if (begin === -1) return false;
  let end = lines.findIndex((l, i) => i > begin && /^## /.test(l));
  if (end === -1) end = lines.length;
  const bullet = toBullet(fragment);
  let inType = false;
  for (let i = begin + 1; i < end; i++) {
    if (/^### /.test(lines[i])) {
      inType = lines[i] === `### ${fragment.type}`;
      continue;
    }
    if (!inType || lines[i] !== bullet[0]) continue;
    if (!bullet.every((b, k) => lines[i + k] === b)) continue;
    // The existing bullet must not continue past the fragment's last line.
    let n = i + bullet.length;
    while (n < end && lines[n].trim() === "") n++;
    if (n >= end || !lines[n].startsWith("  ")) return true;
  }
  return false;
}

/**
 * Write a file atomically: temp file in the same directory, then rename, so a
 * failure leaves the original untouched and no temp file behind.
 * @param {string} file
 * @param {string} content
 * @param {typeof REAL_IO} io
 */
export function writeAtomic(file, content, io = REAL_IO) {
  const tmp = path.join(
    path.dirname(file),
    `.${path.basename(file)}.${process.pid}.tmp`,
  );
  try {
    io.writeFileSync(tmp, content);
    io.renameSync(tmp, file);
  } catch (err) {
    try {
      io.rmSync(tmp, { force: true });
    } catch {
      // the original error is the one worth reporting
    }
    throw err;
  }
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
 * nothing when any fragment is malformed. Order: write CHANGELOG.md
 * atomically, then delete fragments. A fragment already present in Unreleased
 * is not inserted again (`skipped`) but is still deleted.
 * @param {{dir?: string, changelog?: string, check?: boolean, dryRun?: boolean, io?: typeof REAL_IO}} [opts]
 * @returns {{ok: boolean, problems: string[], folded: string[], skipped: string[], remaining: string[], output: string|null}}
 */
export function compile({
  dir = DEFAULT_DIR,
  changelog = DEFAULT_CHANGELOG,
  check = false,
  dryRun = false,
  io = REAL_IO,
} = {}) {
  const fragments = readFragments(dir);
  const problems = fragments.flatMap((f) => f.problems);
  const folded = fragments.map((f) => f.name);
  const fail = (list, remaining = []) => ({
    ok: false,
    problems: list,
    folded,
    skipped: [],
    remaining,
    output: null,
  });
  if (problems.length) return fail(problems);
  if (check || fragments.length === 0)
    return {
      ok: true,
      problems,
      folded,
      skipped: [],
      remaining: [],
      output: null,
    };
  if (!existsSync(changelog)) return fail([`${changelog} does not exist`]);
  const before = readFileSync(changelog, "utf8");
  let output;
  let skipped;
  try {
    const fresh = fragments.filter((f) => !isPresent(before, f));
    skipped = fragments.filter((f) => !fresh.includes(f)).map((f) => f.name);
    output = fresh.length ? insertFragments(before, fresh) : before;
  } catch (err) {
    return fail([err.message]);
  }
  if (dryRun)
    return { ok: true, problems, folded, skipped, remaining: [], output };
  if (output !== before) {
    try {
      writeAtomic(changelog, output, io);
    } catch (err) {
      return fail(
        [
          `could not write ${changelog}: ${err.message}; nothing was deleted, fix it and rerun`,
        ],
        folded,
      );
    }
  }
  const remaining = [];
  for (const name of folded) {
    try {
      io.unlinkSync(path.join(dir, name));
    } catch (err) {
      remaining.push(name);
      problems.push(`could not delete ${name}: ${err.message}`);
    }
  }
  return {
    ok: remaining.length === 0,
    problems,
    folded,
    skipped,
    remaining,
    output,
  };
}

const USAGE =
  "Usage: changelog-compile [--check] [--dry-run] [--dir <path>] [--changelog <path>]\n";

/**
 * Parse argv. A `--dir`/`--changelog` value that is missing or starts with
 * `--` is an error.
 * @param {string[]} argv
 * @returns {{error?: string, check?: boolean, dryRun?: boolean, help?: boolean, dir?: string, changelog?: string}}
 */
export function parseArgs(argv) {
  const out = {
    help: argv.includes("--help") || argv.includes("-h"),
    check: argv.includes("--check"),
    dryRun: argv.includes("--dry-run"),
  };
  for (const name of ["--dir", "--changelog"]) {
    const i = argv.indexOf(name);
    if (i === -1) continue;
    const v = argv[i + 1];
    if (v === undefined || v.startsWith("--"))
      return { error: `${name} needs a path value` };
    out[name.slice(2)] = path.resolve(v);
  }
  return out;
}

function main(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  if (args.error) {
    process.stderr.write(`${args.error}\n${USAGE}`);
    return 2;
  }
  const { check, dryRun } = args;
  const result = compile({
    check,
    dryRun,
    dir: args.dir ?? DEFAULT_DIR,
    changelog: args.changelog ?? DEFAULT_CHANGELOG,
  });
  if (!result.ok && result.remaining.length) {
    process.stderr.write(
      `changelog fragments failed:\n${result.problems
        .map((p) => `  - ${p}`)
        .join(
          "\n",
        )}\nThese fragments remain: ${result.remaining.join(", ")}\n` +
        "Rerun after fixing; entries already in CHANGELOG.md are skipped, not duplicated.\n",
    );
    return 1;
  }
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
      `folded ${n - result.skipped.length} fragment(s) into CHANGELOG.md and deleted ${n}: ${result.folded.join(", ")}` +
        (result.skipped.length
          ? ` (${result.skipped.length} already present, not inserted again: ${result.skipped.join(", ")})`
          : "") +
        "\n",
    );
  }
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = main(process.argv.slice(2));
}
