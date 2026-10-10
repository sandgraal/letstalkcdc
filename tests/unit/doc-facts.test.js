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
  "scripts/merge-pr.mjs", // lands with the conductor/merge policy PR (P17-1)
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

const frontmatter = (text) => {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  return m ? m[1] : null;
};

describe("rules and skills frontmatter", () => {
  const rulesDir = path.join(root, ".claude/rules");
  const skillsDir = path.join(root, ".claude/skills");
  const rules = fs.readdirSync(rulesDir).filter((f) => f.endsWith(".md"));
  const skills = fs
    .readdirSync(skillsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  it("has the five path-scoped rules", () => {
    expect(rules.sort()).toEqual([
      "assistant.md",
      "content.md",
      "css.md",
      "playground.md",
      "workflows.md",
    ]);
  });

  it.each(rules)(
    "rule %s has a non-empty paths: list and stays under 40 lines",
    (file) => {
      const text = fs.readFileSync(path.join(rulesDir, file), "utf8");
      const fm = frontmatter(text);
      expect(fm, "frontmatter").not.toBeNull();
      expect(fm).toMatch(/^paths:\s*\n(\s+- ".+"\n?)+$/m);
      expect(text.trimEnd().split("\n").length).toBeLessThan(40);
    },
  );

  it("has the three skills", () => {
    expect(skills.sort()).toEqual([
      "content-update",
      "new-module",
      "seo-check",
    ]);
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
