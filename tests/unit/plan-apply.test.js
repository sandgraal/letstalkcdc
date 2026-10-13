import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  planApply,
  parseFragment,
  readFragments,
  applyFragment,
  applyFragments,
  parseArgs,
  DEFAULT_DIR,
} from "../../scripts/plan-apply.mjs";

/**
 * scripts/plan-apply.mjs (P17-68), exercised on temp directories. The last
 * describe is the guard: every real fragment in plan.d/ must pass `--check`,
 * so a malformed one fails the suite instead of the apply.
 */

const root = path.resolve(__dirname, "../..");
const script = path.join(root, "scripts/plan-apply.mjs");

const PLAN = `# Plan

## Phase 16 — Growth

- [ ] **P16-1 · Sixteen.** Outcome.

## Phase 17 — Handoff kit

Intro paragraph.

### Handoff kit

- [ ] **P17-6 · Six.** Outcome: a short
      outcome over two lines. Needs: none.
      _Status: not started._
- [ ] **P17-60 · Sixty.** Outcome: sixty.
      Size: S.
- [x] **P17-61 · Done already.** Outcome. One line.
- [ ] **P17-62 · One liner.** Outcome on a single line.

### Autopsy

- [ ] **P17-70 · Seventy.** Outcome.
      Size: M.
  - existing sub-bullet

### Parked for the maintainer

Some prose here.

- Plain bullet, not a checkbox.

## Phase 170 — A different phase

- [ ] **P170-1 · Not 17.** Outcome.

## Dups

- [ ] **P99-1 · First.** a
- [x] **P99-1 · Second.** b

\`\`\`md
- [ ] **P98-1 · Inside a fence.** not an item
\`\`\`
`;

describe("plan-apply", () => {
  let dir;
  let fragDir;
  let plan;

  const frag = (name, text) => fs.writeFileSync(path.join(fragDir, name), text);
  const read = () => fs.readFileSync(plan, "utf8");
  const run = (opts = {}) => planApply({ dir: fragDir, plan, ...opts });

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "plan-apply-"));
    fragDir = path.join(dir, "plan.d");
    fs.mkdirSync(fragDir);
    plan = path.join(dir, "PLAN.md");
    fs.writeFileSync(plan, PLAN);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  describe("parseFragment", () => {
    it("reads item, action and text, even after blank lines and with CRLF", () => {
      const f = parseFragment(
        "p17-6-x.md",
        "\r\nitem: P17-6\r\naction: done\r\n\r\nShipped.\r\n",
      );
      expect(f.problems).toEqual([]);
      expect(f).toMatchObject({
        item: "P17-6",
        action: "done",
        phase: null,
        lines: ["Shipped."],
      });
    });

    it("allows done without text but not status", () => {
      expect(
        parseFragment("p17-6-x.md", "item: P17-6\naction: done\n").problems,
      ).toEqual([]);
      expect(
        parseFragment("p17-6-x.md", "item: P17-6\naction: status\n")
          .problems[0],
      ).toMatch(/the text is empty/);
    });

    it("rejects a missing or malformed item and action line", () => {
      expect(parseFragment("a.md", "action: done").problems[0]).toMatch(
        /line 1 must be "item: P17-NN"/,
      );
      expect(
        parseFragment("a.md", "item: 17-6\naction: done").problems[0],
      ).toMatch(/bad item id "17-6"/);
      expect(parseFragment("p17-6-a.md", "item: P17-6\n").problems[0]).toMatch(
        /line 2 must be "action:/,
      );
      expect(
        parseFragment("p17-6-a.md", "item: P17-6\naction: nope\nx").problems[0],
      ).toMatch(/unknown action "nope"/);
    });

    it("requires the file name to start with the lowercase item id", () => {
      expect(
        parseFragment("other.md", "item: P17-6\naction: done").problems[0],
      ).toMatch(/must start with "p17-6-"/);
      expect(
        parseFragment("p17-60-x.md", "item: P17-6\naction: done").problems[0],
      ).toMatch(/must start with "p17-6-"/);
    });

    it("rejects a leading bullet marker, number or heading in done and status text", () => {
      for (const bad of ["- text", "* text", "+ text", "1. text", "# Head"]) {
        expect(
          parseFragment("p17-6-a.md", `item: P17-6\naction: status\n\n${bad}`)
            .problems[0],
        ).toMatch(/without a leading/);
      }
    });

    it("keeps phase and section lines to add and validates add text", () => {
      expect(
        parseFragment("p17-6-a.md", "item: P17-6\naction: done\nphase: X\n\nt")
          .problems[0],
      ).toMatch(/only for action add/);
      const noPhase = parseFragment(
        "p17-9-a.md",
        "item: P17-9\naction: add\n\n- [ ] **P17-9 · T.**",
      );
      expect(noPhase.problems[0]).toMatch(/needs "phase: Phase 17"/);
      const ok = parseFragment(
        "p17-9-a.md",
        "item: P17-9\naction: add\nphase: Phase 17\nsection: Handoff kit\n\n- [ ] **P17-9 · T.**",
      );
      expect(ok.problems).toEqual([]);
      expect(ok.section).toBe("Handoff kit");
      const bare = (text) =>
        parseFragment(
          "p17-9-a.md",
          `item: P17-9\naction: add\nphase: Phase 17\n\n${text}`,
        ).problems[0];
      expect(bare("just text")).toMatch(/must start with "- \[ \] "/);
      expect(bare("- [ ] **P17-8 · Other id.**")).toMatch(
        /must begin \*\*P17-9/,
      );
      expect(bare("- [ ] **P17-99 · Prefix of the id.**")).toMatch(
        /must begin \*\*P17-9/,
      );
    });
  });

  describe("readFragments", () => {
    it("skips README.md and dotfiles, sorts by name, flags non-.md files", () => {
      frag("README.md", "ignored");
      frag(".gitkeep", "");
      frag("p17-6-b.md", "item: P17-6\naction: done");
      frag("p17-6-a.md", "item: P17-6\naction: done");
      frag("notes.txt", "x");
      const found = readFragments(fragDir);
      expect(found.map((f) => f.name)).toEqual([
        "notes.txt",
        "p17-6-a.md",
        "p17-6-b.md",
      ]);
      expect(found[0].problems[0]).toMatch(/notes\.txt: fragments are single/);
    });

    it("treats a missing directory as no fragments", () => {
      expect(readFragments(path.join(dir, "nope"))).toEqual([]);
    });
  });

  describe("action: done", () => {
    it("flips only the named item's checkbox and changes nothing else", () => {
      frag("p17-6-x.md", "item: P17-6\naction: done\n");
      const r = run();
      expect(r.ok).toBe(true);
      expect(read()).toBe(
        PLAN.replace("- [ ] **P17-6 · Six.**", "- [x] **P17-6 · Six.**"),
      );
    });

    it("matches P17-6 exactly, never P17-60 or P170-1", () => {
      frag("p17-60-x.md", "item: P17-60\naction: done\n");
      run();
      const out = read();
      expect(out).toContain("- [x] **P17-60 · Sixty.**");
      expect(out).toContain("- [ ] **P17-6 · Six.**");
      expect(out).toContain("- [ ] **P170-1 · Not 17.**");
    });

    it("appends the text after the last line of a multi-line item, at the item's indent", () => {
      frag("p17-6-x.md", "item: P17-6\naction: done\n\nShipped in #500.\n");
      run();
      expect(read()).toContain(
        "- [x] **P17-6 · Six.** Outcome: a short\n      outcome over two lines. Needs: none.\n      _Status: not started._\n      Shipped in #500.\n- [ ] **P17-60",
      );
    });

    it("appends under a one-line item with the default indent", () => {
      frag("p17-62-x.md", "item: P17-62\naction: done\n\nShipped.\nTwo lines.");
      run();
      expect(read()).toContain(
        "- [x] **P17-62 · One liner.** Outcome on a single line.\n      Shipped.\n      Two lines.\n\n### Autopsy",
      );
    });

    it("uses a sub-bullet when the item already has a nested list", () => {
      frag("p17-70-x.md", "item: P17-70\naction: done\n\nShipped.");
      run();
      expect(read()).toContain(
        "  - existing sub-bullet\n  - Shipped.\n\n### Parked",
      );
    });

    it("keeps an already-checked item checked and does not add text twice", () => {
      frag("p17-61-x.md", "item: P17-61\naction: done\n\nNote.");
      run();
      const once = read();
      expect(once).toContain(
        "- [x] **P17-61 · Done already.** Outcome. One line.\n      Note.\n",
      );
      frag("p17-61-x.md", "item: P17-61\naction: done\n\nNote.");
      const again = run();
      expect(again.skipped).toEqual(["p17-61-x.md"]);
      expect(read()).toBe(once);
    });

    it("an already-checked item with no text is a no-op", () => {
      frag("p17-61-x.md", "item: P17-61\naction: done\n");
      const r = run();
      expect(r.ok).toBe(true);
      expect(r.skipped).toEqual(["p17-61-x.md"]);
      expect(read()).toBe(PLAN);
    });
  });

  describe("action: status", () => {
    it("adds an indented sub-bullet after the item's last line and leaves the box alone", () => {
      frag(
        "p17-6-x.md",
        "item: P17-6\naction: status\n\n2026-10-13: in review.\nSecond line.\n",
      );
      run();
      expect(read()).toBe(
        PLAN.replace(
          "      _Status: not started._\n",
          "      _Status: not started._\n  - 2026-10-13: in review.\n    Second line.\n",
        ),
      );
    });

    it("lands directly under the item, before the next item and not under a neighbour", () => {
      frag("p17-60-x.md", "item: P17-60\naction: status\n\nNote.");
      run();
      expect(read()).toContain("      Size: S.\n  - Note.\n- [x] **P17-61");
    });

    it("is a real nested list item that survives a markdown round trip", async () => {
      // An indent of six would merge into the paragraph (found with prettier).
      const prettier = await import("prettier");
      frag("p17-6-x.md", "item: P17-6\naction: status\n\nNote.");
      run();
      const out = read();
      expect(await prettier.format(out, { parser: "markdown" })).toContain(
        "  - Note.",
      );
    });

    it("a second application does not add the bullet again", () => {
      frag("p17-6-x.md", "item: P17-6\naction: status\n\nNote.");
      run();
      const once = read();
      frag("p17-6-x.md", "item: P17-6\naction: status\n\nNote.");
      const again = run();
      expect(again.skipped).toEqual(["p17-6-x.md"]);
      expect(again.applied).toEqual([]);
      expect(read()).toBe(once);
      expect(read().split("  - Note.").length - 1).toBe(1);
    });
  });

  describe("action: add", () => {
    const add = (extra = "", text = "- [ ] **P17-80 · Eighty.** Outcome.") =>
      `item: P17-80\naction: add\nphase: Phase 17\n${extra}\n${text}\n`;

    it("appends at the end of a phase, matching Phase 17 and not Phase 170", () => {
      frag("p17-80-x.md", add());
      expect(run().ok).toBe(true);
      expect(read()).toContain(
        "- Plain bullet, not a checkbox.\n- [ ] **P17-80 · Eighty.** Outcome.\n\n## Phase 170",
      );
    });

    it("appends at the end of a named section", () => {
      frag("p17-80-x.md", add("section: Handoff kit\n"));
      run();
      expect(read()).toContain(
        "- [ ] **P17-62 · One liner.** Outcome on a single line.\n- [ ] **P17-80 · Eighty.** Outcome.\n\n### Autopsy",
      );
    });

    it("puts a blank line first when the section ends in prose", () => {
      fs.writeFileSync(
        plan,
        "## Phase 17\n\n### S\n\nJust prose.\n\n## Next\n",
      );
      frag("p17-80-x.md", add("section: S\n"));
      run();
      expect(read()).toBe(
        "## Phase 17\n\n### S\n\nJust prose.\n\n- [ ] **P17-80 · Eighty.** Outcome.\n\n## Next\n",
      );
    });

    it("keeps continuation lines and reports a missing phase or section", () => {
      frag(
        "p17-80-x.md",
        add("", "- [ ] **P17-80 · Eighty.** Outcome.\n      Size: S."),
      );
      run();
      expect(read()).toContain(
        "- [ ] **P17-80 · Eighty.** Outcome.\n      Size: S.\n\n## Phase 170",
      );
      frag(
        "p17-81-x.md",
        "item: P17-81\naction: add\nphase: Phase 99\n\n- [ ] **P17-81 · X.**",
      );
      const r1 = run({ check: true });
      expect(r1.problems[0]).toMatch(/no phase heading "## Phase 99"/);
      frag(
        "p17-81-x.md",
        "item: P17-81\naction: add\nphase: Phase 17\nsection: Nope\n\n- [ ] **P17-81 · X.**",
      );
      expect(run({ check: true }).problems[0]).toMatch(
        /no section heading "### Nope" in "Phase 17"/,
      );
    });

    it("is a no-op the second time, even after a later done flipped the box", () => {
      frag("p17-80-x.md", add());
      frag("p17-80-y.md", "item: P17-80\naction: done\n");
      const first = run();
      expect(first.applied).toEqual(["p17-80-x.md", "p17-80-y.md"]);
      expect(read()).toContain("- [x] **P17-80 · Eighty.** Outcome.");
      const once = read();
      frag("p17-80-x.md", add());
      frag("p17-80-y.md", "item: P17-80\naction: done\n");
      const again = run();
      expect(again.ok).toBe(true);
      expect(again.skipped).toEqual(["p17-80-x.md", "p17-80-y.md"]);
      expect(read()).toBe(once);
    });
  });

  describe("unknown and ambiguous items", () => {
    it("reports an unknown item and writes and deletes nothing", () => {
      frag("p17-62-ok.md", "item: P17-62\naction: done\n");
      frag("p17-999-x.md", "item: P17-999\naction: done\n");
      const r = run();
      expect(r.ok).toBe(false);
      expect(r.problems).toEqual(["p17-999-x.md: unknown item P17-999"]);
      expect(read()).toBe(PLAN);
      expect(fs.readdirSync(fragDir).sort()).toEqual([
        "p17-62-ok.md",
        "p17-999-x.md",
      ]);
    });

    it("refuses an item id that occurs twice in the plan", () => {
      frag("p99-1-x.md", "item: P99-1\naction: done\n");
      const r = run({ check: true });
      expect(r.problems[0]).toMatch(/P99-1 appears 2 times/);
    });

    it("ignores a checkbox line inside a code fence", () => {
      frag("p98-1-x.md", "item: P98-1\naction: done\n");
      expect(run({ check: true }).problems[0]).toMatch(/unknown item P98-1/);
    });

    it("applyFragment never mutates its input", () => {
      const lines = PLAN.split("\n");
      const copy = lines.slice();
      const f = parseFragment("p17-6-x.md", "item: P17-6\naction: done\n\nN.");
      const r = applyFragment(lines, f);
      expect(r.changed).toBe(true);
      expect(lines).toEqual(copy);
    });
  });

  describe("applying and idempotency", () => {
    it("deletes applied fragments and keeps README.md", () => {
      frag("README.md", "Readme");
      frag("p17-6-a.md", "item: P17-6\naction: done");
      const r = run();
      expect(r.processed).toEqual(["p17-6-a.md"]);
      expect(fs.readdirSync(fragDir)).toEqual(["README.md"]);
    });

    it("applies in file-name order, each fragment seeing the one before", () => {
      frag("p17-6-b.md", "item: P17-6\naction: status\n\nB.");
      frag("p17-6-a.md", "item: P17-6\naction: status\n\nA.");
      run();
      expect(read()).toContain("_Status: not started._\n  - A.\n  - B.\n");
    });

    it("a second run changes nothing", () => {
      frag("p17-6-a.md", "item: P17-6\naction: done\n\nShipped.");
      run();
      const once = read();
      const again = run();
      expect(again.processed).toEqual([]);
      expect(again.output).toBeNull();
      expect(read()).toBe(once);
    });

    it("writes the plan before deleting any fragment", () => {
      frag("p17-6-a.md", "item: P17-6\naction: done");
      frag("p17-62-a.md", "item: P17-62\naction: done");
      const calls = [];
      run({
        io: {
          ...fs,
          renameSync: (...a) => (calls.push("rename"), fs.renameSync(...a)),
          unlinkSync: (...a) => (calls.push("unlink"), fs.unlinkSync(...a)),
        },
      });
      expect(calls).toEqual(["rename", "unlink", "unlink"]);
    });

    it("keeps every fragment and the old plan when the write fails", () => {
      frag("p17-6-a.md", "item: P17-6\naction: done");
      const r = run({
        io: {
          ...fs,
          renameSync: () => {
            throw new Error("disk full");
          },
        },
      });
      expect(r.ok).toBe(false);
      expect(r.problems[0]).toMatch(/could not write .*disk full/);
      expect(read()).toBe(PLAN);
      expect(fs.existsSync(path.join(fragDir, "p17-6-a.md"))).toBe(true);
      expect(fs.readdirSync(dir).sort()).toEqual(["PLAN.md", "plan.d"]);
    });

    it("reports the fragments that remain when a delete fails, then a rerun does not repeat", () => {
      frag("p17-6-a.md", "item: P17-6\naction: done\n\nNote A.");
      frag("p17-62-b.md", "item: P17-62\naction: status\n\nNote B.");
      const first = run({
        io: {
          ...fs,
          unlinkSync: (f) => {
            if (f.endsWith("p17-62-b.md")) throw new Error("EPERM");
            fs.unlinkSync(f);
          },
        },
      });
      expect(first.ok).toBe(false);
      expect(first.remaining).toEqual(["p17-62-b.md"]);
      expect(first.problems[0]).toMatch(/could not delete p17-62-b\.md: EPERM/);
      expect(fs.readdirSync(fragDir)).toEqual(["p17-62-b.md"]);
      const afterFirst = read();
      const again = run();
      expect(again.ok).toBe(true);
      expect(again.skipped).toEqual(["p17-62-b.md"]);
      expect(read()).toBe(afterFirst);
      expect(read().split("Note B.").length - 1).toBe(1);
      expect(fs.readdirSync(fragDir)).toEqual([]);
    });

    it("--dry-run returns the result but writes and deletes nothing", () => {
      frag("p17-6-a.md", "item: P17-6\naction: done");
      const r = run({ dryRun: true });
      expect(r.ok).toBe(true);
      expect(r.output).toContain("- [x] **P17-6 ");
      expect(read()).toBe(PLAN);
      expect(fs.existsSync(path.join(fragDir, "p17-6-a.md"))).toBe(true);
    });

    it("applyFragments collects every problem and keeps applying the good ones in memory", () => {
      const out = applyFragments(PLAN, [
        parseFragment("p17-1-a.md", "item: P17-1\naction: done"),
        parseFragment("p17-6-a.md", "item: P17-6\naction: done"),
        parseFragment("p17-2-a.md", "item: P17-2\naction: done"),
      ]);
      expect(out.problems).toHaveLength(2);
      expect(out.applied).toEqual(["p17-6-a.md"]);
    });
  });

  describe("--check", () => {
    it("passes valid fragments without writing", () => {
      frag("p17-6-a.md", "item: P17-6\naction: done");
      const r = run({ check: true });
      expect(r.ok).toBe(true);
      expect(read()).toBe(PLAN);
      expect(fs.existsSync(path.join(fragDir, "p17-6-a.md"))).toBe(true);
    });

    it("lists every problem and a bad fragment blocks the whole apply", () => {
      frag("p17-6-good.md", "item: P17-6\naction: done");
      frag("p17-62-bad.md", "item: P17-62\naction: nope");
      frag("p17-70-bad.md", "item: P17-70\naction: status\n");
      const checked = run({ check: true });
      expect(checked.ok).toBe(false);
      expect(checked.problems).toHaveLength(2);
      const applied = run();
      expect(applied.ok).toBe(false);
      expect(read()).toBe(PLAN);
      expect(fs.readdirSync(fragDir)).toHaveLength(3);
    });

    it("reports a missing plan file", () => {
      fs.rmSync(plan);
      frag("p17-6-a.md", "item: P17-6\naction: done");
      expect(run().problems[0]).toMatch(/does not exist/);
    });
  });

  describe("command line", () => {
    const cli = (...args) =>
      spawnSync(
        process.execPath,
        [script, "--dir", fragDir, "--plan", plan, ...args],
        { encoding: "utf8" },
      );

    it("exits 1 and names the file on --check with an unknown item", () => {
      frag("p17-999-a.md", "item: P17-999\naction: done");
      const r = cli("--check");
      expect(r.status).toBe(1);
      expect(r.stderr).toContain("p17-999-a.md: unknown item P17-999");
      expect(read()).toBe(PLAN);
    });

    it("exits 2 with usage when --dir or --plan is followed by another flag or nothing", () => {
      const raw = (...args) =>
        spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
      for (const args of [
        ["--dir", "--check"],
        ["--plan", "--dry-run", "--dir", fragDir],
        ["--dir", fragDir, "--plan"],
      ]) {
        const r = raw(...args);
        expect(r.status).toBe(2);
        expect(r.stderr).toMatch(/needs a path value/);
        expect(r.stderr).toContain("Usage: plan-apply");
      }
      expect(parseArgs(["--dir", "--check"]).error).toMatch(/--dir/);
      expect(parseArgs(["--dir", "x", "--check"]).error).toBeUndefined();
    });

    it("exits 1 and names the remaining fragments when a delete fails", () => {
      frag("p17-6-a.md", "item: P17-6\naction: done");
      fs.chmodSync(fragDir, 0o555);
      try {
        // Root ignores directory permissions; skip the assertion there.
        if (process.getuid?.() === 0) return;
        const r = cli();
        expect(r.status).toBe(1);
        expect(r.stderr).toContain("These fragments remain: p17-6-a.md");
        expect(read()).toContain("- [x] **P17-6 ");
      } finally {
        fs.chmodSync(fragDir, 0o755);
      }
    });

    it("exits 0 on --check, then applies with exit 0", () => {
      frag("p17-6-a.md", "item: P17-6\naction: done");
      expect(cli("--check").status).toBe(0);
      const r = cli();
      expect(r.status).toBe(0);
      expect(r.stdout).toContain("applied 1 fragment(s)");
      expect(read()).toContain("- [x] **P17-6 ");
      expect(cli().stdout).toContain("no plan fragments to apply");
    });
  });
});

describe("the real plan.d/ directory", () => {
  it("has only fragments that --check accepts against the real plan", () => {
    const result = planApply({ dir: DEFAULT_DIR, check: true });
    expect(result.problems).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("has a README that states the rule", () => {
    const text = fs.readFileSync(path.join(DEFAULT_DIR, "README.md"), "utf8");
    expect(text).toMatch(
      /Never edit `docs\/IMPLEMENTATION-PLAN.md` in a feature PR/,
    );
  });

  it("the real plan has no id the fragments could not target, except the known duplicate", () => {
    const text = fs.readFileSync(
      path.join(root, "docs/IMPLEMENTATION-PLAN.md"),
      "utf8",
    );
    const ids = [...text.matchAll(/^- \[[ x]\] \*\*(P\d+-\d+)(?![\w-])/gm)].map(
      (m) => m[1],
    );
    const dupes = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
    // P17-59 is duplicated in the plan today (P17-68 does not rewrite plan
    // content). A new duplicate would make that id impossible to target.
    expect(dupes.filter((id) => id !== "P17-59")).toEqual([]);
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
    ".claude/agents/scribe.md",
    ".github/PULL_REQUEST_TEMPLATE.md",
  ])("%s tells people to add a plan fragment", (rel) => {
    const text = fs.readFileSync(path.join(root, rel), "utf8");
    expect(text).toContain("plan.d/");
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
