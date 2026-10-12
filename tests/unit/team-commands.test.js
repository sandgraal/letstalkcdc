import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * The session commands (P17-60) are instructions the conductor follows, so
 * the rules that keep a session safe are pinned here: merges only through the
 * gate script, stop and ask instead of guessing, Sonnet and Haiku only, and
 * the primary checkout is never switched off main.
 */

const root = path.resolve(__dirname, "../..");
const dir = path.join(root, ".claude/commands");
const COMMANDS = ["team-start", "team-end", "team-digest"];
const read = (name) => fs.readFileSync(path.join(dir, `${name}.md`), "utf8");

describe.each(COMMANDS)("/%s", (name) => {
  const file = path.join(dir, `${name}.md`);

  it("exists", () => {
    expect(fs.existsSync(file)).toBe(true);
  });

  it("has a one-line description frontmatter like the other commands", () => {
    const text = read(name);
    expect(text.startsWith("---\n")).toBe(true);
    const end = text.indexOf("\n---\n", 3);
    expect(end).toBeGreaterThan(0);
    const fm = text.slice(4, end);
    expect(fm).toMatch(/^description: \S.{10,}$/m);
  });

  it("routes merges through scripts/merge-pr.mjs", () => {
    expect(read(name)).toContain("scripts/merge-pr.mjs");
  });

  it("states the stop-and-ask rule", () => {
    expect(read(name).toLowerCase()).toMatch(/stop and ask|stop-and-ask/);
  });

  it("states the Sonnet and Haiku only rule", () => {
    expect(read(name)).toMatch(/Sonnet and Haiku only/);
  });

  it("never tells anyone to merge directly, skip hooks, push to main or force-push", () => {
    const text = read(name);
    expect(text).not.toMatch(/gh pr merge/);
    expect(text).not.toMatch(/--no-verify/);
    expect(text).not.toMatch(/git push\s+(origin\s+)?(HEAD:)?main\b/);
    expect(text).not.toMatch(
      /git push\b[^\n]*(--force|--force-with-lease| -f\b)/,
    );
    expect(text).not.toMatch(/force[- ]push/i);
  });
});

describe("/team-start", () => {
  const text = read("team-start");

  it("keeps the primary checkout on a fast-forward of main", () => {
    expect(text).toContain("git pull --ff-only");
    expect(text).toMatch(/primary checkout/i);
    expect(text).toMatch(/Never switch branches in the primary checkout/);
    expect(text).toMatch(/worktrees/);
  });

  it("runs the merge script as a dry run before --execute", () => {
    const dry = text.indexOf("node scripts/merge-pr.mjs <n>\n");
    const exec = text.indexOf("--execute");
    expect(dry).toBeGreaterThan(-1);
    expect(exec).toBeGreaterThan(dry);
  });

  it("puts PR bodies in a file, not inline", () => {
    expect(text).toMatch(/--body-file/);
    expect(text).toMatch(/OS temp directory/);
  });
});

describe("/team-end and /team-digest", () => {
  it("/team-end dry-runs the worktree prune and writes Open / Blocked / Next", () => {
    const text = read("team-end");
    expect(text).toContain("bash scripts/worktree-prune.sh");
    expect(text).not.toMatch(/worktree-prune\.sh\s+--execute/);
    expect(text).toMatch(/Open[\s\S]*Blocked[\s\S]*Next/);
    expect(text).toMatch(/scribe/);
  });

  it("/team-digest follows the weekly-digest skill", () => {
    const text = read("team-digest");
    expect(text).toContain(".claude/skills/weekly-digest/SKILL.md");
    expect(
      fs.existsSync(path.join(root, ".claude/skills/weekly-digest/SKILL.md")),
    ).toBe(true);
  });
});

describe("docs/TEAM-CHARTER.md", () => {
  const charter = fs.readFileSync(
    path.join(root, "docs/TEAM-CHARTER.md"),
    "utf8",
  );

  it("names all three commands and points the Day-1 checklist at /team-start", () => {
    for (const name of COMMANDS) expect(charter).toContain(`/${name}`);
    expect(charter).toMatch(/## Running a session/);
    const day1 = charter.slice(
      charter.indexOf("## Day-1 checklist"),
      charter.indexOf("## Running a session"),
    );
    expect(day1).toContain("/team-start");
  });
});
