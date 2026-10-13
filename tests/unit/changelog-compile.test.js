import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  compile,
  parseFragment,
  readFragments,
  insertFragments,
  DEFAULT_DIR,
} from "../../scripts/changelog-compile.mjs";

/**
 * scripts/changelog-compile.mjs (P17-67), exercised on temp directories. The
 * last describe is the guard: every real fragment in changelog.d/ must pass
 * `--check`, so a malformed one fails the suite instead of the fold.
 */

const root = path.resolve(__dirname, "../..");
const script = path.join(root, "scripts/changelog-compile.mjs");

const CHANGELOG = `# Changelog

Intro paragraph.

## [Unreleased]

### Added

- **Old added.**
  More of old added.

### Fixed

- **Old fixed.**

### Added

- **Second added section.**

## [2.0.0] - 2026-02-06

### Added

- **Release entry.**
`;

describe("changelog-compile", () => {
  let dir;
  let fragDir;
  let changelog;

  const frag = (name, text) => fs.writeFileSync(path.join(fragDir, name), text);
  const read = () => fs.readFileSync(changelog, "utf8");
  const run = (opts = {}) => compile({ dir: fragDir, changelog, ...opts });

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "changelog-compile-"));
    fragDir = path.join(dir, "changelog.d");
    fs.mkdirSync(fragDir);
    changelog = path.join(dir, "CHANGELOG.md");
    fs.writeFileSync(changelog, CHANGELOG);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  describe("parseFragment", () => {
    it("defaults to Changed and keeps the text", () => {
      const f = parseFragment("a.md", "**Lead.** Body.\nSecond line.\n");
      expect(f.problems).toEqual([]);
      expect(f.type).toBe("Changed");
      expect(f.lines).toEqual(["**Lead.** Body.", "Second line."]);
    });

    it("reads an explicit type line, even after blank lines and with CRLF", () => {
      const f = parseFragment("a.md", "\r\ntype: Security\r\n\r\nText.\r\n");
      expect(f.problems).toEqual([]);
      expect(f.type).toBe("Security");
      expect(f.lines).toEqual(["Text."]);
    });

    it("rejects an unknown type, an empty entry and a leading bullet marker", () => {
      expect(parseFragment("a.md", "type: Nope\nText").problems[0]).toMatch(
        /a\.md: unknown type "Nope"/,
      );
      expect(parseFragment("b.md", "type: Added\n\n").problems[0]).toMatch(
        /b\.md: the entry text is empty/,
      );
      expect(parseFragment("c.md", "").problems[0]).toMatch(/empty/);
      for (const bad of ["- text", "* text", "1. text", "# Heading"]) {
        expect(parseFragment("d.md", bad).problems[0]).toMatch(
          /without a leading/,
        );
      }
    });
  });

  describe("readFragments", () => {
    it("skips README.md and dotfiles, sorts by name, flags non-.md files", () => {
      frag("README.md", "ignored");
      frag(".gitkeep", "");
      frag("b.md", "B");
      frag("a.md", "A");
      frag("notes.txt", "x");
      const found = readFragments(fragDir);
      expect(found.map((f) => f.name)).toEqual(["a.md", "b.md", "notes.txt"]);
      expect(found[2].problems[0]).toMatch(/notes\.txt: fragments are single/);
    });

    it("treats a missing directory as no fragments", () => {
      expect(readFragments(path.join(dir, "nope"))).toEqual([]);
    });
  });

  describe("heading placement", () => {
    it("puts an entry at the top of the FIRST matching heading in Unreleased", () => {
      frag("new.md", "type: Added\n\n**New.**\nSecond line.\n\nAfter gap.\n");
      const r = run();
      expect(r.ok).toBe(true);
      expect(read()).toBe(
        CHANGELOG.replace(
          "### Added\n\n- **Old added.**",
          "### Added\n\n- **New.**\n  Second line.\n\n  After gap.\n- **Old added.**",
        ),
      );
    });

    it("does not touch a same-named heading in a released version", () => {
      frag("new.md", "type: Added\n\nNew.");
      run();
      const released = read().slice(read().indexOf("## [2.0.0]"));
      expect(released).toBe(CHANGELOG.slice(CHANGELOG.indexOf("## [2.0.0]")));
    });

    it("files each fragment under its own type, in file-name order", () => {
      frag("b.md", "type: Fixed\n\nFix B.");
      frag("a.md", "type: Fixed\n\nFix A.");
      frag("c.md", "type: Added\n\nAdd C.");
      run();
      const out = read();
      expect(out).toContain(
        "### Fixed\n\n- Fix A.\n- Fix B.\n- **Old fixed.**",
      );
      expect(out).toContain("### Added\n\n- Add C.\n- **Old added.**");
    });

    it("creates a missing heading in Added, Changed, Fixed order", () => {
      frag("n.md", "Changed entry.");
      run();
      expect(read()).toContain(
        "- **Old added.**\n  More of old added.\n\n### Changed\n\n- Changed entry.\n\n### Fixed\n",
      );
    });

    it("creates a heading with no later sibling at the end of Unreleased, before the next release", () => {
      frag("n.md", "type: Security\n\nSec entry.");
      run();
      expect(read()).toContain(
        "- **Second added section.**\n\n### Security\n\n- Sec entry.\n\n## [2.0.0]",
      );
    });

    it("reports a changelog with no Unreleased section and writes nothing", () => {
      fs.writeFileSync(changelog, "# Changelog\n\n## [1.0.0]\n");
      frag("n.md", "Text.");
      const r = run();
      expect(r.ok).toBe(false);
      expect(r.problems[0]).toMatch(/no `## \[Unreleased\]`/);
      expect(fs.existsSync(path.join(fragDir, "n.md"))).toBe(true);
    });

    it("insertFragments is pure and leaves other text byte-identical", () => {
      const out = insertFragments(CHANGELOG, [
        { type: "Fixed", lines: ["Z."] },
      ]);
      expect(out.replace("- Z.\n", "")).toBe(CHANGELOG);
    });
  });

  describe("folding and idempotency", () => {
    it("deletes folded fragments and keeps README.md", () => {
      frag("README.md", "Readme");
      frag("a.md", "A.");
      const r = run();
      expect(r.folded).toEqual(["a.md"]);
      expect(fs.readdirSync(fragDir)).toEqual(["README.md"]);
    });

    it("a second run changes nothing", () => {
      frag("a.md", "type: Added\n\nA.");
      frag("b.md", "B.");
      run();
      const once = read();
      const again = run();
      expect(again.folded).toEqual([]);
      expect(again.output).toBeNull();
      expect(read()).toBe(once);
    });

    it("does not duplicate an entry when run twice on the same fragment", () => {
      frag("a.md", "Only once.");
      run();
      run();
      expect(read().split("Only once.").length - 1).toBe(1);
    });

    it("--dry-run returns the result but writes and deletes nothing", () => {
      frag("a.md", "A.");
      const r = run({ dryRun: true });
      expect(r.ok).toBe(true);
      expect(r.output).toContain("- A.");
      expect(read()).toBe(CHANGELOG);
      expect(fs.existsSync(path.join(fragDir, "a.md"))).toBe(true);
    });
  });

  describe("--check", () => {
    it("passes valid fragments without writing", () => {
      frag("a.md", "A.");
      const r = run({ check: true });
      expect(r.ok).toBe(true);
      expect(read()).toBe(CHANGELOG);
      expect(fs.existsSync(path.join(fragDir, "a.md"))).toBe(true);
    });

    it("lists every problem and a bad fragment blocks the whole fold", () => {
      frag("good.md", "Good.");
      frag("empty.md", "type: Added\n");
      frag("bad-type.md", "type: Oops\nText.");
      const checked = run({ check: true });
      expect(checked.ok).toBe(false);
      expect(checked.problems).toHaveLength(2);
      const folded = run();
      expect(folded.ok).toBe(false);
      expect(read()).toBe(CHANGELOG);
      expect(fs.readdirSync(fragDir).sort()).toEqual([
        "bad-type.md",
        "empty.md",
        "good.md",
      ]);
    });
  });

  describe("command line", () => {
    const cli = (...args) =>
      spawnSync(
        process.execPath,
        [script, "--dir", fragDir, "--changelog", changelog, ...args],
        { encoding: "utf8" },
      );

    it("exits 1 and names the file on --check with a malformed fragment", () => {
      frag("bad.md", "");
      const r = cli("--check");
      expect(r.status).toBe(1);
      expect(r.stderr).toContain("bad.md: the entry text is empty");
      expect(read()).toBe(CHANGELOG);
    });

    it("exits 0 on --check, then folds with exit 0", () => {
      frag("ok.md", "Ok.");
      expect(cli("--check").status).toBe(0);
      const r = cli();
      expect(r.status).toBe(0);
      expect(r.stdout).toContain("folded 1 fragment(s)");
      expect(read()).toContain("- Ok.");
    });
  });
});

describe("the real changelog.d/ directory", () => {
  it("has only fragments that --check accepts", () => {
    const result = compile({ dir: DEFAULT_DIR, check: true });
    expect(result.problems).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("has a README that states the rule", () => {
    const text = fs.readFileSync(path.join(DEFAULT_DIR, "README.md"), "utf8");
    expect(text).toMatch(/Never edit `CHANGELOG.md` in a feature PR/);
  });

  it.each([
    "CLAUDE.md",
    "docs/CONDUCTOR.md",
    "docs/TEAM-CHARTER.md",
    "docs/CONTRIBUTING.md",
    ".claude/commands/team-end.md",
    ".claude/skills/new-module/SKILL.md",
    ".claude/skills/content-update/SKILL.md",
    ".claude/agents/conductor.md",
    ".github/PULL_REQUEST_TEMPLATE.md",
  ])("%s tells people to add a fragment", (rel) => {
    const text = fs.readFileSync(path.join(root, rel), "utf8");
    expect(text).toContain("changelog.d/");
  });

  it("is outside Eleventy's input directory, so it is never built into the site", () => {
    const config = fs.readFileSync(
      path.join(root, "eleventy.config.mjs"),
      "utf8",
    );
    expect(config).toMatch(/input:\s*"src"/);
    expect(DEFAULT_DIR.startsWith(path.join(root, "src"))).toBe(false);
  });
});
