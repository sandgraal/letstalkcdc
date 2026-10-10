import { describe, expect, it } from "vitest";
import {
  checkChecks,
  checkFiles,
  checkReviewRecord,
  checkState,
  main,
  parsePrNumber,
  restrictedPatternFor,
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
  diff = "src/pages/intro/index.njk\n",
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
  const run = async (file, args, options = {}) => {
    calls.push({ file, args, cwd: options.cwd });
    const key = `${file} ${args.join(" ")}`;
    const ok = (stdout = "") => ({ code: 0, stdout, stderr: "" });
    const res = (code, stdout = "", stderr = "") => ({ code, stdout, stderr });
    if (key.startsWith("gh pr view") && key.includes("mergeCommit")) {
      return ok(JSON.stringify({ mergeCommit: { oid: mergeCommit } }));
    }
    if (key.startsWith("gh pr view")) {
      return ghViewCode === 0
        ? ok(JSON.stringify(pr))
        : res(1, "", "no such PR");
    }
    if (key.startsWith("gh pr merge")) return res(ghMergeCode, "", "boom");
    if (key.startsWith("git fetch")) return res(fetchCode, "", "fetch broke");
    if (key.startsWith("git cat-file")) return res(catFileCode);
    if (key.startsWith("git diff")) return ok(diff);
    if (key.startsWith("git merge-base")) return res(ancestorCode);
    if (key.startsWith("git rev-parse --show-toplevel")) return ok("/repo\n");
    if (key.startsWith("git worktree add")) return ok();
    if (key.startsWith("git worktree remove")) return ok();
    if (key.startsWith("git worktree prune")) return ok();
    if (key.startsWith("git merge --no-commit --no-ff")) {
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
        cwd: "/repo",
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

  it("copes with CRLF bodies", () => {
    expect(withBody(GOOD_BODY.replace(/\n/g, "\r\n"))).toEqual([]);
  });
});

describe("gate 5: maintainer-only files", () => {
  const cases = [
    [".github/workflows/ci.yml", "workflows"],
    [".github/workflows/nested/deploy.yaml", "nested workflows"],
    [".claude/settings.json", "claude settings"],
    [".claude/hooks/guard.mjs", "claude hooks"],
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
    [".github/CODEOWNERS", "codeowners"],
    [".github/dependabot.yml", "dependabot"],
  ];

  it.each(cases)("refuses %s (%s)", (file) => {
    const failures = checkFiles([{ path: file }]);
    expect(failures).toEqual([`touches ${file}: maintainer merges this one`]);
  });

  it("allows ordinary files and look-alikes", () => {
    const files = [
      "src/pages/intro/index.njk",
      "docs/package.json.md",
      "src/package.json",
      "tests/unit/merge-cookbook-page.test.js",
      ".github/pull_request_template.md",
      ".claude/agents/reviewer.md",
      "scripts/merge-pr-notes.md",
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

  it("catches a restricted file that gh did not list but git diff did", async () => {
    const env = makeEnv({ diff: "src/a.njk\npackage.json\n" });
    expect(await env.exec(["7", "--execute"])).toBe(1);
    expect(env.text()).toMatch(/touches package\.json/);
    expect(env.merged()).toBe(false);
  });
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
    expect(env.text()).toMatch(/PASS {2}1\. state/);
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
        files: [{ path: "package.json" }],
      }),
    });
    expect(await env.exec(["7", "--execute"])).toBe(1);
    const text = env.text();
    for (const id of ["state", "checks", "record", "files"]) {
      expect(text).toMatch(new RegExp(`FAIL {2}\\d\\. ${id}`));
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
