#!/usr/bin/env node
/**
 * Apply plan fragments to docs/IMPLEMENTATION-PLAN.md (P17-68).
 *
 *   npm run plan:apply              apply and delete the fragments
 *   npm run plan:apply -- --dry-run print what would change, write nothing
 *   npm run plan:apply -- --check   validate the fragments, write nothing
 *
 * Options: `--dir <path>` and `--plan <path>` each take a value. A value that
 * is missing or starts with `--` (so `--dir --check` cannot swallow the next
 * flag) is rejected: usage on stderr, exit 2. Exit 1 means fragments were
 * rejected or a write/delete failed; exit 0 is success.
 * A pull request never edits docs/IMPLEMENTATION-PLAN.md. It adds ONE new file
 * per plan item it touches under plan.d/ (unique name, so no merge conflict)
 * and the conductor applies the fragments in one commit. See plan.d/README.md.
 *
 * Fragment format, in this order:
 *
 *   item: P17-68                  the id exactly as in the plan (required)
 *   action: done | status | add   (required)
 *   phase: Phase 17               add only (required); matches `## Phase 17`
 *   section: Handoff kit          add only (optional); matches `### Handoff kit`
 *   <blank line>
 *   text...
 *
 * done    flips that item's `- [ ]` to `- [x]` and appends the text, if any, as
 *         a trailing continuation line under the item.
 * status  adds the text as an indented sub-bullet (`  - text`) under the item;
 *         nothing else in the item changes.
 * add     appends the text, which must itself start with `- [ ] ` or `- [x] `
 *         followed by `**<item id>`, as a new item at the end of the named
 *         phase (or of its `### section`). Applying it again is a no-op.
 *
 * The file name must start with the lowercase item id: `p17-68-topic.md`.
 * Fragments are applied in file-name order, each seeing the result of the
 * one before. The text of done and status may not start with `#`, `- `, `* `,
 * `+ ` or a number and a dot.
 *
 * Safety: the plan is written atomically (temp file in the same directory,
 * then rename) BEFORE any fragment is deleted. Nothing is written or deleted if
 * any fragment is rejected. If a delete fails the script names the fragments
 * that remain and exits 1. A rerun is safe: a fragment whose effect is already
 * in the plan changes nothing and is only deleted. An item id that appears
 * more than once in the plan cannot be targeted. No dependencies.
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
import { writeAtomic } from "./changelog-compile.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_DIR = path.join(root, "plan.d");
export const DEFAULT_PLAN = path.join(root, "docs/IMPLEMENTATION-PLAN.md");
export const ACTIONS = ["done", "status", "add"];
const ITEM_ID = /^P\d+-\d+$/;
const DEFAULT_INDENT = 6;
const REAL_IO = { writeFileSync, renameSync, unlinkSync, rmSync };
const BAD_START = /^(?:[-*+]\s|\d+\.\s|#)/;

/**
 * Parse one fragment.
 * @param {string} name file name, used in problem messages
 * @param {string} raw file content
 * @returns {{name: string, item: string, action: string, phase: string|null, section: string|null, lines: string[], problems: string[]}}
 */
export function parseFragment(name, raw) {
  const problems = [];
  const all = raw.replace(/\r\n?/g, "\n").split("\n");
  let i = 0;
  while (i < all.length && all[i].trim() === "") i++;
  const take = (key) => {
    const m = new RegExp(`^${key}:[ \\t]*(.*?)\\s*$`).exec(all[i] ?? "");
    if (!m) return null;
    i++;
    return m[1];
  };
  const item = take("item");
  if (item === null) problems.push(`${name}: line 1 must be "item: P17-NN"`);
  else if (!ITEM_ID.test(item))
    problems.push(`${name}: bad item id "${item}" (write it like P17-68)`);
  const action = take("action");
  if (action === null)
    problems.push(`${name}: line 2 must be "action: ${ACTIONS.join(" | ")}"`);
  else if (!ACTIONS.includes(action))
    problems.push(
      `${name}: unknown action "${action}" (use ${ACTIONS.join(", ")})`,
    );
  const phase = take("phase");
  const section = take("section");
  if (action === "add") {
    if (!phase) problems.push(`${name}: action add needs "phase: Phase 17"`);
  } else if (phase !== null || section !== null) {
    problems.push(`${name}: "phase:" and "section:" are only for action add`);
  }
  const lines = all.slice(i);
  while (lines.length && lines[0].trim() === "") lines.shift();
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
  if (action === "add") {
    const re = item && ITEM_ID.test(item) ? idRegExp(item) : null;
    if (lines.length === 0) {
      problems.push(`${name}: the text is empty`);
    } else if (!/^- \[[ x]\] /.test(lines[0])) {
      problems.push(`${name}: add text must start with "- [ ] " or "- [x] "`);
    } else if (re && !re.test(lines[0])) {
      problems.push(`${name}: the new checkbox line must begin **${item}`);
    }
  } else if (lines.length === 0) {
    if (action === "status") problems.push(`${name}: the text is empty`);
  } else if (BAD_START.test(lines[0])) {
    problems.push(
      `${name}: write the text only, without a leading "- ", "* ", a number or a "#" heading`,
    );
  }
  if (item && ITEM_ID.test(item) && !name.startsWith(`${item.toLowerCase()}-`))
    problems.push(
      `${name}: the file name must start with "${item.toLowerCase()}-"`,
    );
  return {
    name,
    item: item ?? "",
    action: action ?? "",
    phase: phase || null,
    section: section || null,
    lines,
    problems,
  };
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
        item: "",
        action: "",
        phase: null,
        section: null,
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

/** Matches a checkbox line for an item id, and not for a longer id (P17-6 vs P17-60). */
function idRegExp(id) {
  return new RegExp(`^- \\[[ x]\\] \\*\\*${id}(?![\\w-])`);
}

/** For each line, true when it sits inside a fenced code block. */
function fenceMap(lines) {
  let open = false;
  return lines.map((l) => {
    if (/^\s*(```|~~~)/.test(l)) {
      const inside = open;
      open = !open;
      return inside || open;
    }
    return open;
  });
}

/** Index one past the last line of the item that starts at `start`. */
function blockEnd(lines, start) {
  let end = start + 1;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].trim() === "") continue;
    if (!lines[i].startsWith(" ")) break;
    end = i + 1;
  }
  return end;
}

function containsRun(haystack, needle) {
  if (needle.length === 0) return true;
  for (let i = 0; i + needle.length <= haystack.length; i++) {
    if (needle.every((n, k) => haystack[i + k] === n)) return true;
  }
  return false;
}

/** A sub-bullet: "  - first", continuation indented 4. */
function asSubBullet(text) {
  return text.map((l, i) =>
    l.trim() === "" ? "" : i === 0 ? `  - ${l}` : `    ${l}`,
  );
}

function asContinuation(text, indent) {
  return text.map((l) => (l.trim() === "" ? "" : `${" ".repeat(indent)}${l}`));
}

/**
 * Apply one fragment to the plan lines. Returns the new lines (the input array
 * is never mutated) and whether anything changed, or a problem message.
 * @param {string[]} lines
 * @param {ReturnType<typeof parseFragment>} f
 * @returns {{lines: string[], changed: boolean} | {problem: string}}
 */
export function applyFragment(lines, f) {
  const fenced = fenceMap(lines);
  const re = idRegExp(f.item);
  const hits = lines.map((l, i) => (!fenced[i] && re.test(l) ? i : -1));
  const found = hits.filter((i) => i !== -1);
  if (found.length > 1)
    return {
      problem: `${f.name}: item ${f.item} appears ${found.length} times in the plan, so it cannot be targeted; make the ids unique first`,
    };

  if (f.action === "add") return applyAdd(lines, fenced, f, found[0]);

  if (found.length === 0)
    return { problem: `${f.name}: unknown item ${f.item}` };
  const start = found[0];
  const end = blockEnd(lines, start);
  const block = lines.slice(start + 1, end);
  const first = block.find((l) => l.trim() !== "");
  const lead = first ? first.length - first.trimStart().length : 0;
  const indent = lead >= 2 ? lead : DEFAULT_INDENT;
  const nested = block.some((l) => /^ {1,3}[-*+] /.test(l));
  const added =
    f.action === "status" || nested
      ? asSubBullet(f.lines)
      : asContinuation(f.lines, indent);
  let header = lines[start];
  let changed = false;
  if (f.action === "done" && header.startsWith("- [ ]")) {
    header = `- [x]${header.slice(5)}`;
    changed = true;
  }
  const insert = containsRun(block, added) ? [] : added;
  if (insert.length) changed = true;
  if (!changed) return { lines, changed: false };
  const next = lines.slice();
  next.splice(end, 0, ...insert);
  next[start] = header;
  return { lines: next, changed: true };
}

function applyAdd(lines, fenced, f, existing) {
  if (existing !== undefined) {
    // Compare the first line without its checkbox: a later `done` fragment
    // may already have flipped it, and a rerun must still be a no-op.
    if (lines[existing].slice(5) === f.lines[0].slice(5))
      return { lines, changed: false };
    return {
      problem: `${f.name}: item ${f.item} already exists in the plan with different text`,
    };
  }
  const heading = (re, from, to) => {
    const at = [];
    for (let i = from; i < to; i++)
      if (!fenced[i] && re.test(lines[i])) at.push(i);
    return at;
  };
  const word = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const phases = heading(
    new RegExp(`^## ${word(f.phase)}(?![A-Za-z0-9])`),
    0,
    lines.length,
  );
  if (phases.length !== 1)
    return {
      problem: `${f.name}: ${phases.length ? "ambiguous" : "no"} phase heading "## ${f.phase}"`,
    };
  let from = phases[0];
  let to = lines.length;
  for (let i = from + 1; i < lines.length; i++) {
    if (!fenced[i] && /^## /.test(lines[i])) {
      to = i;
      break;
    }
  }
  if (f.section) {
    const subs = heading(
      new RegExp(`^### ${word(f.section)}(?![A-Za-z0-9])`),
      from + 1,
      to,
    );
    if (subs.length !== 1)
      return {
        problem: `${f.name}: ${subs.length ? "ambiguous" : "no"} section heading "### ${f.section}" in "${f.phase}"`,
      };
    from = subs[0];
    for (let i = from + 1; i < to; i++) {
      if (!fenced[i] && /^#{1,3} /.test(lines[i])) {
        to = i;
        break;
      }
    }
  }
  let last = to - 1;
  while (last > from && lines[last].trim() === "") last--;
  const joins = /^(?:\s+\S|[-*+] |\d+\. )/.test(lines[last]);
  const block = joins ? f.lines : ["", ...f.lines];
  const next = lines.slice();
  next.splice(last + 1, 0, ...block);
  return { lines: next, changed: true };
}

/**
 * Apply all fragments in order to the plan text. Pure. Collects every problem;
 * a fragment that has a problem is skipped for the rest of the run.
 * @param {string} text plan content
 * @param {ReturnType<typeof parseFragment>[]} fragments
 * @returns {{output: string, problems: string[], applied: string[], skipped: string[]}}
 */
export function applyFragments(text, fragments) {
  let lines = text.split("\n");
  const problems = [];
  const applied = [];
  const skipped = [];
  for (const f of fragments) {
    const r = applyFragment(lines, f);
    if ("problem" in r) {
      problems.push(r.problem);
      continue;
    }
    lines = r.lines;
    (r.changed ? applied : skipped).push(f.name);
  }
  return { output: lines.join("\n"), problems, applied, skipped };
}

/**
 * Validate and apply. Writes nothing when `check` or `dryRun` is set, and
 * nothing when any fragment is rejected. Order: write the plan atomically,
 * then delete fragments. A fragment already in effect changes nothing
 * (`skipped`) but is still deleted.
 * @param {{dir?: string, plan?: string, check?: boolean, dryRun?: boolean, io?: typeof REAL_IO}} [opts]
 * @returns {{ok: boolean, problems: string[], processed: string[], applied: string[], skipped: string[], remaining: string[], output: string|null}}
 */
export function planApply({
  dir = DEFAULT_DIR,
  plan = DEFAULT_PLAN,
  check = false,
  dryRun = false,
  io = REAL_IO,
} = {}) {
  const fragments = readFragments(dir);
  const processed = fragments.map((f) => f.name);
  const result = (over) => ({
    ok: true,
    problems: [],
    processed,
    applied: [],
    skipped: [],
    remaining: [],
    output: null,
    ...over,
  });
  const parseProblems = fragments.flatMap((f) => f.problems);
  if (parseProblems.length)
    return result({ ok: false, problems: parseProblems });
  if (fragments.length === 0) return result({});
  if (!existsSync(plan))
    return result({ ok: false, problems: [`${plan} does not exist`] });
  const before = readFileSync(plan, "utf8");
  const run = applyFragments(before, fragments);
  if (run.problems.length) return result({ ok: false, problems: run.problems });
  const summary = { applied: run.applied, skipped: run.skipped };
  if (check) return result(summary);
  if (dryRun) return result({ ...summary, output: run.output });
  if (run.output !== before) {
    try {
      writeAtomic(plan, run.output, io);
    } catch (err) {
      return result({
        ok: false,
        problems: [
          `could not write ${plan}: ${err.message}; nothing was deleted, fix it and rerun`,
        ],
        remaining: processed,
      });
    }
  }
  const remaining = [];
  const problems = [];
  for (const name of processed) {
    try {
      io.unlinkSync(path.join(dir, name));
    } catch (err) {
      remaining.push(name);
      problems.push(`could not delete ${name}: ${err.message}`);
    }
  }
  return result({
    ok: remaining.length === 0,
    problems,
    ...summary,
    remaining,
    output: run.output,
  });
}

const USAGE =
  "Usage: plan-apply [--check] [--dry-run] [--dir <path>] [--plan <path>]\n";

/**
 * Parse argv. A `--dir`/`--plan` value that is missing or starts with `--` is
 * an error.
 * @param {string[]} argv
 * @returns {{error?: string, check?: boolean, dryRun?: boolean, help?: boolean, dir?: string, plan?: string}}
 */
export function parseArgs(argv) {
  const out = {
    help: argv.includes("--help") || argv.includes("-h"),
    check: argv.includes("--check"),
    dryRun: argv.includes("--dry-run"),
  };
  for (const name of ["--dir", "--plan"]) {
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
  const result = planApply({
    check,
    dryRun,
    dir: args.dir ?? DEFAULT_DIR,
    plan: args.plan ?? DEFAULT_PLAN,
  });
  const list = result.problems.map((p) => `  - ${p}`).join("\n");
  if (!result.ok && result.remaining.length) {
    process.stderr.write(
      `plan fragments failed:\n${list}\nThese fragments remain: ${result.remaining.join(", ")}\n` +
        "Rerun after fixing; changes already in the plan are skipped, not repeated.\n",
    );
    return 1;
  }
  if (!result.ok) {
    process.stderr.write(
      `plan fragments rejected, nothing written:\n${list}\n`,
    );
    return 1;
  }
  const n = result.processed.length;
  if (check) {
    process.stdout.write(`plan fragments ok: ${n} checked\n`);
  } else if (n === 0) {
    process.stdout.write("no plan fragments to apply\n");
  } else if (dryRun) {
    process.stdout.write(
      `dry run, nothing written. Would apply ${n} fragment(s): ${result.processed.join(", ")}\n`,
    );
  } else {
    process.stdout.write(
      `applied ${result.applied.length} fragment(s) to the plan and deleted ${n}: ${result.processed.join(", ")}` +
        (result.skipped.length
          ? ` (${result.skipped.length} already in effect, not repeated: ${result.skipped.join(", ")})`
          : "") +
        "\n",
    );
  }
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = main(process.argv.slice(2));
}
