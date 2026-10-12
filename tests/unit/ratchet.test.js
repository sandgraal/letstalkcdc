import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { RULES } from "../../lib/thesis-lint.mjs";

/**
 * The ratchet (P17-61). Guardrails in this repo only ever get stronger:
 * the number of tests, thesis-lint rules, guard cases and hooks may grow but
 * not shrink, and the files that carry the process must stay.
 *
 * The floors live in .claude/ratchet-baseline.json, which is under
 * `.claude/**`: the merge gate (scripts/merge-pr.mjs) refuses any PR that
 * touches it, so lowering a floor is a maintainer-only change by mechanism,
 * not by convention. Raising a floor is also done by the maintainer.
 *
 * Counts are static (read from source) so this test stays fast. Each floor is
 * the measured value minus about 5%, so a normal refactor does not trip it.
 */

const root = path.resolve(__dirname, "../..");
const baseline = JSON.parse(
  fs.readFileSync(path.join(root, ".claude/ratchet-baseline.json"), "utf8"),
);

const HOW_TO_FIX =
  "Do not lower .claude/ratchet-baseline.json to make this pass. Restore what " +
  "was removed. Lowering a baseline is a maintainer-only change (the file is " +
  "under .claude/**, so scripts/merge-pr.mjs refuses a PR that touches it).";

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });

/**
 * Count test cases in a vitest source by scanning it, skipping strings,
 * template literals and comments. `it(` / `test(` count as one case;
 * `it.each([ ... ])(` counts as one per top-level row of the array. Linear
 * scan, no backtracking regex on file content.
 */
export function countCases(src) {
  const n = src.length;
  const isId = (c) => c !== undefined && /[A-Za-z0-9_$.]/.test(c);

  // Index just past the string, template or comment starting at i, or -1.
  const skipLiteral = (i) => {
    const c = src[i];
    if (c === "/" && src[i + 1] === "/") {
      const e = src.indexOf("\n", i);
      return e === -1 ? n : e + 1;
    }
    if (c === "/" && src[i + 1] === "*") {
      const e = src.indexOf("*/", i + 2);
      return e === -1 ? n : e + 2;
    }
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < n && src[j] !== c) {
        if (src[j] === "\\") j++;
        else if (c === "`" && src[j] === "$" && src[j + 1] === "{") {
          // Skip a template substitution, honouring nested braces.
          let depth = 1;
          j += 2;
          while (j < n && depth > 0) {
            const k = skipLiteral(j);
            if (k !== -1) {
              j = k;
              continue;
            }
            if (src[j] === "{") depth++;
            else if (src[j] === "}") depth--;
            j++;
          }
          continue;
        }
        j++;
      }
      return j + 1;
    }
    return -1;
  };

  // Rows in the array literal whose "[" is at i: top-level elements.
  const rowsAt = (i) => {
    let depth = 0;
    let rows = 0;
    let sawValue = false;
    for (let j = i; j < n;) {
      const k = skipLiteral(j);
      if (k !== -1) {
        if (depth === 1) sawValue = true;
        j = k;
        continue;
      }
      const c = src[j];
      if (c === "[" || c === "(" || c === "{") {
        if (depth === 1) sawValue = true;
        depth++;
      } else if (c === "]" || c === ")" || c === "}") {
        depth--;
        if (depth === 0) return rows + (sawValue ? 1 : 0);
      } else if (c === "," && depth === 1) {
        if (sawValue) rows++;
        sawValue = false;
      } else if (depth === 1 && !/\s/.test(c)) {
        sawValue = true;
      }
      j++;
    }
    return rows + (sawValue ? 1 : 0);
  };

  let cases = 0;
  for (let i = 0; i < n;) {
    const k = skipLiteral(i);
    if (k !== -1) {
      i = k;
      continue;
    }
    if (!isId(src[i - 1])) {
      const m = /^(?:it|test)(\.each\(\s*\[|\()/.exec(src.slice(i, i + 16));
      if (m) {
        if (m[1].startsWith(".each")) {
          const open = i + m[0].lastIndexOf("[");
          cases += rowsAt(open);
          i = open + 1;
        } else {
          cases += 1;
          i += m[0].length;
        }
        continue;
      }
    }
    i++;
  }
  return cases;
}

const unitDir = path.join(root, "tests/unit");
const unitFiles = walk(unitDir).filter((f) => f.endsWith(".test.js"));

describe("countCases (the counter the ratchet relies on)", () => {
  it("counts plain cases, table rows, and ignores strings and comments", () => {
    const src = [
      'it("a", () => {});',
      'test("b", () => {});',
      "it.each([",
      '  ["one", "x"],',
      '  ["two", "it(\\"not a case\\")"],',
      "  [`three ${[1, 2].join(',')}`, 3],",
      "])('row %s', () => {});",
      '// it("commented out")',
      'const s = "it(";',
      "describe('d', () => {});",
    ].join("\n");
    expect(countCases(src)).toBe(5);
  });

  it("counts an each() table with a trailing comma once per row", () => {
    expect(countCases('it.each(["a", "b",])("%s", () => {});')).toBe(2);
    expect(countCases("it.each([])('%s', () => {});")).toBe(0);
  });
});

describe("ratchet: guardrails only grow", () => {
  it("baseline file has the expected counts and nothing else", () => {
    expect(Object.keys(baseline).sort()).toEqual(
      [
        "guardBashCases",
        "hooks",
        "itCallSites",
        "requiredFiles",
        "thesisLintRules",
        "unitTestFiles",
      ].sort(),
    );
  });

  it("does not have fewer unit test files than the baseline", () => {
    expect(unitFiles.length, HOW_TO_FIX).toBeGreaterThanOrEqual(
      baseline.unitTestFiles,
    );
  });

  it("does not have fewer test cases (it call sites) than the baseline", () => {
    const total = unitFiles.reduce(
      (sum, f) => sum + countCases(fs.readFileSync(f, "utf8")),
      0,
    );
    expect(total, HOW_TO_FIX).toBeGreaterThanOrEqual(baseline.itCallSites);
  });

  it("keeps the thesis lint rules R1 and R2, and no fewer rules", () => {
    expect(Object.keys(RULES), HOW_TO_FIX).toEqual(
      expect.arrayContaining(["R1", "R2"]),
    );
    expect(Object.keys(RULES).length, HOW_TO_FIX).toBeGreaterThanOrEqual(
      baseline.thesisLintRules,
    );
  });

  it("does not have fewer guard-bash cases than the baseline", () => {
    const src = fs.readFileSync(
      path.join(unitDir, "guard-bash.test.js"),
      "utf8",
    );
    expect(countCases(src), HOW_TO_FIX).toBeGreaterThanOrEqual(
      baseline.guardBashCases,
    );
  });

  it("does not have fewer hooks than the baseline", () => {
    const hooks = fs
      .readdirSync(path.join(root, ".claude/hooks"))
      .filter((f) => f.endsWith(".mjs"));
    expect(hooks.length, HOW_TO_FIX).toBeGreaterThanOrEqual(baseline.hooks);
  });

  it.each(baseline.requiredFiles)("still has %s", (rel) => {
    expect(fs.existsSync(path.join(root, rel)), HOW_TO_FIX).toBe(true);
  });
});

describe("docs/LESSONS.md ledger", () => {
  const text = fs.readFileSync(path.join(root, "docs/LESSONS.md"), "utf8");
  const entriesAt = text.indexOf("\n## Entries\n");
  const blocks = text
    .slice(entriesAt)
    .split(/\n(?=### L-)/)
    .slice(1);
  const FIELDS = [
    "Date",
    "What happened",
    "Root cause",
    "Prevented by",
    "Status",
  ];

  it("has entries, numbered L-001 upward with no gaps or repeats", () => {
    expect(entriesAt).toBeGreaterThan(0);
    expect(blocks.length).toBeGreaterThan(0);
    const ids = blocks.map((b) => /^### (L-\d{3}) /.exec(b)?.[1]);
    expect(ids).toEqual(
      blocks.map((_, i) => `L-${String(i + 1).padStart(3, "0")}`),
    );
  });

  it.each(blocks.map((b) => [b.split("\n")[0], b]))(
    "%s has every field and a valid status",
    (_title, block) => {
      for (const field of FIELDS) {
        expect(block, `missing "${field}:"`).toMatch(
          new RegExp(`^- ${field}: \\S`, "m"),
        );
      }
      expect(block).toMatch(/^- Status: (prevented|partially|open)$/m);
    },
  );

  it("only cites repo files that exist", () => {
    const spans = [...text.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]);
    const cited = spans.filter((s) =>
      /^(docs|tests|scripts|lib|src|\.claude)\/[\w./-]+\.(md|js|mjs|cjs|json|sh|njk)$/.test(
        s,
      ),
    );
    expect(cited.length).toBeGreaterThan(0);
    const missing = cited.filter((s) => !fs.existsSync(path.join(root, s)));
    expect(missing).toEqual([]);
  });
});
