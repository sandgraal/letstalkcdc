import { execFileSync } from "node:child_process";
import { EventEmitter } from "node:events";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  PR_FIELDS,
  RECHECK_FIELDS,
  RESTRICTED_PATTERNS,
  checkAuditTrail,
  checkChecks,
  checkFiles,
  checkReviewRecord,
  checkState,
  defaultRunner,
  installSignalHandlers,
  main,
  parsePrNumber,
  registerCleanup,
  restrictedPatternFor,
  runPendingCleanups,
} from "../../scripts/merge-pr.mjs";

const OID = "a".repeat(40);
const TMP = "/tmp/merge-pr-test-worktree";

const GOOD_BODY = [
  "## Summary",
  "Does a thing.",
  "",
  "## Review record",
  "Reviewer: reviewer (sonnet)",
  "Verdict: APPROVE",
  "Findings resolved: yes",
  "Verified: npm run verify-all, 0 failures",
  "",
  "## Notes",
  "none",
].join("\n");

const GOOD_COMMENT = {
  author: { login: "someone" },
  body: [
    "## Review of PR 7",
    "Reviewer: reviewer (sonnet)",
    "Verdict: APPROVE",
    "Findings resolved: yes",
    "I read the diff, ran the unit suite and exercised the new gate by hand.",
    "No blocking findings; two nits were fixed in the follow-up commit.",
  ].join("\n"),
};

function greenPr(overrides = {}) {
  return {
    number: 7,
    state: "OPEN",
    isDraft: false,
    baseRefName: "main",
    headRefName: "claude/example",
    headRefOid: OID,
    mergeable: "MERGEABLE",
    reviewDecision: "",
    mergeStateStatus: "CLEAN",
    statusCheckRollup: [
      {
        __typename: "CheckRun",
        name: "build",
        status: "COMPLETED",
        conclusion: "SUCCESS",
      },
      {
        __typename: "CheckRun",
        name: "docs",
        status: "COMPLETED",
        conclusion: "SKIPPED",
      },
      {
        __typename: "CheckRun",
        name: "lint",
        status: "COMPLETED",
        conclusion: "NEUTRAL",
      },
      { __typename: "StatusContext", context: "ci/legacy", state: "SUCCESS" },
    ],
    files: [{ path: "src/pages/intro/index.njk", additions: 1, deletions: 0 }],
    body: GOOD_BODY,
    comments: [GOOD_COMMENT],
    ...overrides,
  };
}

/**
 * Stub runner. Records every call; unexpected commands throw so a test can
 * never silently fall through to the network or a real checkout.
 */
function makeEnv({
  pr = greenPr(),
  ghViewCode = 0,
  fetchCode = 0,
  catFileCode = 0,
  diff = ["src/pages/intro/index.njk"],
  mergeDiff = [],
  mergeDiffCode = 0,
  recheck = null,
  onMerge = null,
  currentBranch = "main",
  repoRoot = "/repo",
  cwd = "/repo",
  ancestorCode = 0,
  mergeCode = 0,
  testCode = 0,
  mergeCommit = "b".repeat(40),
  ghMergeCode = 0,
} = {}) {
  const calls = [];
  const out = [];
  const err = [];
  const fsCalls = [];
  const nul = (list) => list.map((name) => `${name}\0`).join("");
  let views = 0;
  const run = async (file, args, options = {}) => {
    calls.push({ file, args, cwd: options.cwd, options });
    const key = `${file} ${args.join(" ")}`;
    const ok = (stdout = "") => ({ code: 0, stdout, stderr: "" });
    const res = (code, stdout = "", stderr = "") => ({ code, stdout, stderr });
    if (key.startsWith("gh pr view") && key.includes("mergeCommit")) {
      return ok(JSON.stringify({ mergeCommit: { oid: mergeCommit } }));
    }
    if (key.startsWith("gh pr view")) {
      views += 1;
      if (ghViewCode !== 0) return res(1, "", "no such PR");
      if (views > 1 && recheck === "fail") return res(1, "", "net down");
      return ok(JSON.stringify(views > 1 && recheck ? recheck : pr));
    }
    if (key.startsWith("gh pr merge")) return res(ghMergeCode, "", "boom");
    if (key.startsWith("git fetch")) return res(fetchCode, "", "fetch broke");
    if (key.startsWith("git cat-file")) return res(catFileCode);
    if (file === "git" && args.includes("diff")) {
      return args.includes("--cached")
        ? res(mergeDiffCode, nul(mergeDiff), "diff broke")
        : ok(nul(diff));
    }
    if (key.startsWith("git branch --show-current")) {
      return ok(`${currentBranch}\n`);
    }
    if (key.startsWith("git merge-base")) return res(ancestorCode);
    if (key.startsWith("git rev-parse --show-toplevel")) {
      return ok(`${repoRoot}\n`);
    }
    if (key.startsWith("git worktree add")) return ok();
    if (key.startsWith("git worktree remove")) return ok();
    if (key.startsWith("git worktree prune")) return ok();
    if (key.startsWith("git merge --no-commit --no-ff")) {
      if (onMerge) await onMerge();
      return res(mergeCode, "CONFLICT (content): Merge conflict in a.txt", "");
    }
    if (key === "npm test") return res(testCode, "1 failed", "");
    throw new Error(`unexpected command: ${key}`);
  };
  const fs = {
    mkdtemp: async () => {
      fsCalls.push("mkdtemp");
      return TMP;
    },
    symlink: async (target, link) => {
      fsCalls.push(`symlink ${target} ${link}`);
    },
    rm: async (target) => {
      fsCalls.push(`rm ${target}`);
    },
  };
  return {
    calls,
    out,
    err,
    fsCalls,
    exec: (argv) =>
      main(argv, {
        run,
        fs,
        cwd,
        out: (t) => out.push(t),
        err: (t) => err.push(t),
      }),
    text: () => out.join("\n"),
    merged: () => calls.some((c) => c.file === "gh" && c.args[1] === "merge"),
  };
}

describe("parsePrNumber", () => {
  it("accepts positive integers only", () => {
    expect(parsePrNumber("429")).toBe(429);
    for (const bad of [
      "0",
      "-1",
      "1.5",
      "abc",
      "12; rm -rf /",
      "",
      "007",
      " 3",
    ]) {
      expect(parsePrNumber(bad)).toBeNull();
    }
    expect(parsePrNumber(undefined)).toBeNull();
  });

  it("main exits 2 and runs nothing for a bad number or unknown flag", async () => {
    for (const argv of [["abc"], [], ["1", "--admin"], ["1", "2"], ["1;ls"]]) {
      const env = makeEnv();
      expect(await env.exec(argv)).toBe(2);
      expect(env.calls).toHaveLength(0);
    }
  });
});

describe("gate 1: state", () => {
  it("passes an open, non-draft PR against main", () => {
    expect(checkState(greenPr())).toEqual([]);
  });

  it("refuses a draft", () => {
    expect(checkState(greenPr({ isDraft: true }))).toEqual(["PR is a draft"]);
  });

  it("refuses a wrong base", () => {
    const failures = checkState(greenPr({ baseRefName: "release" }));
    expect(failures.join()).toMatch(/base is release/);
  });

  it("refuses a PR that is not open", () => {
    for (const state of ["MERGED", "CLOSED"]) {
      expect(checkState(greenPr({ state })).join()).toMatch(/not OPEN/);
    }
  });
});

describe("gate 2: checks", () => {
  it("passes SUCCESS, NEUTRAL, SKIPPED and successful status contexts", () => {
    expect(checkChecks(greenPr())).toEqual([]);
  });

  it("refuses an empty or missing rollup", () => {
    expect(checkChecks(greenPr({ statusCheckRollup: [] })).join()).toMatch(
      /empty rollup/,
    );
    expect(checkChecks(greenPr({ statusCheckRollup: null })).join()).toMatch(
      /empty rollup/,
    );
  });

  it.each([
    "FAILURE",
    "CANCELLED",
    "TIMED_OUT",
    "ACTION_REQUIRED",
    "STARTUP_FAILURE",
    "",
  ])("refuses a finished check that concluded %s", (conclusion) => {
    const rollup = [
      { name: "build", status: "COMPLETED", conclusion: "SUCCESS" },
      { name: "e2e", status: "COMPLETED", conclusion },
    ];
    expect(checkChecks(greenPr({ statusCheckRollup: rollup })).join()).toMatch(
      /"e2e"/,
    );
  });

  it.each(["IN_PROGRESS", "QUEUED", "PENDING", "WAITING"])(
    "refuses a check that is %s",
    (status) => {
      const rollup = [{ name: "build", status, conclusion: "" }];
      expect(
        checkChecks(greenPr({ statusCheckRollup: rollup })).join(),
      ).toMatch(/has not finished/);
    },
  );

  it("refuses failing or pending commit statuses", () => {
    for (const state of ["FAILURE", "ERROR", "PENDING"]) {
      const rollup = [{ __typename: "StatusContext", context: "ci/x", state }];
      expect(
        checkChecks(greenPr({ statusCheckRollup: rollup })).join(),
      ).toMatch(/ci\/x/);
    }
  });

  it("reports every bad check, not just the first", () => {
    const rollup = [
      { name: "a", status: "COMPLETED", conclusion: "FAILURE" },
      { name: "b", status: "IN_PROGRESS", conclusion: "" },
    ];
    expect(checkChecks(greenPr({ statusCheckRollup: rollup }))).toHaveLength(2);
  });
});

describe("gate 3: review decision", () => {
  it("refuses CHANGES_REQUESTED through the full flow", async () => {
    const env = makeEnv({
      pr: greenPr({ reviewDecision: "CHANGES_REQUESTED" }),
    });
    expect(await env.exec(["7", "--execute"])).toBe(1);
    expect(env.text()).toMatch(/requested changes/);
    expect(env.merged()).toBe(false);
  });

  it("allows APPROVED and an empty decision", async () => {
    for (const reviewDecision of ["APPROVED", "", null]) {
      const env = makeEnv({ pr: greenPr({ reviewDecision }) });
      expect(await env.exec(["7"])).toBe(0);
    }
  });
});

describe("gate 4: review record", () => {
  const withBody = (body) => checkReviewRecord(greenPr({ body }));

  it("passes APPROVE and APPROVE WITH NITS, key case-insensitive", () => {
    expect(withBody(GOOD_BODY)).toEqual([]);
    expect(
      withBody(
        GOOD_BODY.replace("Verdict: APPROVE", "Verdict: APPROVE WITH NITS"),
      ),
    ).toEqual([]);
    expect(withBody(GOOD_BODY.replace("Verdict:", "VERDICT:"))).toEqual([]);
  });

  it("refuses a missing section", () => {
    expect(withBody("Just a description.").join()).toMatch(
      /no "## Review record"/,
    );
    expect(withBody(null).join()).toMatch(/no "## Review record"/);
  });

  it("refuses REQUEST CHANGES and other verdicts", () => {
    for (const verdict of [
      "REQUEST CHANGES",
      "approved",
      "LGTM",
      "APPROVE | APPROVE WITH NITS",
    ]) {
      const body = GOOD_BODY.replace("Verdict: APPROVE", `Verdict: ${verdict}`);
      expect(withBody(body).join()).toMatch(/verdict is/);
    }
  });

  it("refuses a conflicting second verdict", () => {
    const body = GOOD_BODY.replace(
      "Verdict: APPROVE",
      "Verdict: REQUEST CHANGES\nVerdict: APPROVE",
    );
    expect(withBody(body).join()).toMatch(/REQUEST CHANGES/);
  });

  it("refuses a missing verdict or missing findings line", () => {
    expect(
      withBody(GOOD_BODY.replace("Verdict: APPROVE\n", "")).join(),
    ).toMatch(/no Verdict/);
    expect(
      withBody(GOOD_BODY.replace("Findings resolved: yes\n", "")).join(),
    ).toMatch(/no Findings resolved/);
  });

  it("refuses Findings resolved other than yes", () => {
    for (const value of ["no", "partially", ""]) {
      const body = GOOD_BODY.replace(
        "Findings resolved: yes",
        `Findings resolved: ${value}`,
      );
      expect(withBody(body).join()).toMatch(/Findings resolved/);
    }
  });

  it("ignores a verdict that sits outside the Review record section", () => {
    const body =
      "Verdict: APPROVE\nFindings resolved: yes\n\n## Review record\nnothing here\n";
    expect(withBody(body).length).toBeGreaterThan(0);
  });

  it("ignores verdicts inside code fences and HTML comments", () => {
    const fenced =
      "## Review record\n```\nVerdict: APPROVE\nFindings resolved: yes\n```\n";
    expect(withBody(fenced).length).toBeGreaterThan(0);
    const commented =
      "## Review record\n<!--\nVerdict: APPROVE\nFindings resolved: yes\n-->\n";
    expect(withBody(commented).length).toBeGreaterThan(0);
  });

  it("checks every Verdict line whichever order they come in", () => {
    const approveFirst = GOOD_BODY.replace(
      "Verdict: APPROVE",
      "Verdict: APPROVE\nVerdict: REQUEST CHANGES",
    );
    expect(withBody(approveFirst).join()).toMatch(/REQUEST CHANGES/);
    const approveLast = GOOD_BODY.replace(
      "Verdict: APPROVE",
      "Verdict: REQUEST CHANGES\nVerdict: APPROVE",
    );
    expect(withBody(approveLast).join()).toMatch(/REQUEST CHANGES/);
    const three = GOOD_BODY.replace(
      "Verdict: APPROVE",
      "Verdict: APPROVE\nVerdict: APPROVE\nVerdict: nope",
    );
    expect(withBody(three).join()).toMatch(/"nope"/);
  });

  it("fails closed on a Verdict inside an indented code block", () => {
    for (const indent of ["    ", "\t", "        "]) {
      const body = GOOD_BODY.replace(
        "Verdict: APPROVE",
        `${indent}Verdict: APPROVE`,
      );
      expect(withBody(body).join()).toMatch(/inside an indented code block/);
    }
    const alongside = GOOD_BODY.replace(
      "Verdict: APPROVE",
      "Verdict: APPROVE\n    Verdict: APPROVE",
    );
    expect(withBody(alongside).join()).toMatch(/indented code block/);
  });

  it("fails closed on Findings resolved inside an indented code block", () => {
    const body = GOOD_BODY.replace(
      "Findings resolved: yes",
      "    Findings resolved: yes",
    );
    expect(withBody(body).join()).toMatch(
      /Findings resolved line is inside an indented code block/,
    );
  });

  it("fails closed on a Verdict inside <details>", () => {
    const wrapped = GOOD_BODY.replace(
      "Verdict: APPROVE",
      "<details>\n<summary>verdict</summary>\n\nVerdict: APPROVE\n\n</details>",
    );
    expect(withBody(wrapped).join()).toMatch(/inside a <details> block/);
    const unclosed = GOOD_BODY.replace(
      "Verdict: APPROVE",
      "<details>\nVerdict: APPROVE",
    );
    expect(withBody(unclosed).join()).toMatch(/inside a <details> block/);
    const sameLine = GOOD_BODY.replace(
      "Verdict: APPROVE",
      "<details><summary>x</summary>Verdict: APPROVE</details>",
    );
    expect(withBody(sameLine).length).toBeGreaterThan(0);
    const closedBefore = GOOD_BODY.replace(
      "## Summary",
      "<details>\nfold\n</details>\n\n## Summary",
    );
    expect(withBody(closedBefore)).toEqual([]);
  });

  it("treats everything after an unclosed code fence as inside the fence", () => {
    const fenced = GOOD_BODY.replace(
      "Verdict: APPROVE",
      "```\nVerdict: APPROVE",
    );
    expect(withBody(fenced).join()).toMatch(/inside an unclosed code fence/);
    const tilde = GOOD_BODY.replace(
      "Verdict: APPROVE",
      "~~~\nVerdict: APPROVE",
    );
    expect(withBody(tilde).join()).toMatch(/unclosed code fence/);
    // A good verdict first does not rescue a second one hidden after a fence.
    const second = GOOD_BODY.replace(
      "Verdict: APPROVE",
      "Verdict: APPROVE\n```\nVerdict: APPROVE",
    );
    expect(withBody(second).join()).toMatch(/unclosed code fence/);
    // A longer closing fence closes; a shorter one does not.
    const closed = GOOD_BODY.replace(
      "Verdict: APPROVE",
      "````\nquoted\n````\nVerdict: APPROVE",
    );
    expect(withBody(closed)).toEqual([]);
    const shortClose = GOOD_BODY.replace(
      "Verdict: APPROVE",
      "````\nquoted\n```\nVerdict: APPROVE",
    );
    expect(withBody(shortClose).join()).toMatch(/unclosed code fence/);
  });

  it("hides everything after an unclosed HTML comment", () => {
    const body = GOOD_BODY.replace("Verdict: APPROVE", "<!-- Verdict: APPROVE");
    expect(withBody(body).length).toBeGreaterThan(0);
  });

  it("counts only the first Review record heading and fails on a second", () => {
    const second = `${GOOD_BODY}\n\n## Review record\nVerdict: APPROVE\nFindings resolved: yes\n`;
    expect(withBody(second).join()).toMatch(
      /more than one "## Review record" heading/,
    );
    const hostile = `${GOOD_BODY}\n\n## Review record\nVerdict: REQUEST CHANGES\n`;
    expect(withBody(hostile).join()).toMatch(/more than one/);
    const quoted = `${GOOD_BODY}\n\n\`\`\`\n## Review record\n\`\`\`\n`;
    expect(withBody(quoted)).toEqual([]);
    const commented = `${GOOD_BODY}\n\n<!--\n## Review record\n-->\n`;
    expect(withBody(commented)).toEqual([]);
  });

  it("copes with CRLF bodies", () => {
    expect(withBody(GOOD_BODY.replace(/\n/g, "\r\n"))).toEqual([]);
  });
});

describe("gate 4b: audit-trail comment", () => {
  const withComments = (comments) => checkAuditTrail(greenPr({ comments }));
  const comment = (body) => ({ author: { login: "x" }, body });
  const padded = (length) => {
    const head = "Verdict: APPROVE\n";
    return head + "x".repeat(length - head.length);
  };

  it("passes a comment with a Verdict line and 200+ characters", () => {
    expect(withComments([GOOD_COMMENT])).toEqual([]);
    expect(withComments([comment("short"), GOOD_COMMENT])).toEqual([]);
  });

  it("is exactly 200 characters at the boundary", () => {
    expect(padded(200)).toHaveLength(200);
    expect(withComments([comment(padded(200))])).toEqual([]);
    expect(withComments([comment(padded(199))]).join()).toMatch(
      /no audit-trail comment/,
    );
  });

  it("refuses no comments, missing field, and a bare Verdict line", () => {
    for (const comments of [[], null, undefined, [comment("")]]) {
      expect(withComments(comments).join()).toMatch(/no audit-trail comment/);
    }
    expect(withComments([comment("Verdict: APPROVE")]).length).toBe(1);
  });

  it("refuses a long comment that has no Verdict line", () => {
    expect(withComments([comment("looks good ".repeat(40))]).length).toBe(1);
    const inline = `I think the Verdict: APPROVE is fair. ${"x".repeat(200)}`;
    expect(withComments([comment(inline)]).length).toBe(1);
  });

  it("tells the agent how to fix it", () => {
    expect(withComments([]).join()).toContain(
      "paste the reviewer's report as a PR comment (gh pr comment <n> --body-file ...)",
    );
  });

  it("blocks --execute end to end and shows up as gate 4b", async () => {
    const env = makeEnv({ pr: greenPr({ comments: [] }) });
    expect(await env.exec(["7", "--execute"])).toBe(1);
    expect(env.text()).toMatch(/FAIL {2}4b\. audit/);
    expect(env.text()).toMatch(/PASS {2}4\. +record/);
    expect(env.merged()).toBe(false);
  });

  it("asks gh for comments", () => {
    expect(PR_FIELDS.split(",")).toContain("comments");
  });
});

describe("gate 5: maintainer-only files", () => {
  const cases = [
    [".github/workflows/ci.yml", "workflows"],
    [".github/workflows/nested/deploy.yaml", "nested workflows"],
    [".github/CODEOWNERS", "codeowners"],
    [".github/dependabot.yml", "dependabot"],
    [".github/pull_request_template.md", "anything under .github"],
    [".claude/settings.json", "claude settings"],
    [".claude/settings.local.json", "claude local settings"],
    [".claude/hooks/guard.mjs", "claude hooks"],
    [".claude/scripts/check-merged-prs.sh", "claude scripts"],
    [".claude/agents/reviewer.md", "claude agents"],
    [".npmrc", "root npmrc"],
    ["playground/.npmrc", "playground npmrc"],
    [".husky/pre-commit", "husky hooks"],
    ["vitest.config.mjs", "vitest config"],
    ["vitest.config.ts", "vitest config, other extension"],
    ["tests/setup.js", "test setup"],
    ["lighthouse-ci.config.json", "lighthouse config"],
    ["scripts/merge-pr.mjs", "the gate itself"],
    ["tests/unit/merge-pr.test.js", "the gate's tests"],
    ["tests/unit/merge-pr-extra.test.js", "the gate's other tests"],
    ["supabase/migrations/001.sql", "supabase"],
    ["CNAME", "domain"],
    ["LICENSE", "license"],
    ["LICENSE.md", "license with extension"],
    ["package.json", "root manifest"],
    ["package-lock.json", "root lockfile"],
    ["playground/package.json", "playground manifest"],
    ["playground/package-lock.json", "playground lockfile"],
  ];
  const swapCase = (text) =>
    [...text]
      .map((ch) =>
        ch === ch.toLowerCase() ? ch.toUpperCase() : ch.toLowerCase(),
      )
      .join("");

  it("has a case for every restricted pattern", () => {
    const covered = new Set(cases.map(([file]) => restrictedPatternFor(file)));
    expect([...covered].sort()).toEqual([...RESTRICTED_PATTERNS].sort());
  });

  it.each(cases)("refuses %s (%s)", (file) => {
    const failures = checkFiles([{ path: file }]);
    expect(failures).toEqual([`touches ${file}: maintainer merges this one`]);
  });

  it.each(cases)("refuses the case variant of %s (%s)", (file) => {
    const variant = swapCase(file);
    expect(variant).not.toBe(file);
    expect(checkFiles([variant])).toEqual([
      `touches ${variant}: maintainer merges this one`,
    ]);
  });

  it("refuses non-ASCII look-alikes inside restricted trees", () => {
    for (const file of [
      ".github/workflows/déploy.yml",
      "supabase/é.sql",
      "LICENSEé",
      "package-locK.json",
      // Compatibility look-alikes that a case-folding filesystem may equate.
      "package-loc\u212a.json",
      "\uff50ackage.json",
    ]) {
      expect(checkFiles([file])).toHaveLength(1);
    }
  });

  it("allows ordinary files and look-alikes", () => {
    const files = [
      "src/pages/intro/index.njk",
      "docs/package.json.md",
      "src/package.json",
      "tests/unit/merge-cookbook-page.test.js",
      "scripts/merge-pr-notes.md",
      "CLAUDE.md",
      "AGENTS.md",
      ".claude/rules/testing.md",
      ".claude/skills/review/SKILL.md",
      ".claude/commands/verify-all.md",
      "docs/.github/notes.md",
    ];
    expect(checkFiles(files)).toEqual([]);
    for (const file of files) expect(restrictedPatternFor(file)).toBeNull();
  });

  it("is not fooled by case or ./ prefixes", () => {
    expect(checkFiles(["./.GitHub/Workflows/ci.yml", "cname"])).toHaveLength(2);
  });

  it("refuses through the full flow with no override", async () => {
    const env = makeEnv({
      pr: greenPr({ files: [{ path: ".github/workflows/ci.yml" }] }),
    });
    expect(await env.exec(["7", "--execute"])).toBe(1);
    expect(env.text()).toMatch(
      /touches \.github\/workflows\/ci\.yml: maintainer merges this one/,
    );
    expect(env.merged()).toBe(false);
  });
});

describe("gate 5 cross-check against git", () => {
  it("catches a restricted file that gh did not list but git diff did", async () => {
    const env = makeEnv({ diff: ["src/a.njk", "package.json"] });
    expect(await env.exec(["7", "--execute"])).toBe(1);
    expect(env.text()).toMatch(/touches package\.json/);
    expect(env.merged()).toBe(false);
  });

  it("catches a non-ASCII restricted path that gh did not list", async () => {
    const env = makeEnv({ diff: [".github/workflows/déploy.yml"] });
    expect(await env.exec(["7", "--execute"])).toBe(1);
    expect(env.text()).toContain("touches .github/workflows/déploy.yml");
  });

  it("catches a file that only the merge-result diff reports", async () => {
    const env = makeEnv({ mergeDiff: ["supabase/seed.sql"] });
    expect(await env.exec(["7", "--execute"])).toBe(1);
    expect(env.text()).toContain("touches supabase/seed.sql");
    expect(env.merged()).toBe(false);
  });

  it("refuses when the merge-result diff itself fails", async () => {
    const env = makeEnv({ mergeDiffCode: 128 });
    expect(await env.exec(["7", "--execute"])).toBe(1);
    expect(env.text()).toMatch(/diff of the merge result failed/);
  });

  it("asks git for NUL-delimited, unquoted, rename-free name lists", async () => {
    const env = makeEnv();
    await env.exec(["7"]);
    const diffs = env.calls.filter(
      (c) => c.file === "git" && c.args.includes("diff"),
    );
    expect(diffs).toHaveLength(2);
    const [threeDot, merged] = diffs;
    expect(threeDot.args).toContain(`origin/main...${OID}`);
    expect(merged.args).toContain("--cached");
    expect(merged.args).toContain("origin/main");
    expect(merged.cwd).toBe(TMP);
    for (const call of diffs) {
      expect(call.args).toContain("--name-only");
      expect(call.args).toContain("--no-renames");
      expect(call.args).toContain("-z");
      expect(call.args.join(" ")).toContain("-c core.quotepath=false");
    }
  });
});

describe("gate 5 against real git (no stubs)", () => {
  let root;
  let caller;
  const heads = {};
  const gitIn = (dir, ...args) =>
    execFileSync(
      "git",
      [
        "-c",
        "user.name=merge-pr-test",
        "-c",
        "user.email=test@example.com",
        "-c",
        "commit.gpgsign=false",
        ...args,
      ],
      { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
  const put = (dir, file, text = "x\n") => {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), text);
  };

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), "merge-pr-git-"));
    const origin = path.join(root, "origin.git");
    const seed = path.join(root, "seed");
    caller = path.join(root, "caller");
    mkdirSync(seed);
    gitIn(root, "init", "--bare", "--initial-branch=main", origin);
    gitIn(seed, "init", "--initial-branch=main");
    gitIn(seed, "remote", "add", "origin", origin);
    put(seed, "README.md");
    put(seed, "docs/keep.md");
    put(seed, ".github/workflows/ci.yml", "name: ci\n");
    gitIn(seed, "add", "-A");
    gitIn(seed, "commit", "-m", "base");
    gitIn(seed, "push", "origin", "main");

    const branch = (name, change) => {
      gitIn(seed, "checkout", "-b", name, "main");
      change();
      gitIn(seed, "add", "-A");
      gitIn(seed, "commit", "-m", name);
      gitIn(seed, "push", "origin", name);
      heads[name] = gitIn(seed, "rev-parse", "HEAD").trim();
      gitIn(seed, "checkout", "main");
    };
    branch("add-workflow", () =>
      put(seed, ".github/workflows/déploy.yml", "name: d\n"),
    );
    branch("add-sql", () => put(seed, "supabase/é.sql", "select 1;\n"));
    branch("add-license", () => put(seed, "LICENSEé", "x\n"));
    branch("rename-workflow", () => {
      gitIn(seed, "mv", ".github/workflows/ci.yml", "docs/x.md");
    });
    branch("delete-workflow", () => {
      gitIn(seed, "rm", "-q", ".github/workflows/ci.yml");
    });
    branch("docs-only", () => put(seed, "docs/ok.md"));
    gitIn(root, "clone", "-q", origin, caller);
  }, 60_000);

  afterAll(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  async function runAgainstRealGit(name) {
    const pr = greenPr({
      headRefName: name,
      headRefOid: heads[name],
      // gh lists only a harmless file, as when its list is truncated.
      files: [{ path: "README.md" }],
    });
    const run = (file, args, options) =>
      file === "gh"
        ? Promise.resolve({ code: 0, stdout: JSON.stringify(pr), stderr: "" })
        : defaultRunner(file, args, options);
    const out = [];
    const code = await main(["7"], {
      run,
      cwd: caller,
      out: (t) => out.push(t),
      err: (t) => out.push(t),
    });
    return { code, text: out.join("\n") };
  }

  it.each([
    ["add-workflow", ".github/workflows/déploy.yml"],
    ["add-sql", "supabase/é.sql"],
    ["add-license", "LICENSEé"],
    ["rename-workflow", ".github/workflows/ci.yml"],
    ["delete-workflow", ".github/workflows/ci.yml"],
  ])(
    "refuses branch %s (touches %s)",
    async (name, expected) => {
      const { code, text } = await runAgainstRealGit(name);
      expect(text).toContain(`touches ${expected}: maintainer merges this one`);
      expect(code).toBe(1);
    },
    30_000,
  );

  it("catches the rename's destination too", async () => {
    const { text } = await runAgainstRealGit("rename-workflow");
    expect(text).not.toMatch(/touches docs\/x\.md/);
    expect(text).toMatch(/FAIL {2}5\. +files/);
  }, 30_000);

  it("passes a docs-only branch, so the harness is not vacuous", async () => {
    const { code, text } = await runAgainstRealGit("docs-only");
    expect(text).toMatch(/PASS {2}5\. +files/);
    expect(text).toMatch(/PASS {2}6\. +merge/);
    expect(code).toBe(0);
    expect(gitIn(caller, "worktree", "list").trim().split("\n")).toHaveLength(
      1,
    );
  }, 30_000);
});

describe("gate 6: test-merge", () => {
  it("refuses a merge conflict and still cleans up the worktree", async () => {
    const env = makeEnv({ mergeCode: 1 });
    expect(await env.exec(["7", "--execute"])).toBe(1);
    expect(env.text()).toMatch(/does not merge cleanly/);
    expect(env.merged()).toBe(false);
    expect(
      env.calls.some((c) => c.args.slice(0, 2).join(" ") === "worktree remove"),
    ).toBe(true);
    expect(env.fsCalls).toContain(`rm ${TMP}`);
  });

  it("runs the merge in the temp worktree, never in the caller's checkout", async () => {
    const env = makeEnv();
    await env.exec(["7"]);
    const merge = env.calls.find((c) => c.args[0] === "merge");
    expect(merge.cwd).toBe(TMP);
    expect(merge.args).toEqual(["merge", "--no-commit", "--no-ff", OID]);
    const add = env.calls.find(
      (c) => c.args.slice(0, 2).join(" ") === "worktree add",
    );
    expect(add.args).toContain("origin/main");
  });

  it("refuses when behind main and npm test fails on the merged result", async () => {
    const env = makeEnv({ ancestorCode: 1, testCode: 1 });
    expect(await env.exec(["7", "--execute"])).toBe(1);
    expect(env.text()).toMatch(/npm test fails on the merged result/);
    expect(env.merged()).toBe(false);
    const test = env.calls.find((c) => c.file === "npm");
    expect(test.cwd).toBe(TMP);
    expect(env.fsCalls).toContain(`rm ${TMP}`);
  });

  it("passes when behind main and npm test succeeds", async () => {
    const env = makeEnv({ ancestorCode: 1, testCode: 0 });
    expect(await env.exec(["7"])).toBe(0);
    expect(env.calls.some((c) => c.file === "npm")).toBe(true);
    expect(
      env.fsCalls.some((c) => c.startsWith("symlink /repo/node_modules")),
    ).toBe(true);
  });

  it("does not run npm test when head already contains main", async () => {
    const env = makeEnv({ ancestorCode: 0 });
    expect(await env.exec(["7"])).toBe(0);
    expect(env.calls.some((c) => c.file === "npm")).toBe(false);
  });

  it("refuses when the branch moved since the PR was read", async () => {
    const env = makeEnv({ catFileCode: 1 });
    expect(await env.exec(["7", "--execute"])).toBe(1);
    expect(env.text()).toMatch(/branch moved/);
    expect(env.merged()).toBe(false);
  });

  it("refuses when git fetch fails", async () => {
    const env = makeEnv({ fetchCode: 128 });
    expect(await env.exec(["7", "--execute"])).toBe(1);
    expect(env.merged()).toBe(false);
  });

  it("refuses an unsafe branch name instead of passing it to git", async () => {
    const env = makeEnv({ pr: greenPr({ headRefName: "--upload-pack=evil" }) });
    expect(await env.exec(["7", "--execute"])).toBe(1);
    expect(env.calls.some((c) => c.args[0] === "fetch")).toBe(false);
  });
});

describe("main flow: every gate blocks --execute end to end", () => {
  const red = { name: "e2e", status: "COMPLETED", conclusion: "FAILURE" };
  const pending = { name: "e2e", status: "IN_PROGRESS", conclusion: "" };
  const refusals = {
    "red check": { statusCheckRollup: [red] },
    "pending check": { statusCheckRollup: [pending] },
    "empty rollup": { statusCheckRollup: [] },
    draft: { isDraft: true },
    "wrong base": { baseRefName: "develop" },
    "closed PR": { state: "CLOSED" },
    "no review record": { body: "Looks fine to me." },
    "no audit-trail comment": { comments: [] },
    "audit comment without a Verdict line": {
      comments: [{ body: "looks fine ".repeat(40) }],
    },
    "indented verdict": {
      body: GOOD_BODY.replace("Verdict: APPROVE", "    Verdict: APPROVE"),
    },
    "verdict after an unclosed fence": {
      body: GOOD_BODY.replace("Verdict: APPROVE", "```\nVerdict: APPROVE"),
    },
    "duplicate Review record heading": {
      body: `${GOOD_BODY}\n\n## Review record\nVerdict: APPROVE\n`,
    },
    "REQUEST CHANGES verdict": {
      body: GOOD_BODY.replace("Verdict: APPROVE", "Verdict: REQUEST CHANGES"),
    },
    "findings not resolved": {
      body: GOOD_BODY.replace(
        "Findings resolved: yes",
        "Findings resolved: no",
      ),
    },
    "changes requested": { reviewDecision: "CHANGES_REQUESTED" },
    "workflow file": { files: [{ path: ".github/workflows/ci.yml" }] },
    lockfile: { files: [{ path: "package-lock.json" }] },
  };

  it.each(Object.entries(refusals))("refuses: %s", async (_name, overrides) => {
    const env = makeEnv({ pr: greenPr(overrides) });
    expect(await env.exec(["7", "--execute"])).toBe(1);
    expect(env.text()).toMatch(/REFUSED/);
    expect(env.merged()).toBe(false);
  });
});

describe("main flow", () => {
  it("reaches gh pr merge --squash --delete-branch when everything is green", async () => {
    const env = makeEnv();
    expect(await env.exec(["7", "--execute"])).toBe(0);
    const merge = env.calls.find(
      (c) => c.file === "gh" && c.args[1] === "merge",
    );
    expect(merge.args).toEqual([
      "pr",
      "merge",
      "7",
      "--squash",
      "--delete-branch",
      "--match-head-commit",
      OID,
    ]);
    expect(env.text()).toMatch(/MERGED PR #7/);
    expect(env.text()).toContain(`Merge commit: ${"b".repeat(40)}`);
    expect(env.text()).toMatch(/PASS {2}1\. +state/);
  });

  it("never uses --admin, --auto or --rebase", async () => {
    const env = makeEnv();
    await env.exec(["7", "--execute"]);
    const all = env.calls.flatMap((c) => c.args);
    for (const banned of ["--admin", "--auto", "--rebase"]) {
      expect(all).not.toContain(banned);
    }
  });

  it("dry run never calls gh pr merge, even when every gate passes", async () => {
    const env = makeEnv();
    expect(await env.exec(["7"])).toBe(0);
    expect(env.merged()).toBe(false);
    expect(env.text()).toMatch(/Dry run: nothing merged/);
  });

  it("prints every failed gate, not just the first", async () => {
    const env = makeEnv({
      pr: greenPr({
        isDraft: true,
        statusCheckRollup: [],
        body: "no record",
        comments: [],
        files: [{ path: "package.json" }],
      }),
    });
    expect(await env.exec(["7", "--execute"])).toBe(1);
    const text = env.text();
    for (const id of ["state", "checks", "record", "audit", "files"]) {
      expect(text).toMatch(new RegExp(`FAIL {2}\\w+\\. +${id}`));
    }
    expect(env.merged()).toBe(false);
  });

  it("refuses a PR that is not open and does not try a test-merge", async () => {
    const env = makeEnv({ pr: greenPr({ state: "MERGED" }) });
    expect(await env.exec(["7"])).toBe(1);
    expect(env.text()).toMatch(/not OPEN/);
    expect(env.calls.some((c) => c.args[0] === "fetch")).toBe(false);
  });

  it("skips the slow test run when another gate has already failed", async () => {
    const env = makeEnv({ pr: greenPr({ isDraft: true }), ancestorCode: 1 });
    expect(await env.exec(["7"])).toBe(1);
    expect(env.calls.some((c) => c.file === "npm")).toBe(false);
  });

  it("exits 1 when gh pr view fails", async () => {
    const env = makeEnv({ ghViewCode: 1 });
    expect(await env.exec(["7", "--execute"])).toBe(1);
    expect(env.err.join()).toMatch(/gh pr view failed/);
    expect(env.merged()).toBe(false);
  });

  it("exits 1 when gh pr merge itself fails", async () => {
    const env = makeEnv({ ghMergeCode: 1 });
    expect(await env.exec(["7", "--execute"])).toBe(1);
    expect(env.err.join()).toMatch(/gh pr merge failed/);
  });
});

describe("lifecycle", () => {
  it("removes the temp worktree and dir when a signal arrives mid-merge", async () => {
    let removedAtSignal = null;
    let env;
    env = makeEnv({
      onMerge: async () => {
        await runPendingCleanups();
        removedAtSignal = {
          worktree: env.calls.some(
            (c) => c.args.slice(0, 2).join(" ") === "worktree remove",
          ),
          dir: env.fsCalls.includes(`rm ${TMP}`),
        };
      },
    });
    await env.exec(["7"]);
    expect(removedAtSignal).toEqual({ worktree: true, dir: true });
    // The normal cleanup afterwards is a no-op, not a second removal.
    expect(
      env.calls.filter(
        (c) => c.args.slice(0, 2).join(" ") === "worktree remove",
      ),
    ).toHaveLength(1);
    expect(env.fsCalls.filter((c) => c === `rm ${TMP}`)).toHaveLength(1);
  });

  it("installs SIGINT and SIGTERM handlers that clean up, then exit", async () => {
    for (const [signal, code] of [
      ["SIGINT", 130],
      ["SIGTERM", 143],
    ]) {
      const proc = new EventEmitter();
      const exited = new Promise((resolve) => {
        proc.exit = resolve;
      });
      const cleanup = vi.fn(async () => {});
      registerCleanup(cleanup);
      installSignalHandlers(proc);
      proc.emit(signal);
      expect(await exited).toBe(code);
      expect(cleanup).toHaveBeenCalledTimes(1);
    }
  });

  it("runs npm test in its own process group with a long timeout", async () => {
    const env = makeEnv({ ancestorCode: 1 });
    await env.exec(["7"]);
    const test = env.calls.find((c) => c.file === "npm");
    expect(test.options.killGroup).toBe(true);
    expect(test.options.timeout).toBe(600_000);
  });

  it("kills the whole process group when a command times out", async () => {
    const result = await defaultRunner(
      "sh",
      ["-c", "sleep 60 & echo $!; wait"],
      { timeout: 400, killGroup: true },
    );
    const pid = Number(result.stdout.trim());
    try {
      expect(result.code).toBe(124);
      expect(result.stderr).toMatch(/timed out/);
      expect(Number.isInteger(pid) && pid > 1).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(() => process.kill(pid, 0)).toThrow();
    } finally {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // already dead, which is the point
      }
    }
  }, 15_000);

  it("defaultRunner reports exit codes, output and missing binaries", async () => {
    const ok = await defaultRunner("node", ["-e", "console.log('hi')"]);
    expect(ok).toMatchObject({ code: 0, stdout: "hi\n" });
    const bad = await defaultRunner("node", ["-e", "process.exit(3)"]);
    expect(bad.code).toBe(3);
    const missing = await defaultRunner("definitely-not-a-binary-xyz", []);
    expect(missing.code).not.toBe(0);
    expect(missing.stderr).not.toBe("");
  });

  it("runs gh pr merge from the repo root, not a subdirectory", async () => {
    const env = makeEnv({ cwd: "/repo/src/pages", repoRoot: "/repo" });
    expect(await env.exec(["7", "--execute"])).toBe(0);
    const merge = env.calls.find(
      (c) => c.file === "gh" && c.args[1] === "merge",
    );
    expect(merge.cwd).toBe("/repo");
    expect(merge.cwd).not.toBe(TMP);
  });

  it("warns, but still merges, when the checkout is on the PR branch", async () => {
    const env = makeEnv({ currentBranch: "claude/example" });
    expect(await env.exec(["7", "--execute"])).toBe(0);
    expect(env.err.join()).toMatch(/checkout is on claude\/example/);
    expect(env.merged()).toBe(true);
    const quiet = makeEnv({ currentBranch: "main" });
    await quiet.exec(["7", "--execute"]);
    expect(quiet.err.join()).not.toMatch(/checkout is on/);
  });
});

describe("TOCTOU: re-read before merging", () => {
  const green = () => greenPr();
  const changes = {
    "head moved": [{ headRefOid: "c".repeat(40) }, /head moved from aaaaaaa/],
    "check turned red": [
      {
        statusCheckRollup: [
          { name: "build", status: "COMPLETED", conclusion: "FAILURE" },
        ],
      },
      /"build" concluded FAILURE/,
    ],
    "check back in progress": [
      {
        statusCheckRollup: [
          { name: "build", status: "IN_PROGRESS", conclusion: "" },
        ],
      },
      /has not finished/,
    ],
    "changes requested": [
      { reviewDecision: "CHANGES_REQUESTED" },
      /requested changes/,
    ],
    "closed meanwhile": [{ state: "CLOSED" }, /not OPEN/],
    "converted to draft": [{ isDraft: true }, /draft/],
    retargeted: [{ baseRefName: "release" }, /base is release/],
  };

  it.each(Object.entries(changes))(
    "refuses when the PR changed: %s",
    async (_name, [patch, pattern]) => {
      const env = makeEnv({ recheck: { ...green(), ...patch } });
      expect(await env.exec(["7", "--execute"])).toBe(1);
      expect(env.text()).toMatch(
        /changed between the first read and the merge/,
      );
      expect(env.text()).toMatch(pattern);
      expect(env.merged()).toBe(false);
    },
  );

  it("refuses when the re-read itself fails", async () => {
    const env = makeEnv({ recheck: "fail" });
    expect(await env.exec(["7", "--execute"])).toBe(1);
    expect(env.err.join()).toMatch(/could not re-read the PR/);
    expect(env.merged()).toBe(false);
  });

  it("merges when nothing changed, re-reading just before gh pr merge", async () => {
    const env = makeEnv({ recheck: green() });
    expect(await env.exec(["7", "--execute"])).toBe(0);
    const views = env.calls
      .map((c, index) => ({ c, index }))
      .filter(({ c }) => c.file === "gh" && c.args[1] === "view");
    const mergeIndex = env.calls.findIndex(
      (c) => c.file === "gh" && c.args[1] === "merge",
    );
    // initial read, re-read, then (after the merge) the merge-commit lookup
    const reread = views[1];
    expect(reread.c.args).toContain(RECHECK_FIELDS);
    expect(reread.index).toBeLessThan(mergeIndex);
    for (const field of [
      "headRefOid",
      "reviewDecision",
      "statusCheckRollup",
      "state",
    ]) {
      expect(RECHECK_FIELDS.split(",")).toContain(field);
    }
  });

  it("does not re-read on a dry run", async () => {
    const env = makeEnv();
    await env.exec(["7"]);
    const views = env.calls.filter(
      (c) => c.file === "gh" && c.args[1] === "view",
    );
    expect(views).toHaveLength(1);
  });

  it("still binds the head with --match-head-commit", async () => {
    const env = makeEnv();
    await env.exec(["7", "--execute"]);
    const merge = env.calls.find(
      (c) => c.file === "gh" && c.args[1] === "merge",
    );
    expect(merge.args).toContain("--match-head-commit");
    expect(merge.args).toContain(OID);
  });
});

describe("self-attestation is stated, not hidden", () => {
  it("--help explains that gates 4 and 4b are a convention check", async () => {
    for (const flag of ["--help", "-h"]) {
      const env = makeEnv();
      expect(await env.exec([flag])).toBe(0);
      expect(env.calls).toHaveLength(0);
      expect(env.text()).toMatch(/convention check, not authentication/);
      expect(env.text()).toMatch(/4b/);
    }
  });

  it("the refusal output ends with the same note", async () => {
    const env = makeEnv({ pr: greenPr({ isDraft: true }) });
    expect(await env.exec(["7", "--execute"])).toBe(1);
    const lines = env.out;
    expect(lines.at(-1)).toMatch(/convention check, not authentication/);
  });

  it("the script header says so too", async () => {
    const source = readFileSync(
      path.join(process.cwd(), "scripts/merge-pr.mjs"),
      "utf8",
    );
    const header = source.split("\nimport ")[0];
    expect(header).toMatch(/CONVENTION check, not\s+\/\/ authentication/);
    expect(header).toMatch(/TOCTOU/);
  });
});
