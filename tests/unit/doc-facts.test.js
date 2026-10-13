import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * "Documented facts must be true" (P17-4). The instruction files drifted
 * before: they said Vite 7 after the upgrade to 8, claimed branch protection
 * that did not exist, and pointed at files that were gone. These checks turn
 * the claims that can be checked by a machine into failures.
 */

const root = path.resolve(__dirname, "../..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const claude = read("CLAUDE.md");
const pkg = JSON.parse(read("package.json"));

/** Paths that are legitimately absent from a clean checkout or not yet landed. */
const GENERATED_PREFIXES = ["_site/", "dist/"];
const ALLOWED_MISSING = new Set([
  "src/assets/css/styles.min.css", // built by `npm run build:css`, git-ignored
  "styles.min.css",
  ".claude/.merge-watcher-state.json", // runtime state written by the merge watcher, git-ignored
]);
const FILE_EXT = /\.(md|mjs|cjs|js|json|yml|yaml|sh|njk|css|sha256|html)$/;

const trackedFiles = () =>
  new Set(
    execFileSync(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard"],
      { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    )
      .split("\n")
      .filter(Boolean),
  );

/** Inline backtick spans, with fenced code blocks removed first. */
export const inlineSpans = (markdown) =>
  [...markdown.replace(/```[\s\S]*?```/g, "").matchAll(/`([^`\n]+)`/g)].map(
    (m) => m[1],
  );

/** The spans that look like a repo path or file name. */
export const pathLikeSpans = (markdown) =>
  inlineSpans(markdown).filter((s) => {
    if (/[\s<>*|{}$=()]/.test(s)) return false; // commands, globs, templates
    if (/^(https?:|\/|\.\.?\/?$)/.test(s)) return false; // URLs, site routes
    return s.includes("/") || (FILE_EXT.test(s) && !/^\.[a-z0-9]+$/.test(s));
  });

describe("CLAUDE.md facts", () => {
  it("names the Vite major that package.json pins", () => {
    const pinned = String(pkg.devDependencies.vite).match(/(\d+)/)[1];
    const mentioned = [...claude.matchAll(/\bVite\s+v?(\d+)/g)].map(
      (m) => m[1],
    );
    expect(mentioned.length).toBeGreaterThan(0);
    expect(new Set(mentioned)).toEqual(new Set([pinned]));
  });

  it("README, when it names a Vite major, names the pinned one", () => {
    const pinned = String(pkg.devDependencies.vite).match(/(\d+)/)[1];
    const mentioned = [...read("README.md").matchAll(/\bVite\s+v?(\d+)/g)].map(
      (m) => m[1],
    );
    for (const major of mentioned) expect(major).toBe(pinned);
  });

  it("stays lean: at most 150 lines", () => {
    expect(claude.trimEnd().split("\n").length).toBeLessThanOrEqual(150);
  });

  it("does not mention the retired src/pages layout", () => {
    expect(claude).not.toContain("src/pages");
  });

  it("only cites repo paths that exist", () => {
    const files = trackedFiles();
    const missing = [];
    for (const span of pathLikeSpans(claude)) {
      if (ALLOWED_MISSING.has(span)) continue;
      if (GENERATED_PREFIXES.some((p) => span.startsWith(p))) continue;
      const clean = span.replace(/\/$/, "");
      const exists = span.includes("/")
        ? fs.existsSync(path.join(root, clean))
        : [...files].some((f) => path.basename(f) === clean);
      if (!exists) missing.push(span);
    }
    expect(missing).toEqual([]);
  });

  it("does not claim the main branch is protected by required checks", () => {
    expect(claude).not.toMatch(/branch-protected/i);
  });
});

describe("path-like span detector", () => {
  it("picks paths and file names, not commands or site routes", () => {
    const md = [
      "Use `docs/CONDUCTOR.md` and `main.css`, not `npm run build`.",
      "Routes like `/intro/` and `src/<topic>/` and `components/*.css` are skipped.",
      "```\n`inside/fence.md`\n```",
    ].join("\n");
    expect(pathLikeSpans(md)).toEqual(["docs/CONDUCTOR.md", "main.css"]);
  });
});

describe("CSS baseline file", () => {
  it(".claude/css-baseline.sha256 is one 64-character hex line", () => {
    const text = read(".claude/css-baseline.sha256");
    expect(text).toMatch(/^[0-9a-f]{64}\n?$/);
  });

  it("CLAUDE.md does not duplicate a hash", () => {
    expect(claude).not.toMatch(/\b[0-9a-f]{64}\b/);
  });
});

describe("agent entry points", () => {
  it("AGENTS.md is a symlink to CLAUDE.md", () => {
    const abs = path.join(root, "AGENTS.md");
    expect(fs.lstatSync(abs).isSymbolicLink()).toBe(true);
    expect(fs.readlinkSync(abs)).toBe("CLAUDE.md");
  });

  it.each([
    ".github/copilot-instructions.md",
    ".chatgpt-context.yml",
    ".github/instructions/codacy.instructions.md",
    "playground/ai/AGENTS.md",
  ])("retired file %s stays deleted", (rel) => {
    expect(fs.existsSync(path.join(root, rel))).toBe(false);
  });

  it("no tracked file points at a retired instruction file", () => {
    const retired = [
      ".github/copilot-instructions.md",
      "codacy.instructions.md",
      "playground/ai/AGENTS.md",
    ];
    // Historical records are allowed to name them.
    const exempt = (f) =>
      f === "CHANGELOG.md" ||
      f === "docs/IMPLEMENTATION-PLAN.md" ||
      f.startsWith("docs/archive/") ||
      f === "tests/unit/doc-facts.test.js";
    const offenders = [];
    for (const f of trackedFiles()) {
      if (exempt(f) || !/\.(md|mjs|cjs|js|json|yml|yaml|sh|njk)$/.test(f))
        continue;
      const abs = path.join(root, f);
      if (!fs.existsSync(abs) || fs.statSync(abs).size > 1_000_000) continue;
      const text = fs.readFileSync(abs, "utf8");
      if (retired.some((r) => text.includes(r))) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });
});

// Linear scans only (indexOf / split): no backtracking-prone regexes on
// file content, so adversarial input cannot trigger ReDoS.
const frontmatter = (text) => {
  if (!text.startsWith("---\n")) return null;
  const end = text.indexOf("\n---\n", 3);
  return end === -1 ? null : text.slice(4, end);
};

// Returns the quoted globs listed under `paths:`, or [] when there is none.
// A list item is an indented `- "glob"` line; the list stops at the first
// line that is not one.
const frontmatterPaths = (fm) => {
  const lines = fm.split("\n");
  const start = lines.findIndex((l) => l.trimEnd() === "paths:");
  if (start === -1) return [];
  const globs = [];
  for (const line of lines.slice(start + 1)) {
    const item = line.trimStart();
    const indented = item.length < line.length;
    if (!indented || !item.startsWith('- "') || !item.endsWith('"')) break;
    if (item.length < 5) break; // needs at least one glob character
    globs.push(item.slice(3, -1));
  }
  return globs;
};

describe("rules and skills frontmatter", () => {
  const rulesDir = path.join(root, ".claude/rules");
  const skillsDir = path.join(root, ".claude/skills");
  const rules = fs.readdirSync(rulesDir).filter((f) => f.endsWith(".md"));
  const skills = fs
    .readdirSync(skillsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const EXPECTED_RULES = [
    "assistant.md",
    "content.md",
    "css.md",
    "playground.md",
    "workflows.md",
  ];
  const EXPECTED_SKILLS = ["content-update", "new-module", "seo-check"];

  it("still has the five original path-scoped rules (more are allowed)", () => {
    expect(rules).toEqual(expect.arrayContaining(EXPECTED_RULES));
    expect(rules.length).toBeGreaterThanOrEqual(EXPECTED_RULES.length);
  });

  it.each(rules)(
    "rule %s has a non-empty paths: list and stays under 80 lines",
    (file) => {
      const text = fs.readFileSync(path.join(rulesDir, file), "utf8");
      const fm = frontmatter(text);
      expect(fm, "frontmatter").not.toBeNull();
      expect(frontmatterPaths(fm).length).toBeGreaterThan(0);
      expect(text.trimEnd().split("\n").length).toBeLessThan(80);
    },
  );

  it("parses a 200 KB adversarial paths: block in under a second", () => {
    const fm = `paths:${'\n  - "a"'.repeat(25_000)}\n  - "a" - "`;
    expect(fm.length).toBeGreaterThan(200_000);
    const started = performance.now();
    const globs = frontmatterPaths(fm);
    expect(performance.now() - started).toBeLessThan(1000);
    expect(globs).toHaveLength(25_001);
    expect(frontmatterPaths("paths:\n")).toEqual([]);
    expect(frontmatterPaths('name: x\n  - "a"')).toEqual([]);
  });

  it("still has the three original skills (more are allowed)", () => {
    expect(skills).toEqual(expect.arrayContaining(EXPECTED_SKILLS));
    expect(skills.length).toBeGreaterThanOrEqual(EXPECTED_SKILLS.length);
  });

  it.each(skills)(
    "skill %s has name and description matching its directory",
    (dir) => {
      const fm = frontmatter(
        fs.readFileSync(path.join(skillsDir, dir, "SKILL.md"), "utf8"),
      );
      expect(fm, "frontmatter").not.toBeNull();
      expect(fm).toMatch(new RegExp(`^name: ${dir}$`, "m"));
      expect(fm).toMatch(/^description: \S.{20,}$/m);
    },
  );
});

/**
 * Time-relative wording (L-004, P17-62 c). "Not on main yet" is true only
 * while it is written; within hours it is a lie. State timeless facts instead.
 * The two allowlisted files hold dated history: the plan's dated status notes
 * and the append-only ledger, which quotes the phrases it describes.
 */
export const TIME_RELATIVE =
  /not on `?main`? yet|until (this|the|its) PR (merges|is merged|lands)|until it merges|once this PR (merges|lands)|not merged yet|waiting for (its|the|this) PR/i;
const TIME_RELATIVE_ALLOWED = new Set([
  "docs/IMPLEMENTATION-PLAN.md",
  "docs/LESSONS.md",
]);

describe("time-relative wording", () => {
  it("detects the phrases and ignores timeless wording", () => {
    expect(TIME_RELATIVE.test("The file is not on main yet.")).toBe(true);
    expect(TIME_RELATIVE.test("Stays open until this PR merges")).toBe(true);
    expect(TIME_RELATIVE.test("The merge gate refuses a red PR.")).toBe(false);
  });

  it("is absent from tracked Markdown outside the allowlist", () => {
    const offenders = [...trackedFiles()]
      .filter(
        (f) =>
          f.endsWith(".md") &&
          !f.startsWith("docs/archive/") &&
          !f.startsWith("node_modules/") &&
          f !== "CHANGELOG.md" &&
          !TIME_RELATIVE_ALLOWED.has(f) &&
          fs.existsSync(path.join(root, f)),
      )
      .filter((f) => TIME_RELATIVE.test(read(f)));
    expect(offenders).toEqual([]);
  });
});
