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

const COMMAND_START = /^(?:git|gh|node|npm|npx|bash|sh)\s/;

/**
 * Command-shaped lines of a markdown file: every line inside a fenced block,
 * every line that begins with a command (after a list marker), and every
 * inline code span that begins with a command. Prose such as "never
 * force-push" is not a command and may appear in a command file.
 */
export function commandLines(text) {
  const out = [];
  let inFence = false;
  for (const raw of text.split("\n")) {
    if (/^\s*```/.test(raw)) {
      inFence = !inFence;
      continue;
    }
    const line = raw.replace(/^\s*(?:[-*]|\d+\.)\s+/, "").trim();
    if (inFence || COMMAND_START.test(line)) {
      out.push(line);
      continue;
    }
    for (const m of raw.matchAll(/`([^`\n]+)`/g)) {
      if (COMMAND_START.test(m[1])) out.push(m[1]);
    }
  }
  return out;
}

const FORBIDDEN = [
  ["a direct PR merge", /\bgh\s+pr\s+merge\b/],
  ["a merge through the API", /\bgh\s+api\b[^\n]*\/merge\b/],
  ["skipping hooks", /--no-verify\b/],
  [
    "a push to main",
    /\bgit\s+push\b[^\n]*(?:^|[\s:+])(?:refs\/heads\/)?main\b/,
  ],
  [
    "a force push",
    /\bgit\s+push\b[^\n]*(?:--force|--force-with-lease|\s-f\b|\s\+\S)/,
  ],
];

/** Names of the forbidden things a command file tells someone to run. */
export function violations(text) {
  const cmds = commandLines(text);
  return FORBIDDEN.filter(([, re]) => cmds.some((c) => re.test(c))).map(
    ([what]) => what,
  );
}

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
    expect(violations(read(name))).toEqual([]);
  });

  it("requests no model above Sonnet", () => {
    expect(read(name)).not.toMatch(/\bopus\b/i);
  });
});

describe("the forbidden-command detector", () => {
  const bad = {
    "a direct PR merge": [
      "```bash\ngh pr merge 12 --squash\n```",
      "- gh  pr  merge 12",
      "Run `gh   pr merge 12` now.",
    ],
    "a merge through the API": [
      "```bash\ngh api -X PUT repos/o/r/pulls/12/merge\n```",
    ],
    "skipping hooks": ["```bash\ngit commit --no-verify -m x\n```"],
    "a push to main": [
      "```bash\ngit push origin main\n```",
      "```bash\ngit push -u origin main\n```",
      "```bash\ngit push origin HEAD:main\n```",
      "```bash\ngit push origin HEAD:refs/heads/main\n```",
      "```bash\ngit push origin +main\n```",
    ],
    "a force push": [
      "```bash\ngit push --force origin claude/x\n```",
      "```bash\ngit push origin claude/x -f\n```",
      "```bash\ngit push --force-with-lease origin claude/x\n```",
      "```bash\ngit push origin +claude/x\n```",
    ],
  };

  for (const [what, samples] of Object.entries(bad)) {
    it(`catches ${what}`, () => {
      for (const s of samples) expect(violations(s)).toContain(what);
    });
  }

  it("allows the same words in prose and the safe forms", () => {
    const ok = [
      "Never force-push, and never merge with gh pr merge by hand.",
      "```bash\ngit push origin claude/p17-60\n```",
      "- `node scripts/merge-pr.mjs 12 --execute`",
      "Do not use --no-verify.",
    ].join("\n");
    expect(violations(ok)).toEqual([]);
  });
});

describe("/team-start", () => {
  const text = read("team-start");

  it("keeps the primary checkout on a fast-forward of main", () => {
    expect(text).toContain("git pull --ff-only");
    expect(text).toMatch(/primary checkout/i);
    expect(text).toMatch(
      /never switch branches in\s+the\s+primary\s+checkout/i,
    );
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

  it("checks a Phase 17 item is not already merged or in flight", () => {
    expect(text).toContain("git log origin/main --oneline --grep 'P17-<n>'");
    expect(text).toContain("gh pr list --state all --search 'P17-<n>'");
    expect(text).toMatch(/unticked while the work has already merged/);
  });

  it("self-merges only claude/* PRs of this repo by the team's account", () => {
    expect(text).toMatch(/head branch is `claude\/\*` in this\s+repository/);
    expect(text).toMatch(/Dependabot/);
    expect(text).toMatch(/never check out or run an unfamiliar PR branch/);
  });

  it("names RESTRICTED_PATTERNS as the authority instead of copying the list", () => {
    expect(text).toContain("RESTRICTED_PATTERNS");
    expect(text).not.toContain("docs/DECISIONS.md`");
  });

  it("cuts worktrees from origin/main and leaves a non-main primary checkout alone", () => {
    expect(text).toContain(
      "git worktree add .claude/worktrees/<name> -b claude/<short> origin/main",
    );
    expect(text).toMatch(/leave it alone/);
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

  it("/team-end has one handoff route: CHANGELOG only, shipped as a docs(handoff) PR", () => {
    const text = read("team-end");
    expect(text).toMatch(/`CHANGELOG.md` `\[Unreleased\]` and nowhere else/);
    expect(text).toContain("docs(handoff): YYYY-MM-DD");
    expect(text).toMatch(/Plan\s+items are not edited/);
    expect(text).not.toMatch(/each plan item worked on/);
  });

  it("the commands use the skill's 'Needs you' name, not needs-maintainer", () => {
    for (const name of COMMANDS) {
      expect(read(name)).not.toMatch(/needs-maintainer/);
    }
    expect(read("team-end")).toContain('"Needs you"');
    expect(read("team-digest")).toContain('"Needs you"');
  });

  it("/team-start reads the handoff block, an open handoff PR and the newest digest", () => {
    const text = read("team-start");
    expect(text).toMatch(/Latest handoff/);
    expect(text).toContain("docs(handoff) in:title");
    expect(text).toMatch(/Weekly digest/);
  });

  it("/team-digest runs growth-writer before posting, and posts once", () => {
    const text = read("team-digest");
    const draft = text.indexOf("Run `growth-writer`");
    const post = text.indexOf("gh issue create");
    expect(draft).toBeGreaterThan(-1);
    expect(post).toBeGreaterThan(draft);
    expect(text).toMatch(/Post once/);
    expect(commandLines(text).join("\n")).not.toMatch(/gh issue edit\s+\d/);
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

  it("states the same handoff route as /team-end", () => {
    const handoff = charter.slice(
      charter.indexOf("## Handoff protocol"),
      charter.indexOf("## Backlog map"),
    );
    expect(handoff).toContain("docs(handoff): YYYY-MM-DD");
    expect(handoff).toMatch(/Plan items are not edited by the note/);
    expect(handoff).not.toMatch(/both\s+`CHANGELOG/);
  });
});
