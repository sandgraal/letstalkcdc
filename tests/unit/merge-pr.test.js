import { execFileSync, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { hermeticGitEnv } from "./helpers/git-env.js";
import { pathToFileURL } from "node:url";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  PR_FIELDS,
  RECHECK_FIELDS,
  REGISTRY_PREFIX,
  RESTRICTED_PATTERNS,
  bumpProblem,
  checkAuditTrail,
  checkChecks,
  checkExceptionModes,
  checkFiles,
  checkReviewRecord,
  checkState,
  cleanApprovalText,
  cleanStaleTemp,
  comparePackageJson,
  dependabotCommitProblems,
  dependabotLane,
  dependencyMapChanges,
  DEPENDENCY_MAPS,
  defaultFs,
  defaultRunner,
  installSignalHandlers,
  isPrefixException,
  lockfilePatchProblems,
  lockfileProblems,
  main,
  parsePrNumber,
  registerCleanup,
  restrictedPatternFor,
  runPendingCleanups,
  scrubbedEnv,
} from "../../scripts/merge-pr.mjs";

const OID = "a".repeat(40);
const TMP = "/tmp/merge-pr-test-worktree";
const HOME_TMP = "/tmp/merge-pr-test-home";

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

const MANIFEST = {
  name: "letstalkcdc",
  version: "1.0.0",
  scripts: { test: "vitest run", "merge-pr": "node scripts/merge-pr.mjs" },
  dependencies: { lodash: "4.17.20" },
  devDependencies: { eslint: "9.1.0" },
};
const manifestText = (changes = {}) =>
  JSON.stringify({ ...MANIFEST, ...changes }, null, 2);
// A base manifest with several dependencies, for the Dependabot lane tests,
// and the merge result a bump of the named packages would produce.
const LANE_MANIFEST = {
  ...MANIFEST,
  dependencies: {
    lodash: "4.17.20",
    x: "1.0.0",
    a: "1.0.0",
    b: "1.0.0",
    c: "1.0.0",
  },
  devDependencies: { eslint: "9.1.0", prettier: "3.0.0" },
};
const laneBase = () => JSON.stringify(LANE_MANIFEST, null, 2);
// `bump` is a list of names (each gets its last digit raised by one) or an
// object of name -> exact new value.
const laneMerged = (bump = [], changes = {}) => {
  const manifest = structuredClone(LANE_MANIFEST);
  const wanted = Array.isArray(bump)
    ? Object.fromEntries(bump.map((name) => [name, null]))
    : bump;
  for (const [name, value] of Object.entries(wanted)) {
    for (const map of ["dependencies", "devDependencies"]) {
      if (name in manifest[map]) {
        manifest[map][name] =
          value ??
          manifest[map][name].replace(/\d+$/, (digits) =>
            String(Number(digits) + 1),
          );
      }
    }
  }
  return JSON.stringify({ ...manifest, ...changes }, null, 2);
};
// The packages a Dependabot PR's title (or group body) names, with the version
// each goes to (name -> exact new package.json value).
const namedBy = (pr) => {
  const single = /bump\s+(\S+)\s+from\s+\S+\s+to\s+v?(\S+)/i.exec(
    pr.title ?? "",
  );
  if (single) return { [single[1]]: single[2] };
  return Object.fromEntries(
    [
      ...String(pr.body ?? "").matchAll(
        /^Updates `([^`\n]+)` from \S+ to (\S+?)\.?$/gm,
      ),
    ].map((m) => [m[1], m[2]]),
  );
};
const BENIGN_PATCH = [
  "diff --git a/package-lock.json b/package-lock.json",
  "--- a/package-lock.json",
  "+++ b/package-lock.json",
  "@@ -1,3 +1,3 @@",
  '-      "version": "4.17.20",',
  '+      "version": "4.17.21",',
  '+      "resolved": "https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz",',
  "",
].join("\n");

const lockText = (resolved) =>
  JSON.stringify(
    {
      lockfileVersion: 3,
      packages: {
        "node_modules/lodash": { version: "4.17.21", resolved },
      },
    },
    null,
    2,
  );
const LOCK_REGISTRY = "https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz";
const LOCK_EVIL = "git+ssh://git@example.invalid/evil/lodash.git#abc";
const LOCK_BEFORE = lockText(
  "https://registry.npmjs.org/lodash/-/lodash-4.17.20.tgz",
);

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
  ghMergeStderr = "boom",
  postMerge = null,
  postMergeCode = 0,
  raw = null,
  rawCode = 0,
  tempEntries = null,
  lockPatch = BENIGN_PATCH,
  lockPatchCode = 0,
  baseManifest = manifestText(),
  mergedManifest = manifestText({ dependencies: { lodash: "4.17.21" } }),
  showCode = 0,
  mergedLock = lockText(LOCK_REGISTRY),
  lockShowCode = 0,
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
    if (key.startsWith("gh pr view") && key.includes("state,mergedAt,")) {
      if (postMerge === "fail") return res(1, "", "net down");
      return res(
        postMergeCode,
        JSON.stringify(postMerge ?? { state: "OPEN" }),
        postMergeCode === 0 ? "" : "gh exited non-zero",
      );
    }
    if (key.startsWith("gh pr view") && key.includes("mergeCommit")) {
      return ok(JSON.stringify({ mergeCommit: { oid: mergeCommit } }));
    }
    if (key.startsWith("gh pr view")) {
      views += 1;
      if (ghViewCode !== 0) return res(1, "", "no such PR");
      if (views > 1 && recheck === "fail") return res(1, "", "net down");
      return ok(JSON.stringify(views > 1 && recheck ? recheck : pr));
    }
    if (key.startsWith("gh pr merge"))
      return res(ghMergeCode, "", ghMergeStderr);
    if (key.startsWith("git fetch")) return res(fetchCode, "", "fetch broke");
    if (key.startsWith("git cat-file")) return res(catFileCode);
    if (key.startsWith("git show origin/main:package.json")) {
      return res(showCode, baseManifest, "show broke");
    }
    if (key === "git show :package.json") {
      return res(showCode, mergedManifest, "show broke");
    }
    if (key === "git show :package-lock.json") {
      return res(lockShowCode, mergedLock, "lock show broke");
    }
    if (
      file === "git" &&
      args.includes("--no-renames") &&
      args.includes("package-lock.json") &&
      !args.includes("--raw")
    ) {
      return res(lockPatchCode, lockPatch, "patch broke");
    }
    if (file === "git" && args.includes("--raw")) {
      return res(
        rawCode,
        raw ??
          ":000000 100644 0000000 1111111 A\0.claude/css-baseline.sha256\0",
        "raw broke",
      );
    }
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
    if (
      file === "git" &&
      args.includes("merge") &&
      args.includes("--no-commit")
    ) {
      if (onMerge) await onMerge();
      return res(mergeCode, "CONFLICT (content): Merge conflict in a.txt", "");
    }
    if (key === "npm test") return res(testCode, "1 failed", "");
    throw new Error(`unexpected command: ${key}`);
  };
  const fs = {
    mkdtemp: async (prefix) => {
      fsCalls.push("mkdtemp");
      return prefix.includes("home") ? HOME_TMP : TMP;
    },
    symlink: async (target, link) => {
      fsCalls.push(`symlink ${target} ${link}`);
    },
    rm: async (target) => {
      fsCalls.push(`rm ${target}`);
    },
    ...(tempEntries ? { listTemp: async () => tempEntries } : {}),
  };
  const call = (argv) =>
    main(argv, {
      run,
      fs,
      cwd,
      out: (t) => out.push(t),
      err: (t) => err.push(t),
    });
  return {
    calls,
    out,
    err,
    fsCalls,
    // P17-66: every test written before gates 4, 4b and 5 became advisory
    // asserts that those gates REFUSE, which is what --strict keeps. `exec`
    // therefore runs under --strict; `execDefault` runs the arguments as
    // given, which is how a user runs the script.
    exec: (argv) => call(["--strict", ...argv]),
    execDefault: (argv) => call(argv),
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

  describe("the latest Verdict must approve", () => {
    const at = (iso, verdict, extra = "") => ({
      author: { login: "same-account" },
      createdAt: iso,
      body: `## Review\nVerdict: ${verdict}\n${extra.padEnd(220, "x")}`,
    });
    const approve = at("2026-10-10T10:00:00Z", "APPROVE", "read the diff. ");
    const nits = at("2026-10-10T10:00:00Z", "APPROVE WITH NITS", "nits. ");
    const changes = (iso) => at(iso, "REQUEST CHANGES", "blocking. ");

    it("refuses when the only Verdict comment is REQUEST CHANGES", () => {
      const failures = withComments([changes("2026-10-10T10:00:00Z")]);
      expect(failures).toHaveLength(1);
      expect(failures[0]).toMatch(/latest comment.*"REQUEST CHANGES"/);
    });

    it("refuses an approval followed by a later REQUEST CHANGES", () => {
      expect(
        withComments([approve, changes("2026-10-10T11:00:00Z")]),
      ).toHaveLength(1);
    });

    it("passes REQUEST CHANGES followed by a later approval", () => {
      expect(withComments([changes("2026-10-10T09:00:00Z"), approve])).toEqual(
        [],
      );
      expect(withComments([changes("2026-10-10T09:00:00Z"), nits])).toEqual([]);
    });

    it("orders by createdAt, not by the position in the list", () => {
      expect(withComments([approve, changes("2026-10-10T09:00:00Z")])).toEqual(
        [],
      );
      expect(
        withComments([changes("2026-10-10T11:00:00Z"), approve]),
      ).toHaveLength(1);
    });

    it("a short REQUEST CHANGES still counts as the latest verdict", () => {
      const short = {
        createdAt: "2026-10-10T12:00:00Z",
        body: "Verdict: REQUEST CHANGES",
      };
      expect(withComments([approve, short])).toHaveLength(1);
    });

    it("needs an exact value: APPROVED, approve and extra words refuse", () => {
      for (const value of [
        "APPROVED",
        "approve",
        "APPROVE, but see below",
        "NOT APPROVE",
      ]) {
        expect(
          withComments([at("2026-10-10T10:00:00Z", value, "text. ")]),
        ).toHaveLength(1);
      }
    });

    it("takes the keyword case-insensitively", () => {
      const lower = {
        createdAt: "2026-10-10T10:00:00Z",
        body: `verdict: APPROVE\n${"x".repeat(220)}`,
      };
      expect(withComments([lower])).toEqual([]);
    });

    it("a comment that also lists a non-approving verdict does not approve", () => {
      const mixed = {
        createdAt: "2026-10-10T10:00:00Z",
        body: `Verdict: APPROVE\nVerdict: REQUEST CHANGES\n${"x".repeat(220)}`,
      };
      expect(withComments([mixed])).toHaveLength(1);
    });

    it("does not exclude the PR author's own comments", () => {
      const own = { ...approve, author: { login: "pr-author" } };
      expect(withComments([own])).toEqual([]);
    });

    it("documented limitation: filler plus an approving line passes", () => {
      const filler = {
        createdAt: "2026-10-10T10:00:00Z",
        body: `${"lorem ipsum ".repeat(30)}\nVerdict: APPROVE`,
      };
      expect(withComments([filler])).toEqual([]);
    });

    it("blocks --execute end to end", async () => {
      const env = makeEnv({
        pr: greenPr({
          comments: [approve, changes("2026-10-10T11:00:00Z")],
        }),
      });
      expect(await env.exec(["7", "--execute"])).toBe(1);
      expect(env.text()).toMatch(/FAIL {2}4b\. audit/);
      expect(env.merged()).toBe(false);
    });
  });

  describe("decorated verdicts and fail-closed parsing", () => {
    const long = (line) => `${line}\n${"x".repeat(220)}`;
    const at = (iso, body) => ({
      author: { login: "same" },
      createdAt: iso,
      body,
    });
    const approve = at("2026-10-10T10:00:00Z", long("Verdict: APPROVE"));
    const later = (body) => at("2026-10-10T11:00:00Z", long(body));
    const fresh = at("2026-10-10T12:00:00Z", long("Verdict: APPROVE"));

    // Each of these must stop an earlier approval from standing.
    const BLOCKS = [
      ["bold", "**Verdict: REQUEST CHANGES**"],
      ["heading", "## Verdict: CHANGES REQUESTED"],
      ["bullet", "- Verdict: CHANGES REQUESTED"],
      ["star bullet", "* Verdict: REQUEST CHANGES"],
      ["plus bullet", "+ Verdict: REQUEST CHANGES"],
      ["numbered list", "1. Verdict: REQUEST CHANGES"],
      ["backtick span", "`Verdict: REQUEST CHANGES`"],
      ["underscore emphasis", "__Verdict: REQUEST CHANGES__"],
      ["quoted", "> Verdict: REQUEST CHANGES"],
      ["nested quote", "> > Verdict: REQUEST CHANGES"],
      ["dash separator", "Verdict - REQUEST CHANGES"],
      ["value on the next line", "Verdict:\nREQUEST CHANGES"],
      ["value on the next line, CRLF", "Verdict:\r\nREQUEST CHANGES"],
      ["leading NBSP", "\u00a0Verdict: REQUEST CHANGES"],
      ["full-width colon", "Verdict\uff1a REQUEST CHANGES"],
      ["upper-case keyword, lower-case value", "VERDICT: Changes requested"],
      ["zero-width space inside the word", "Ver\u200bdict: REQUEST CHANGES"],
      ["ideographic space", "\u3000Verdict: REQUEST CHANGES"],
      ["line separator", "ok\u2028Verdict: REQUEST CHANGES"],
      ["html tags", "<b>Verdict: REQUEST CHANGES</b>"],
      ["prose prefix", "Final verdict: request changes"],
      ["emoji prefix", "\u274c Verdict: REQUEST CHANGES"],
      ["empty value", "Verdict:"],
      ["no colon", "Verdict REQUEST CHANGES"],
    ];

    it.each(BLOCKS)("a later %s block refuses", (_label, line) => {
      const failures = withComments([approve, later(line)]);
      expect(failures).toHaveLength(1);
      expect(failures[0]).toMatch(/latest comment with a Verdict line says/);
    });

    it.each(BLOCKS)("approve, %s block, fresh approve unblocks", (_l, line) => {
      expect(withComments([approve, later(line), fresh])).toEqual([]);
    });

    it("keeps the readable value in the message", () => {
      expect(
        withComments([approve, later("**Verdict: REQUEST CHANGES**")])[0],
      ).toContain('says "REQUEST CHANGES"');
    });

    // Decoration around the line or the value still approves.
    it.each([
      ["bold line", "**Verdict: APPROVE**"],
      ["bold keyword", "**Verdict:** APPROVE"],
      ["heading", "## Verdict: APPROVE WITH NITS"],
      ["bullet and backticks", "- Verdict: `APPROVE`"],
      ["full-width colon", "Verdict\uff1aAPPROVE"],
      ["NBSP around", "\u00a0Verdict:\u00a0APPROVE"],
      ["lower-case keyword", "verdict: APPROVE"],
      ["numbered", "1. Verdict: APPROVE"],
    ])("a %s approval passes", (_label, line) => {
      expect(withComments([at("2026-10-10T10:00:00Z", long(line))])).toEqual(
        [],
      );
    });

    it("does not approve decorated near-misses", () => {
      for (const line of [
        "**Verdict: APPROVED**",
        "**Verdict: approve**",
        "Verdict: **NOT** APPROVE",
        "Verdict: APPROVE.",
        "Verdict - APPROVE",
        "Verdict:\nAPPROVE",
        "\u2705 Verdict: APPROVE",
        "<b>Verdict: APPROVE</b>",
      ]) {
        expect(
          withComments([at("2026-10-10T10:00:00Z", long(line))]),
          line,
        ).toHaveLength(1);
      }
    });

    it("fails closed on any other line that mentions a verdict", () => {
      const body = long("Verdict: APPROVE\nMy verdict is that this is fine.");
      expect(withComments([at("2026-10-10T10:00:00Z", body)])).toHaveLength(1);
    });

    describe("quoted lines", () => {
      it("a quoted approval inside a new comment approves nothing", () => {
        const block = at(
          "2026-10-10T09:00:00Z",
          long("Verdict: REQUEST CHANGES"),
        );
        const quoting = later("> Verdict: APPROVE\nsee above");
        expect(withComments([block, quoting])).toHaveLength(1);
      });

      it("a quoted approval does not hide the real latest verdict", () => {
        const quoting = later("> Verdict: APPROVE\nsee above");
        expect(withComments([approve, quoting])).toEqual([]);
      });

      it("a quoted block still blocks, even beside an unquoted approval", () => {
        const both = later("> Verdict: REQUEST CHANGES\nVerdict: APPROVE");
        expect(withComments([approve, both])).toHaveLength(1);
      });
    });

    it("documented limit: a later comment with no Verdict word is not seen", () => {
      expect(
        withComments([approve, later("Blocking issues, do not merge.")]),
      ).toEqual([]);
    });

    describe("a re-approval must carry a report", () => {
      it("a short fresh approve after a block is refused", () => {
        const block = later("Verdict: REQUEST CHANGES");
        const short = at("2026-10-10T12:00:00Z", "Verdict: APPROVE");
        const failures = withComments([approve, block, short]);
        expect(failures).toHaveLength(1);
        expect(failures[0]).toMatch(/no audit-trail comment/);
        expect(failures[0]).toMatch(/must carry the report/);
      });

      it("a long fresh approve after the block is accepted", () => {
        const block = later("Verdict: REQUEST CHANGES");
        expect(withComments([approve, block, fresh])).toEqual([]);
      });

      it("a short latest approve is refused even with no block between", () => {
        const short = at("2026-10-10T12:00:00Z", "Verdict: APPROVE WITH NITS");
        expect(withComments([approve, short])).toHaveLength(1);
      });
    });

    describe("comment count", () => {
      const filler = Array.from({ length: 98 }, (_, i) =>
        at(`2026-10-09T10:${String(i % 60).padStart(2, "0")}:00Z`, "chat"),
      );

      it("audits 99 comments", () => {
        expect(withComments([...filler, GOOD_COMMENT])).toEqual([]);
      });

      it("refuses 100 or more: the newest may not have been returned", () => {
        for (const extra of [2, 50]) {
          const many = [...filler, ...Array(extra).fill(GOOD_COMMENT)];
          const failures = withComments(many);
          expect(failures).toHaveLength(1);
          expect(failures[0]).toMatch(/too many comments to audit/);
          expect(failures[0]).toMatch(/maintainer merges this one/);
        }
      });
    });
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
    [".claude/hooks/guard.mjs", "claude hooks"],
    [".claude/agents/reviewer.md", "claude agents"],
    [".claude/rules/testing.md", "claude rules"],
    [".claude/skills/review/SKILL.md", "claude skills"],
    ["CLAUDE.md", "agent instructions"],
    ["docs/sub/CLAUDE.md", "nested agent instructions"],
    ["CLAUDE.local.md", "local agent instructions"],
    ["docs/CLAUDE.local.md", "nested local agent instructions"],
    ["AGENTS.md", "agent instructions, other file"],
    ["docs/ai/AGENTS.md", "nested agents file"],
    [".mcp.json", "mcp servers"],
    ["packages/web/.mcp.json", "nested mcp servers"],
    [".vscode/tasks.json", "vscode tasks run commands"],
    [".devcontainer/devcontainer.json", "devcontainer"],
    ["docs/CONDUCTOR.md", "orchestration rules"],
    ["docs/TEAM-CHARTER.md", "team charter"],
    ["docs/DECISIONS.md", "decision register"],
    [".gitattributes", "gitattributes"],
    ["tools/sub/.gitattributes", "nested gitattributes"],
    [".gitmodules", "gitmodules"],
    ["vendor/x/.gitmodules", "nested gitmodules"],
    [".npmrc", "root npmrc"],
    ["playground/.npmrc", "playground npmrc"],
    ["packages/web/.npmrc", "npmrc at any depth"],
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
      "playground/package-locK.json",
      // Compatibility look-alikes that a case-folding filesystem may equate.
      "playground/package-loc\u212a.json",
      "playground/\uff50ackage.json",
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
      ".claude/css-baseline.sha256",
      "docs/seo-checklist.md",
      "docs/.github/notes.md",
      "docs/CLAUDE.md.bak",
      "src/assets/js/app.js",
      "src/pages/cdc/claude-notes.md",
      "docs/.vscode-notes.md",
      "docs/mcp.json",
    ];
    expect(checkFiles(files)).toEqual([]);
    for (const file of files) expect(restrictedPatternFor(file)).toBeNull();
  });

  describe("released to agents on 2026-10-12 (P17-65)", () => {
    const released = [
      "package.json",
      "package-lock.json",
      ".claude/commands/verify-all.md",
      ".claude/commands/sub/deeper.md",
      ".claude/scripts/check-merged-prs.sh",
    ];

    it.each(released)("passes gate 5: %s", (file) => {
      expect(restrictedPatternFor(file)).toBeNull();
      expect(checkFiles([{ path: file }])).toEqual([]);
    });

    it("keeps the list from regrowing those four patterns", () => {
      for (const gone of [
        "package.json",
        "package-lock.json",
        ".claude/commands/**",
        ".claude/scripts/**",
      ]) {
        expect(RESTRICTED_PATTERNS).not.toContain(gone);
      }
    });

    it.each([
      ".claude/hooks/guard-bash.mjs",
      ".claude/settings.json",
      ".claude/agents/conductor.md",
      ".claude/rules/css.md",
      ".claude/skills/new-module/SKILL.md",
      ".github/workflows/ci.yml",
      ".github/dependabot.yml",
      "scripts/merge-pr.mjs",
      "tests/unit/merge-pr.test.js",
      "playground/package.json",
      "playground/package-lock.json",
    ])("still refuses %s", (file) => {
      expect(checkFiles([{ path: file }])).toEqual([
        `touches ${file}: maintainer merges this one`,
      ]);
    });

    it.each([
      ".Claude/commands/x.md",
      ".claude/Commands/x.md",
      ".claude/SCRIPTS/x.sh",
      ".claude/commands",
      ".claude/commands/",
      ".claude/scripts",
      ".claude/commandsx/x.md",
      ".claude/commands/../settings.json",
      ".claude/scripts/../hooks/guard-bash.mjs",
      ".claude/commands/./x.md",
      ".claude//commands/x.md",
      "./.claude/commands/x.md",
      ".claude\\commands\\x.md",
      ".claude/commands/a\nb.md",
    ])("does not excuse the look-alike %j", (file) => {
      expect(checkFiles([file])).toHaveLength(1);
    });
  });

  it("excuses only the exact css-baseline path, not variants of it", () => {
    for (const file of [
      ".claude/CSS-baseline.sha256",
      ".claude/css-baseline.sha256.bak",
      ".claude/sub/css-baseline.sha256",
      "./.claude/css-baseline.sha256",
      ".claude/css-baseline.sha256\n",
    ]) {
      expect(checkFiles([file])).toHaveLength(1);
    }
  });

  describe("control characters and the glob compiler", () => {
    const dirs = [".github/workflows", "supabase", ".claude/agents"];
    const names = [
      ["LF", "a\nb"],
      ["CR", "a\rb"],
      ["TAB", "a\tb"],
      ["DEL", "a\x7fb"],
      ["leading space", " ab"],
      ["trailing LF", "ab\n"],
    ];

    it("matches restricted trees whatever characters the name holds", () => {
      for (const dir of dirs) {
        for (const [label, name] of names) {
          const file = `${dir}/${name}.yml`;
          expect(restrictedPatternFor(file), `${dir} ${label}`).not.toBeNull();
        }
      }
      expect(restrictedPatternFor("supabase/a\nb/c\nd.sql")).toBe(
        "supabase/**",
      );
      expect(restrictedPatternFor("LICENSE\nx")).toBe("LICENSE*");
      expect(restrictedPatternFor("vitest.config.m\njs")).toBe(
        "vitest.config.*",
      );
      expect(restrictedPatternFor("tests/unit/merge-pr\n.test.js")).toBe(
        "tests/unit/merge-pr*.test.js",
      );
    });

    it("refuses any control character, anywhere, with a fixed message", () => {
      for (const file of [
        "src/pages/a\nb.md",
        "docs/a\rb.md",
        "docs/a\tb.md",
        "docs/a\x00b.md",
        "docs/a\x1fb.md",
        "docs/a\x7fb.md",
        ".github/workflows/a\nb.yml",
        "supabase/a\nb.sql",
      ]) {
        const failures = checkFiles([file]);
        expect(failures, JSON.stringify(file)).toHaveLength(1);
        expect(failures[0]).toContain(
          "path contains a control character: maintainer merges this one",
        );
        expect(failures[0]).not.toContain("\n");
      }
    });

    it("does not call a space or a non-ASCII letter a control character", () => {
      expect(checkFiles(["docs/a b.md", "docs/é.md"])).toEqual([]);
    });
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
    const env = makeEnv({ diff: ["src/a.njk", "playground/package.json"] });
    expect(await env.exec(["7", "--execute"])).toBe(1);
    expect(env.text()).toMatch(/touches playground\/package\.json/);
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

describe("gate 5: the css-baseline exception needs a regular file", () => {
  const baseline = ".claude/css-baseline.sha256";
  const rawLine = (oldMode, newMode, status = "M") =>
    `:${oldMode} ${newMode} 0000000 1111111 ${status}\0${baseline}\0`;

  it("accepts a new regular file and an edited regular file", () => {
    expect(checkExceptionModes(rawLine("000000", "100644", "A"))).toEqual([]);
    expect(checkExceptionModes(rawLine("100644", "100644"))).toEqual([]);
    expect(checkExceptionModes("")).toEqual([]);
  });

  it.each([
    ["a new symlink", "000000", "120000"],
    ["a file turned into a symlink", "100644", "120000"],
    ["an executable", "100644", "100755"],
    ["a new executable", "000000", "100755"],
    ["a symlink edited in place", "120000", "120000"],
    ["a symlink turned into a file", "120000", "100644"],
    ["a deletion", "100644", "000000"],
    ["a submodule", "000000", "160000"],
  ])("refuses %s (%s -> %s)", (_label, oldMode, newMode) => {
    const failures = checkExceptionModes(rawLine(oldMode, newMode));
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain(`touches ${baseline} as a non-regular file`);
    expect(failures[0]).toContain("maintainer merges this one");
  });

  describe("paths under .claude/commands/ and .claude/scripts/", () => {
    const raw = (oldMode, newMode, file, status = "M") =>
      `:${oldMode} ${newMode} 0000000 1111111 ${status}\0${file}\0`;

    it.each([
      ["a regular file", "100644", "100644"],
      ["a new file", "000000", "100644"],
      ["a new executable script", "000000", "100755"],
      ["an executable made plain", "100755", "100644"],
      ["a deletion", "100644", "000000"],
    ])("accepts %s", (_label, oldMode, newMode) => {
      expect(
        checkExceptionModes(raw(oldMode, newMode, ".claude/scripts/a.sh")),
      ).toEqual([]);
      expect(
        checkExceptionModes(raw(oldMode, newMode, ".claude/commands/a.md")),
      ).toEqual([]);
    });

    it.each([
      ["a new symlink", "000000", "120000"],
      ["a file turned into a symlink", "100644", "120000"],
      ["a symlink removed", "120000", "000000"],
      ["a submodule", "000000", "160000"],
    ])("refuses %s", (_label, oldMode, newMode) => {
      const failures = checkExceptionModes(
        raw(oldMode, newMode, ".claude/commands/a.md"),
      );
      expect(failures).toHaveLength(1);
      expect(failures[0]).toContain(
        "touches .claude/commands/a.md as a non-regular file",
      );
    });

    it("asks for the raw diff of such a path in the full flow", async () => {
      const ok = makeEnv({ diff: [".claude/commands/a.md"] });
      expect(await ok.exec(["7"])).toBe(0);
      expect(ok.calls.find((c) => c.args.includes("--raw")).args.at(-1)).toBe(
        ".claude/commands/a.md",
      );
      const bad = makeEnv({
        diff: [".claude/commands/a.md"],
        raw: raw("000000", "120000", ".claude/commands/a.md", "A"),
      });
      expect(await bad.exec(["7", "--execute"])).toBe(1);
      expect(bad.text()).toMatch(/FAIL {2}5\. +files/);
      expect(bad.merged()).toBe(false);
    });
  });

  it("ignores other paths in the raw output", () => {
    const other = ":000000 120000 0000000 1111111 A\0docs/link.md\0";
    expect(checkExceptionModes(other)).toEqual([]);
  });

  it("through the full flow: a regular file passes, a symlink refuses", async () => {
    const ok = makeEnv({ diff: [baseline] });
    expect(await ok.exec(["7"])).toBe(0);
    expect(ok.text()).toMatch(/PASS {2}5\. +files/);

    const bad = makeEnv({
      diff: [baseline],
      raw: rawLine("000000", "120000", "A"),
    });
    expect(await bad.exec(["7", "--execute"])).toBe(1);
    expect(bad.text()).toMatch(/FAIL {2}5\. +files/);
    expect(bad.text()).toContain("as a non-regular file");
    expect(bad.merged()).toBe(false);
  });

  it("asks git for the merge result's raw diff, only for that path", async () => {
    const env = makeEnv({ diff: [baseline] });
    await env.exec(["7"]);
    const call = env.calls.find((c) => c.args.includes("--raw"));
    expect(call.cwd).toBe(TMP);
    expect(call.args).toContain("--cached");
    expect(call.args).toContain("-z");
    expect(call.args.slice(-3)).toEqual(["origin/main", "--", baseline]);
    const none = makeEnv();
    await none.exec(["7"]);
    expect(none.calls.some((c) => c.args.includes("--raw"))).toBe(false);
  });

  it("fails closed when the raw diff cannot be read", async () => {
    const env = makeEnv({ diff: [baseline], rawCode: 128 });
    expect(await env.exec(["7", "--execute"])).toBe(1);
    expect(env.text()).toMatch(/diff --raw of the merge result failed/);
    expect(env.merged()).toBe(false);
  });
});

describe("stale temp directories", () => {
  const HOUR = 3_600_000;
  const entry = (name, ageHours) => ({
    name,
    path: `/tmp/${name}`,
    mtimeMs: Date.now() - ageHours * HOUR,
  });
  const entries = [
    entry("merge-pr-old111", 25),
    entry("merge-pr-home-old222", 48),
    entry("merge-pr-young3", 23),
    entry("merge-pr-home-young4", 1),
    entry("merge-pr-git-old555", 99),
    entry("merge-pr-notes", 99),
    { name: "merge-pr-nan666", path: "/tmp/merge-pr-nan666", mtimeMs: NaN },
  ];

  it("removes old merge-pr-* and merge-pr-home-* dirs and prunes", async () => {
    const env = makeEnv({ tempEntries: entries });
    expect(await env.exec(["7"])).toBe(0);
    const removed = env.fsCalls.filter((c) =>
      c.startsWith("rm /tmp/merge-pr-"),
    );
    // The third rm is this run's own worktree, removed in the normal cleanup.
    expect(removed.sort()).toEqual([
      "rm /tmp/merge-pr-home-old222",
      "rm /tmp/merge-pr-old111",
      `rm ${TMP}`,
    ]);
    const removes = env.calls
      .filter((c) => c.args.slice(0, 2).join(" ") === "worktree remove")
      .map((c) => c.args.at(-1));
    expect(removes).toContain("/tmp/merge-pr-old111");
    expect(removes).not.toContain("/tmp/merge-pr-young3");
    expect(env.calls.some((c) => c.args.join(" ") === "worktree prune")).toBe(
      true,
    );
  });

  it("never touches anything younger than 24 h, or with no usable timestamp", async () => {
    const env = makeEnv({ tempEntries: entries });
    await env.exec(["7"]);
    for (const name of [
      "merge-pr-young3",
      "merge-pr-home-young4",
      "merge-pr-nan666",
      "merge-pr-git-old555",
      "merge-pr-notes",
    ]) {
      expect(env.fsCalls).not.toContain(`rm /tmp/${name}`);
    }
  });

  it("a failing cleanup never fails the run", async () => {
    const run = vi.fn(async () => {
      throw new Error("git gone");
    });
    const fs = {
      listTemp: async () => entries,
      rm: async () => {
        throw new Error("EPERM");
      },
    };
    await expect(cleanStaleTemp({ run, fs, cwd: "/repo" })).resolves.toEqual(
      expect.any(Array),
    );
  });

  describe("on a real directory", () => {
    let dir;
    afterEach(() => {
      vi.unstubAllEnvs();
      if (dir) rmSync(dir, { recursive: true, force: true });
    });

    it("removes the old ones and leaves the young, symlinks and others", async () => {
      dir = mkdtempSync(path.join(tmpdir(), "merge-pr-stale-test-"));
      vi.stubEnv("TMPDIR", dir);
      const old = new Date(Date.now() - 30 * HOUR);
      for (const name of ["merge-pr-old123", "merge-pr-home-old456"]) {
        mkdirSync(path.join(dir, name));
        writeFileSync(path.join(dir, name, "f"), "x");
        utimesSync(path.join(dir, name), old, old);
      }
      mkdirSync(path.join(dir, "merge-pr-young12"));
      mkdirSync(path.join(dir, "other-old123"));
      utimesSync(path.join(dir, "other-old123"), old, old);
      mkdirSync(path.join(dir, "elsewhere"));
      symlinkSync(
        path.join(dir, "elsewhere"),
        path.join(dir, "merge-pr-link123"),
      );
      const run = vi.fn(async () => ({ code: 0, stdout: "", stderr: "" }));
      const removed = await cleanStaleTemp({
        run,
        fs: defaultFs,
        cwd: "/repo",
      });
      expect(removed.sort()).toEqual([
        "merge-pr-home-old456",
        "merge-pr-old123",
      ]);
      expect(readdirSync(dir).sort()).toEqual([
        "elsewhere",
        "merge-pr-link123",
        "merge-pr-young12",
        "other-old123",
      ]);
    });
  });
});

// A CI runner or fresh container has no git identity, and `git merge` refuses
// to run without one ("empty ident name not allowed"). A developer machine
// often hides that by guessing a name from the account. These tests run real
// git, so make every developer machine behave like the runner: no global or
// system config, and never guess an identity.
const GIT_HERMETIC = {
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_COUNT: "1",
  GIT_CONFIG_KEY_0: "user.useConfigOnly",
  GIT_CONFIG_VALUE_0: "true",
};
const GIT_IDENTITY_VARS = [
  "GIT_AUTHOR_NAME",
  "GIT_AUTHOR_EMAIL",
  "GIT_COMMITTER_NAME",
  "GIT_COMMITTER_EMAIL",
];
function useHermeticGit() {
  const saved = {};
  beforeAll(() => {
    for (const key of [...Object.keys(GIT_HERMETIC), ...GIT_IDENTITY_VARS]) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    Object.assign(process.env, GIT_HERMETIC);
  });
  afterAll(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

describe("gate 5 against real git (no stubs)", () => {
  useHermeticGit();
  let root;
  let caller;
  const heads = {};
  const oddBranches = [];
  const ODD_DIRS = [
    [".github/workflows", "gh"],
    ["supabase", "sb"],
    [".claude/agents", "cl"],
  ];
  const ODD_NAMES = [
    ["lf", "a\nb"],
    ["cr", "a\rb"],
    ["tab", "a\tb"],
    ["space", " ab"],
  ];
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
    put(seed, "package.json", `${manifestText()}\n`);
    put(seed, "package-lock.json", `${LOCK_BEFORE}\n`);
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
    const BASELINE = ".claude/css-baseline.sha256";
    branch("baseline-regular", () => put(seed, BASELINE, "abc123\n"));
    branch("baseline-symlink", () => {
      mkdirSync(path.join(seed, ".claude"), { recursive: true });
      symlinkSync("settings.json", path.join(seed, BASELINE));
    });
    branch("baseline-exec", () => {
      put(seed, BASELINE, "abc123\n");
      chmodSync(path.join(seed, BASELINE), 0o755);
    });
    branch("commands-regular", () => put(seed, ".claude/commands/new.md"));
    branch("scripts-exec", () => {
      put(seed, ".claude/scripts/run.sh", "#!/bin/sh\n");
      chmodSync(path.join(seed, ".claude/scripts/run.sh"), 0o755);
    });
    branch("scripts-symlink", () => {
      mkdirSync(path.join(seed, ".claude/scripts"), { recursive: true });
      symlinkSync("../settings.json", path.join(seed, ".claude/scripts/x.sh"));
    });
    branch("root-manifest", () => {
      put(
        seed,
        "package.json",
        `${manifestText({ dependencies: { lodash: "4.17.21" } })}\n`,
      );
      put(seed, "package-lock.json", `${lockText(LOCK_REGISTRY)}\n`);
    });
    branch("root-scripts", () => {
      put(
        seed,
        "package.json",
        `${manifestText({ scripts: { ...MANIFEST.scripts, postinstall: "sh x" } })}\n`,
      );
    });
    branch("root-evil-lock", () => {
      put(
        seed,
        "package.json",
        `${manifestText({ dependencies: { lodash: "4.17.21" } })}\n`,
      );
      put(seed, "package-lock.json", `${lockText(LOCK_EVIL)}\n`);
    });
    branch("root-escaped-lock", () => {
      put(
        seed,
        "package.json",
        `${manifestText({ dependencies: { lodash: "4.17.21" } })}\n`,
      );
      // The key is spelled \u0072esolved, so no line says "resolved".
      put(
        seed,
        "package-lock.json",
        `{"lockfileVersion":3,"packages":{"node_modules/lodash":{"version":"4.17.21","\\u0072esolved":"${LOCK_EVIL}"}}}\n`,
      );
    });
    branch("root-engines", () => {
      put(
        seed,
        "package.json",
        `${manifestText({ engines: { node: ">=99" } })}\n`,
      );
    });
    branch("hooks-file", () => put(seed, ".claude/hooks/x.mjs"));

    // Names with control characters or a leading space, one branch each. The
    // entries go straight into the index, so no filesystem has to hold them.
    const odd = (name, file) => {
      gitIn(seed, "checkout", "-q", "-b", name, "main");
      const blob = execFileSync("git", ["hash-object", "-w", "--stdin"], {
        cwd: seed,
        input: "x\n",
        encoding: "utf8",
      }).trim();
      gitIn(
        seed,
        "update-index",
        "--add",
        "--cacheinfo",
        `100644,${blob},${file}`,
      );
      gitIn(seed, "commit", "-q", "-m", name);
      gitIn(seed, "push", "-q", "origin", name);
      heads[name] = gitIn(seed, "rev-parse", "HEAD").trim();
      gitIn(seed, "checkout", "-q", "-f", "main");
    };
    for (const [dir, tag] of ODD_DIRS) {
      for (const [label, name] of ODD_NAMES) {
        oddBranches.push([`odd-${tag}-${label}`, `${dir}/${name}.yml`]);
        odd(`odd-${tag}-${label}`, `${dir}/${name}.yml`);
      }
    }
    gitIn(root, "clone", "-q", origin, caller);
  }, 60_000);

  afterAll(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  async function runAgainstRealGit(name, prOverrides = {}) {
    const pr = greenPr({
      headRefName: name,
      headRefOid: heads[name],
      // gh lists only a harmless file, as when its list is truncated.
      files: [{ path: "README.md" }],
      ...prOverrides,
    });
    const run = (file, args, options) =>
      file === "gh"
        ? Promise.resolve({ code: 0, stdout: JSON.stringify(pr), stderr: "" })
        : defaultRunner(file, args, options);
    const out = [];
    const code = await main(["7", "--strict"], {
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

  it("refuses control-character and leading-space names in restricted trees", async () => {
    expect(oddBranches).toHaveLength(12);
    for (const [name, file] of oddBranches) {
      const { code, text } = await runAgainstRealGit(name);
      expect(code, name).toBe(1);
      expect(text, name).toMatch(/FAIL {2}5\. +files/);
      if ([...file].some((ch) => ch.charCodeAt(0) < 0x20)) {
        expect(text, name).toContain(
          "path contains a control character: maintainer merges this one",
        );
      } else {
        expect(text, name).toContain(
          `touches ${file}: maintainer merges this one`,
        );
      }
    }
  }, 120_000);

  it("catches the rename's destination too", async () => {
    const { text } = await runAgainstRealGit("rename-workflow");
    expect(text).not.toMatch(/touches docs\/x\.md/);
    expect(text).toMatch(/FAIL {2}5\. +files/);
  }, 30_000);

  it("lets a regular css-baseline file through, refuses a symlink or exec bit", async () => {
    const ok = await runAgainstRealGit("baseline-regular");
    expect(ok.text).toMatch(/PASS {2}5\. +files/);
    expect(ok.code).toBe(0);
    for (const name of ["baseline-symlink", "baseline-exec"]) {
      const bad = await runAgainstRealGit(name);
      expect(bad.code, name).toBe(1);
      expect(bad.text, name).toMatch(/FAIL {2}5\. +files/);
      expect(bad.text, name).toContain(
        "touches .claude/css-baseline.sha256 as a non-regular file",
      );
    }
    const sym = await runAgainstRealGit("baseline-symlink");
    expect(sym.text).toContain("000000 -> 120000");
  }, 60_000);

  it("lets released .claude paths and the root manifests through; a symlink or a hook still refuses", async () => {
    for (const name of [
      "commands-regular",
      "scripts-exec",
      "root-manifest",
      "root-engines",
    ]) {
      const ok = await runAgainstRealGit(name);
      expect(ok.text, name).toMatch(/PASS {2}5\. +files/);
      expect(ok.code, name).toBe(0);
    }
    const link = await runAgainstRealGit("scripts-symlink");
    expect(link.code).toBe(1);
    expect(link.text).toMatch(/FAIL {2}5\. +files/);
    expect(link.text).toContain(
      "touches .claude/scripts/x.sh as a non-regular file",
    );
    const hook = await runAgainstRealGit("hooks-file");
    expect(hook.code).toBe(1);
    expect(hook.text).toContain("touches .claude/hooks/x.mjs");
  }, 60_000);

  it("fails gate 5 when package.json scripts changed (real git)", async () => {
    const { code, text } = await runAgainstRealGit("root-scripts");
    expect(code).toBe(1);
    expect(text).toMatch(/FAIL {2}5\. +files/);
    expect(text).toContain(
      "package.json scripts changed: maintainer merges this one",
    );
  }, 30_000);

  describe("the Dependabot lane against real git", () => {
    const lane = (name, extra = {}) =>
      runAgainstRealGit(name, {
        author: { login: "dependabot[bot]", is_bot: true },
        title: "chore(deps): Bump lodash from 4.17.20 to 4.17.21",
        body: "Bumps lodash.",
        comments: [],
        files: [{ path: "package.json" }, { path: "package-lock.json" }],
        commits: [
          { oid: heads[name], authors: [{ login: "dependabot[bot]" }] },
        ],
        ...extra,
      });

    it("merges a registry-only dependency bump", async () => {
      const { code, text } = await lane("root-manifest");
      expect(text).toContain("dependabot lane: review record not required");
      expect(code).toBe(0);
    }, 30_000);

    it("refuses a lockfile that resolves outside the npm registry", async () => {
      const { code, text } = await lane("root-evil-lock");
      expect(code).toBe(1);
      expect(text).toContain("dependabot lane refused:");
      expect(text).toContain("outside https://registry.npmjs.org/");
      expect(text).toMatch(/FAIL {2}4\. +record/);
    }, 30_000);

    it("refuses a git resolution hidden behind a JSON-escaped key", async () => {
      const { code, text } = await lane("root-escaped-lock");
      expect(code).toBe(1);
      expect(text).toContain("dependabot lane refused:");
      expect(text).toContain("resolves outside https://registry.npmjs.org/");
      expect(text).toContain("contains a backslash");
      expect(text).toMatch(/FAIL {2}4\. +record/);
    }, 30_000);

    it("refuses a bump of a package the title does not name", async () => {
      const { code, text } = await lane("root-manifest", {
        title: "chore(deps): Bump eslint from 9.1.0 to 9.4.0",
      });
      expect(code).toBe(1);
      expect(text).toContain('does not name: "lodash"');
      expect(text).toMatch(/FAIL {2}4\. +record/);
    }, 30_000);

    it("refuses a package.json change outside the dependency maps", async () => {
      const { code, text } = await lane("root-engines", {
        files: [{ path: "package.json" }],
      });
      expect(code).toBe(1);
      expect(text).toContain("dependabot lane refused:");
      expect(text).toContain("engines");
    }, 30_000);
  });

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

// P17-66 review (M1): a PR that touches maintainer-only files never has its
// own `npm test` run on the conductor's machine, whether gate 5 refuses or
// only warns. The clean-merge check still runs.
const NOT_RUN =
  "tests not run locally: PR touches maintainer-only files; CI is the check";

describe("gate 6: no local npm test on maintainer-only paths", () => {
  const behind = { ancestorCode: 1, testCode: 0 };
  const pkgScripts = manifestText({
    scripts: { ...MANIFEST.scripts, test: "true" },
  });
  const restricted = {
    "a workflow file in the gh file list": {
      pr: greenPr({ files: [{ path: ".github/workflows/ci.yml" }] }),
      diff: [".github/workflows/ci.yml"],
    },
    "a hook file in the gh file list": {
      pr: greenPr({ files: [{ path: ".claude/hooks/guard-bash.mjs" }] }),
      diff: [".claude/hooks/guard-bash.mjs"],
    },
    "a hook file only the merge result shows": {
      pr: greenPr(),
      mergeDiff: [".claude/hooks/guard-bash.mjs"],
    },
    "a package.json scripts change": {
      pr: greenPr({ files: [{ path: "package.json" }] }),
      diff: ["package.json"],
      mergedManifest: pkgScripts,
    },
  };

  describe.each(Object.entries(restricted))("%s", (_name, setup) => {
    it("advisory (default): warns, skips npm test, still test-merges", async () => {
      const env = makeEnv({ ...behind, ...setup });
      expect(await env.execDefault(["7"])).toBe(0);
      expect(env.calls.some((c) => c.file === "npm")).toBe(false);
      expect(env.calls.some((c) => c.args.includes("merge"))).toBe(true);
      expect(env.text()).toContain(NOT_RUN);
    });

    it("--strict: refuses and skips npm test", async () => {
      const env = makeEnv({ ...behind, ...setup });
      expect(await env.execDefault(["7", "--strict"])).toBe(1);
      expect(env.calls.some((c) => c.file === "npm")).toBe(false);
      expect(env.text()).toContain(NOT_RUN);
    });
  });

  it("a conflict on a restricted-path PR is still refused (the merge check is not skipped)", async () => {
    const env = makeEnv({
      ...behind,
      mergeCode: 1,
      ...restricted["a workflow file in the gh file list"],
    });
    expect(await env.execDefault(["7"])).toBe(1);
    expect(env.text()).toMatch(/does not merge cleanly/);
    expect(env.calls.some((c) => c.file === "npm")).toBe(false);
  });

  it("an unrestricted PR that is behind still has npm test run", async () => {
    const env = makeEnv({ ...behind, pr: greenPr(), diff: ["docs/a.md"] });
    expect(await env.execDefault(["7"])).toBe(0);
    expect(env.calls.some((c) => c.file === "npm")).toBe(true);
    expect(env.text()).not.toContain(NOT_RUN);
  });

  it("an unrestricted PR whose tests fail is still refused", async () => {
    const env = makeEnv({
      ancestorCode: 1,
      testCode: 1,
      pr: greenPr(),
      diff: ["docs/a.md"],
    });
    expect(await env.execDefault(["7"])).toBe(1);
    expect(env.text()).toMatch(/npm test fails on the merged result/);
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
    const merge = env.calls.find((c) => c.args.includes("merge"));
    expect(merge.cwd).toBe(TMP);
    // The identity is passed on the command line, not read from the runner's
    // config, so a machine with no git identity still merges.
    expect(merge.args).toEqual([
      "-c",
      "user.name=merge-pr",
      "-c",
      "user.email=merge-pr@localhost",
      "-c",
      "commit.gpgsign=false",
      "merge",
      "--no-commit",
      "--no-ff",
      OID,
    ]);
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
    "playground lockfile": {
      files: [{ path: "playground/package-lock.json" }],
    },
    "hook file": { files: [{ path: ".claude/hooks/guard-bash.mjs" }] },
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
        files: [{ path: "playground/package.json" }],
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

  describe("gh pr merge exits non-zero (do not trust the exit code)", () => {
    const LOCAL_BRANCH_MESSAGE =
      "failed to delete local branch claude/x: cannot delete branch 'claude/x' used by worktree at '/repo/.claude/worktrees/x'";
    const mergeCalls = (env) =>
      env.calls.filter((c) => c.file === "gh" && c.args[1] === "merge");

    it("exits 0 and reports the note when GitHub says MERGED", async () => {
      const env = makeEnv({
        ghMergeCode: 1,
        ghMergeStderr: LOCAL_BRANCH_MESSAGE,
        postMerge: {
          state: "MERGED",
          mergedAt: "2026-10-12T00:00:00Z",
          mergeCommit: { oid: "c".repeat(40) },
          headRefOid: OID,
        },
      });
      expect(await env.exec(["7", "--execute"])).toBe(0);
      expect(env.out.join("\n")).toContain(
        `MERGED PR #7 (verified after gh exited non-zero; merge commit ccccccc). gh said: ${LOCAL_BRANCH_MESSAGE}`,
      );
      expect(env.err.join()).not.toMatch(/gh pr merge failed/);
      expect(mergeCalls(env)).toHaveLength(1);
    });

    it("exits 1 with gh's message when the PR is still OPEN", async () => {
      const env = makeEnv({
        ghMergeCode: 1,
        ghMergeStderr: LOCAL_BRANCH_MESSAGE,
        postMerge: { state: "OPEN", mergedAt: null, mergeCommit: null },
      });
      expect(await env.exec(["7", "--execute"])).toBe(1);
      expect(env.err.join()).toContain(
        `gh pr merge failed: ${LOCAL_BRANCH_MESSAGE}`,
      );
      expect(mergeCalls(env)).toHaveLength(1);
    });

    it("fails closed when the re-read itself fails", async () => {
      const env = makeEnv({
        ghMergeCode: 1,
        ghMergeStderr: LOCAL_BRANCH_MESSAGE,
        postMerge: "fail",
      });
      expect(await env.exec(["7", "--execute"])).toBe(1);
      expect(env.err.join()).toMatch(/gh pr merge failed/);
      expect(mergeCalls(env)).toHaveLength(1);
    });

    it("fails closed when MERGED but no merge commit is reported", async () => {
      const env = makeEnv({
        ghMergeCode: 1,
        postMerge: { state: "MERGED", mergedAt: "x", mergeCommit: null },
      });
      expect(await env.exec(["7", "--execute"])).toBe(1);
      expect(mergeCalls(env)).toHaveLength(1);
    });

    it("exits 1 when OPEN even with a merge commit and the matching head", async () => {
      const env = makeEnv({
        ghMergeCode: 1,
        postMerge: {
          state: "OPEN",
          mergedAt: null,
          mergeCommit: { oid: "c".repeat(40) },
          headRefOid: OID,
        },
      });
      expect(await env.exec(["7", "--execute"])).toBe(1);
      expect(env.err.join()).toMatch(/gh pr merge failed/);
      expect(mergeCalls(env)).toHaveLength(1);
    });

    it("exits 1 when the re-read exits non-zero, even with valid MERGED JSON", async () => {
      const env = makeEnv({
        ghMergeCode: 1,
        postMergeCode: 1,
        postMerge: {
          state: "MERGED",
          mergedAt: "x",
          mergeCommit: { oid: "c".repeat(40) },
          headRefOid: OID,
        },
      });
      expect(await env.exec(["7", "--execute"])).toBe(1);
      expect(env.err.join()).toMatch(/gh pr merge failed/);
      expect(mergeCalls(env)).toHaveLength(1);
    });

    it("exits 1 naming the mismatch when merged at a different head", async () => {
      const env = makeEnv({
        ghMergeCode: 1,
        postMerge: {
          state: "MERGED",
          mergedAt: "x",
          mergeCommit: { oid: "c".repeat(40) },
          headRefOid: "d".repeat(40),
        },
      });
      expect(await env.exec(["7", "--execute"])).toBe(1);
      expect(env.err.join()).toContain(
        `PR is merged at a different head than the one reviewed: ddddddd, expected ${OID.slice(0, 7)}`,
      );
      expect(env.out.join("\n")).not.toMatch(/MERGED PR/);
      expect(mergeCalls(env)).toHaveLength(1);
    });

    it("exits 1 when MERGED but headRefOid is missing", async () => {
      const env = makeEnv({
        ghMergeCode: 1,
        postMerge: {
          state: "MERGED",
          mergedAt: "x",
          mergeCommit: { oid: "c".repeat(40) },
        },
      });
      expect(await env.exec(["7", "--execute"])).toBe(1);
      expect(env.err.join()).toMatch(/merged at a different head/);
      expect(mergeCalls(env)).toHaveLength(1);
    });

    it("verifies a merge that carries the approval --body, and keeps the approval note", async () => {
      const text = "i approve merging PR 7 with the workflow change";
      const env = makeEnv({
        pr: greenPr({ files: [{ path: ".github/workflows/ci.yml" }] }),
        ghMergeCode: 1,
        ghMergeStderr: LOCAL_BRANCH_MESSAGE,
        postMerge: {
          state: "MERGED",
          mergedAt: "2026-10-12T00:00:00Z",
          mergeCommit: { oid: "c".repeat(40) },
          headRefOid: OID,
        },
      });
      expect(
        await env.exec(["7", "--execute", "--maintainer-approved", text]),
      ).toBe(0);
      const [merge] = mergeCalls(env);
      expect(mergeCalls(env)).toHaveLength(1);
      expect(merge.args).toContain("--body");
      expect(env.out.join("\n")).toContain(
        "MERGED PR #7 (verified after gh exited non-zero; merge commit ccccccc)",
      );
      expect(env.out).toContain(`maintainer-approved: ${text}`);
    });

    it("still refuses a different head when the merge carried the approval --body", async () => {
      const env = makeEnv({
        pr: greenPr({ files: [{ path: ".github/workflows/ci.yml" }] }),
        ghMergeCode: 1,
        postMerge: {
          state: "MERGED",
          mergedAt: "x",
          mergeCommit: { oid: "c".repeat(40) },
          headRefOid: "d".repeat(40),
        },
      });
      expect(
        await env.exec([
          "7",
          "--execute",
          "--maintainer-approved",
          "i approve merging PR 7 with the workflow change",
        ]),
      ).toBe(1);
      expect(mergeCalls(env)[0].args).toContain("--body");
      expect(env.err.join()).toMatch(/merged at a different head/);
      expect(mergeCalls(env)).toHaveLength(1);
    });

    it("a verified merge reports the advisory warnings count like a normal merge (P17-66)", async () => {
      const env = makeEnv({
        pr: greenPr({ files: [{ path: ".github/workflows/ci.yml" }] }),
        ghMergeCode: 1,
        ghMergeStderr: LOCAL_BRANCH_MESSAGE,
        postMerge: {
          state: "MERGED",
          mergedAt: "2026-10-12T00:00:00Z",
          mergeCommit: { oid: "c".repeat(40) },
          headRefOid: OID,
        },
      });
      expect(await env.execDefault(["7", "--execute"])).toBe(0);
      expect(env.out.join("\n")).toContain(
        `MERGED PR #7 (verified after gh exited non-zero; merge commit ccccccc) with 1 warning. gh said: ${LOCAL_BRANCH_MESSAGE}`,
      );
      expect(mergeCalls(env)).toHaveLength(1);
    });

    it("leaves a successful merge unchanged: one merge call, no extra re-read", async () => {
      const env = makeEnv();
      expect(await env.exec(["7", "--execute"])).toBe(0);
      expect(env.text()).toMatch(/MERGED PR #7/);
      expect(mergeCalls(env)).toHaveLength(1);
      expect(
        env.calls.some((c) => c.args.join(" ").includes("state,mergedAt,")),
      ).toBe(false);
    });
  });
});

describe("advisory gates by default (P17-66)", () => {
  const red = { name: "e2e", status: "COMPLETED", conclusion: "FAILURE" };
  const workflow = { files: [{ path: ".github/workflows/ci.yml" }] };
  const paperwork = {
    "a missing review record": [{ body: "Looks fine to me." }, "4", "record"],
    "a missing audit-trail comment": [{ comments: [] }, "4b", "audit"],
    "a maintainer-only file": [workflow, "5", "files"],
  };
  const gateLine = (status, num, id) =>
    new RegExp(`${status} {2}${num}\\.? +${id}`);

  it.each(Object.entries(paperwork))(
    "merges with %s and prints a WARN line",
    async (_name, [overrides, num, id]) => {
      const env = makeEnv({ pr: greenPr(overrides) });
      expect(await env.execDefault(["7", "--execute"])).toBe(0);
      expect(env.merged()).toBe(true);
      expect(env.text()).toMatch(gateLine("WARN", num, id));
      expect(env.text()).not.toMatch(/FAIL/);
      expect(env.text()).not.toMatch(/REFUSED/);
      expect(env.text()).toMatch(/WARN: 1 warning \(/);
      expect(env.text()).toMatch(/MERGED PR #7 .* with 1 warning\./);
    },
  );

  it("a dry run passes with exit 0, counts the warnings and merges nothing", async () => {
    const env = makeEnv({
      pr: greenPr({ body: "no record", comments: [], ...workflow }),
    });
    expect(await env.execDefault(["7"])).toBe(0);
    expect(env.merged()).toBe(false);
    const text = env.text();
    expect(text).toContain("WARN: 3 warnings (record, audit, files)");
    expect(text).toMatch(
      /No gate refuses \(3 warnings\)\. Dry run: nothing merged/,
    );
    expect(text).toMatch(/PASS {2}1\. +state/);
    expect(text).toMatch(/PASS {2}6\. +merge/);
  });

  it("a WARN line still lists what was found", async () => {
    const env = makeEnv({ pr: greenPr(workflow) });
    await env.execDefault(["7"]);
    expect(env.text()).toContain(
      "touches .github/workflows/ci.yml: maintainer merges this one",
    );
  });

  it("also warns, not refuses, for files that only git reports", async () => {
    const env = makeEnv({
      diff: [".github/workflows/ci.yml"],
      mergeDiff: [".claude/hooks/guard-bash.mjs"],
    });
    expect(await env.execDefault(["7", "--execute"])).toBe(0);
    expect(env.text()).toMatch(gateLine("WARN", "5", "files"));
    expect(env.text()).toContain("touches .claude/hooks/guard-bash.mjs");
  });

  it("a clean PR has no warnings and says so as before", async () => {
    const env = makeEnv();
    expect(await env.execDefault(["7"])).toBe(0);
    expect(env.text()).not.toMatch(/WARN/);
    expect(env.text()).toContain("All gates pass. Dry run: nothing merged.");
  });

  it("a warning alone does not skip the slow test run on a branch that is behind", async () => {
    const env = makeEnv({
      pr: greenPr({ body: "no record" }),
      ancestorCode: 1,
    });
    expect(await env.execDefault(["7"])).toBe(0);
    expect(env.calls.some((c) => c.file === "npm")).toBe(true);
  });

  describe("the gates that protect main still refuse by default", () => {
    const blocking = {
      "gate 1 (draft)": [{ isDraft: true }, "1", "state"],
      "gate 2 (red check)": [{ statusCheckRollup: [red] }, "2", "checks"],
      "gate 3 (changes requested)": [
        { reviewDecision: "CHANGES_REQUESTED" },
        "3",
        "review",
      ],
    };

    it.each(Object.entries(blocking))(
      "%s refuses",
      async (_name, [overrides, num, id]) => {
        // No review record and a workflow file as well: the refusal is the
        // blocking gate's, and the warnings are reported next to it.
        const env = makeEnv({
          pr: greenPr({ body: "no record", ...workflow, ...overrides }),
        });
        expect(await env.execDefault(["7", "--execute"])).toBe(1);
        expect(env.text()).toMatch(gateLine("FAIL", num, id));
        expect(env.text()).toMatch(/REFUSED: 1 of 7 gates failed/);
        expect(env.text()).toMatch(/plus 2 warnings/);
        expect(env.merged()).toBe(false);
      },
    );

    it("gate 6 (merge conflict) refuses", async () => {
      const env = makeEnv({ mergeCode: 1 });
      expect(await env.execDefault(["7", "--execute"])).toBe(1);
      expect(env.text()).toMatch(gateLine("FAIL", "6", "merge"));
      expect(env.merged()).toBe(false);
    });

    it("gate 6 (npm test fails on a branch that is behind) refuses", async () => {
      const env = makeEnv({ ancestorCode: 1, testCode: 1 });
      expect(await env.execDefault(["7", "--execute"])).toBe(1);
      expect(env.text()).toMatch(gateLine("FAIL", "6", "merge"));
      expect(env.merged()).toBe(false);
    });
  });

  describe("--strict refuses exactly as before", () => {
    it.each(Object.entries(paperwork))(
      "%s",
      async (_name, [overrides, num, id]) => {
        const env = makeEnv({ pr: greenPr(overrides) });
        expect(await env.execDefault(["7", "--execute", "--strict"])).toBe(1);
        expect(env.text()).toMatch(gateLine("FAIL", num, id));
        expect(env.text()).toMatch(/REFUSED: 1 of 7 gates failed/);
        expect(env.text()).not.toMatch(/WARN/);
        expect(env.merged()).toBe(false);
      },
    );

    it("takes the flag in any position and says so in the header", async () => {
      const env = makeEnv({ pr: greenPr(workflow) });
      expect(await env.execDefault(["--strict", "7"])).toBe(1);
      expect(env.text()).toContain("PR #7 (dry run, strict)");
    });

    it("a clean PR still merges", async () => {
      const env = makeEnv();
      expect(await env.execDefault(["7", "--execute", "--strict"])).toBe(0);
      expect(env.merged()).toBe(true);
    });
  });

  describe("--maintainer-approved is accepted and does nothing without --strict", () => {
    const TEXT = "i approve merging PR 7 with the workflow change";

    it("merges with a warning, records nothing and passes no --body", async () => {
      const env = makeEnv({ pr: greenPr(workflow) });
      expect(
        await env.execDefault([
          "7",
          "--execute",
          "--maintainer-approved",
          TEXT,
        ]),
      ).toBe(0);
      const merge = env.calls.find(
        (c) => c.file === "gh" && c.args[1] === "merge",
      );
      expect(merge.args).not.toContain("--body");
      expect(env.text()).toMatch(gateLine("WARN", "5", "files"));
      expect(env.text()).toContain("nothing is recorded");
      expect(env.text()).not.toContain("overrode:");
    });

    it("still validates the text (a short one exits 2)", async () => {
      const env = makeEnv();
      expect(
        await env.execDefault(["7", "--maintainer-approved", "short"]),
      ).toBe(2);
    });
  });

  it("--help documents the modes", async () => {
    const env = makeEnv();
    expect(await env.execDefault(["--help"])).toBe(0);
    expect(env.text()).toMatch(/--strict/);
    expect(env.text()).toMatch(/ADVISORY/);
    expect(env.text()).toMatch(/'N warnings' count/);
    expect(env.text()).toMatch(/Gates 1, 2, 3 and 6/);
  });

  it("an unknown flag is still a usage error", async () => {
    const env = makeEnv();
    expect(await env.execDefault(["7", "--lenient"])).toBe(2);
    expect(env.calls).toHaveLength(0);
  });

  it("the header explains the modes", () => {
    const source = readFileSync(
      path.join(process.cwd(), "scripts/merge-pr.mjs"),
      "utf8",
    );
    const header = source.split("\nimport ")[0].replace(/\n\/\/ ?/g, " ");
    expect(header).toMatch(/ADVISORY/);
    expect(header).toMatch(/`--strict` restores/);
    expect(header).toMatch(/N warnings/);
  });
});

describe("--maintainer-approved", () => {
  const TEXT = "i approve merging PR 7 with the workflow change";
  const workflowPr = (overrides = {}) =>
    greenPr({ files: [{ path: ".github/workflows/ci.yml" }], ...overrides });
  const FLAG = "--maintainer-approved";

  it("main exits 2 and runs nothing when the value is missing, short or repeated", async () => {
    for (const argv of [
      ["7", FLAG],
      ["7", FLAG, "--execute"],
      ["7", "--execute", FLAG],
      ["7", FLAG, ""],
      ["7", FLAG, "too short"],
      ["7", FLAG, "   padded 9   "],
      ["7", FLAG, "\x1b\x1b\x1b\x1b\x1b\x1b\x1b\x1b\x1b\x1b\x1b\x1b"],
      ["7", `${FLAG}=short`],
      ["7", FLAG, TEXT, FLAG, TEXT],
      ["7", FLAG, TEXT, "extra"],
    ]) {
      const env = makeEnv({ pr: workflowPr() });
      expect(await env.exec(argv), JSON.stringify(argv)).toBe(2);
      expect(env.calls, JSON.stringify(argv)).toHaveLength(0);
    }
  });

  it("accepts exactly 10 characters after trimming, in both spellings", async () => {
    for (const argv of [
      ["7", FLAG, "  0123456789  "],
      ["7", `${FLAG}=0123456789`],
    ]) {
      const env = makeEnv({ pr: workflowPr() });
      expect(await env.exec(argv), JSON.stringify(argv)).toBe(0);
    }
  });

  it("without the flag the same PR is refused", async () => {
    const env = makeEnv({ pr: workflowPr() });
    expect(await env.exec(["7", "--execute"])).toBe(1);
    expect(env.text()).toMatch(/FAIL {2}5\. +files/);
  });

  it("turns the gate 5 failure into a PASS with a visible note (dry run stays dry)", async () => {
    const env = makeEnv({ pr: workflowPr() });
    expect(await env.exec(["7", FLAG, TEXT])).toBe(0);
    const text = env.text();
    expect(text).toMatch(/PASS {2}5\. +files/);
    expect(text).toContain(`maintainer-approved: ${TEXT}`);
    expect(text).toContain(
      "overrode: touches .github/workflows/ci.yml: maintainer merges this one",
    );
    expect(text).toMatch(/Dry run: nothing merged/);
    expect(env.merged()).toBe(false);
  });

  it("merges with --execute and repeats the text in the merge output", async () => {
    const env = makeEnv({ pr: workflowPr() });
    expect(await env.exec(["7", "--execute", FLAG, TEXT])).toBe(0);
    expect(env.merged()).toBe(true);
    const lines = env.text().split("\n");
    const merged = lines.findIndex((l) => l.startsWith("MERGED PR #7"));
    expect(lines[merged + 1]).toBe(`maintainer-approved: ${TEXT}`);
  });

  it("also overrides files that only git reports (three-dot and merge result)", async () => {
    const env = makeEnv({
      pr: greenPr(),
      diff: [".github/workflows/ci.yml"],
      mergeDiff: [".claude/hooks/guard-bash.mjs"],
    });
    expect(await env.exec(["7", "--execute", FLAG, TEXT])).toBe(0);
    expect(env.text()).toContain(
      "overrode: touches .claude/hooks/guard-bash.mjs",
    );
    expect(env.text()).toContain("overrode: touches .github/workflows/ci.yml");
  });

  it("does not run npm test on a restricted-path PR that is behind, but still test-merges it", async () => {
    const env = makeEnv({ pr: workflowPr(), ancestorCode: 1 });
    expect(await env.exec(["7", FLAG, TEXT])).toBe(0);
    expect(env.calls.some((c) => c.file === "npm")).toBe(false);
    expect(env.calls.some((c) => c.args.includes("merge"))).toBe(true);
    expect(env.text()).toContain(NOT_RUN);
  });

  it("truncates to 200 characters and strips control characters", async () => {
    const env = makeEnv({ pr: workflowPr() });
    const long = `ok\x1b[31m\nline two ${"a".repeat(300)}`;
    expect(await env.exec(["7", FLAG, long])).toBe(0);
    const line = env.out.find((l) => l.startsWith("maintainer-approved: "));
    // eslint-disable-next-line no-control-regex -- asserting they are gone
    expect(line).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/);
    expect(line).toContain("ok [31m line two ");
    expect(line.length).toBe("maintainer-approved: ".length + 200 + 3);
    expect(line.endsWith("...")).toBe(true);
    expect(cleanApprovalText("  a\x00b\x7fc  ")).toBe("a b c");
  });

  it("is a record only when no file needs it, and still prints the text", async () => {
    const env = makeEnv();
    expect(await env.exec(["7", FLAG, TEXT])).toBe(0);
    expect(env.text()).toContain(`maintainer-approved: ${TEXT}`);
    expect(env.text()).not.toContain("overrode:");
  });

  describe("bypasses gate 5 only", () => {
    const red = { name: "e2e", status: "COMPLETED", conclusion: "FAILURE" };
    const others = {
      "gate 1 (draft)": [{ isDraft: true }, "state"],
      "gate 2 (red check)": [{ statusCheckRollup: [red] }, "checks"],
      "gate 3 (changes requested)": [
        { reviewDecision: "CHANGES_REQUESTED" },
        "review",
      ],
      "gate 4 (no review record)": [{ body: "Looks fine to me." }, "record"],
      "gate 4b (no audit comment)": [{ comments: [] }, "audit"],
    };

    it.each(Object.entries(others))(
      "%s still refuses",
      async (_name, [overrides, id]) => {
        const env = makeEnv({ pr: workflowPr(overrides) });
        expect(await env.exec(["7", "--execute", FLAG, TEXT])).toBe(1);
        expect(env.text()).toMatch(new RegExp(`FAIL {2}\\w+\\. +${id}`));
        expect(env.text()).toMatch(/PASS {2}5\. +files/);
        expect(env.merged()).toBe(false);
      },
    );

    it("gate 6 (merge conflict) still refuses", async () => {
      const env = makeEnv({ pr: workflowPr(), mergeCode: 1 });
      expect(await env.exec(["7", "--execute", FLAG, TEXT])).toBe(1);
      expect(env.text()).toMatch(/FAIL {2}6\. +merge/);
      expect(env.merged()).toBe(false);
    });

    it("a closed PR still refuses", async () => {
      const env = makeEnv({ pr: workflowPr({ state: "CLOSED" }) });
      expect(await env.exec(["7", "--execute", FLAG, TEXT])).toBe(1);
      expect(env.merged()).toBe(false);
    });
  });

  it("--help documents the flag as an honour-system record", async () => {
    const env = makeEnv();
    await env.exec(["--help"]);
    expect(env.text()).toContain("--maintainer-approved");
    expect(env.text()).toMatch(/honour-system record, not authentication/);
  });
});

describe("Dependabot lane", () => {
  const bot = { login: "dependabot[bot]", is_bot: true };
  const MANIFESTS = [{ path: "package.json" }, { path: "package-lock.json" }];
  const botPr = (overrides = {}) =>
    greenPr({
      author: bot,
      title: "chore(deps): Bump lodash from 4.17.20 to 4.17.21",
      body: "Bumps [lodash](https://github.com/lodash/lodash) from 4.17.20 to 4.17.21.",
      comments: [],
      files: MANIFESTS,
      commits: [{ oid: OID, authors: [{ login: "dependabot[bot]" }] }],
      ...overrides,
    });
  const env = (pr, extra = {}) =>
    makeEnv({
      pr,
      diff: ["package.json", "package-lock.json"],
      baseManifest: laneBase(),
      mergedManifest: laneMerged(namedBy(pr)),
      ...extra,
    });

  it("reads the author and the title from gh", () => {
    expect(PR_FIELDS.split(",")).toEqual(
      expect.arrayContaining(["author", "title"]),
    );
  });

  it.each([
    ["a patch bump", "Bump lodash from 4.17.20 to 4.17.21"],
    ["a minor bump", "chore(deps): Bump eslint from 9.1.0 to 9.4.2"],
    ["a minor bump with a v prefix", "Bump x from v1.2.3 to v1.9.0"],
    [
      "a bump with a group suffix",
      "chore(deps): Bump x from 2.0.2 to 2.9.0 in the npm-minor-patch group",
    ],
  ])(
    "merges %s with no review record and no audit comment",
    async (_n, title) => {
      const e = env(botPr({ title }));
      expect(await e.exec(["7", "--execute"])).toBe(0);
      expect(e.merged()).toBe(true);
      expect(e.text()).toMatch(/PASS {2}4\. +record/);
      expect(e.text()).toMatch(/PASS {2}4b\. +audit/);
      expect(e.text()).toContain("dependabot lane: review record not required");
      expect(e.text()).toContain("dependabot lane: audit comment not required");
    },
  );

  it("accepts the author spelling gh prints (app/dependabot)", async () => {
    const e = env(botPr({ author: { login: "app/dependabot", is_bot: true } }));
    expect(await e.exec(["7"])).toBe(0);
  });

  it("refuses a lockfile-only change: nothing ties it to the named package", async () => {
    const e = makeEnv({
      pr: botPr({ files: [{ path: "package-lock.json" }] }),
      diff: ["package-lock.json"],
    });
    expect(await e.exec(["7", "--execute"])).toBe(1);
    expect(e.text()).toContain("dependabot lane refused:");
    expect(e.text()).toContain("changes no dependency version");
    expect(e.merged()).toBe(false);
  });

  it.each([
    [
      "a major bump",
      "Bump jsdom from 24.1.3 to 30.1.2",
      /a major version change/,
    ],
    [
      "a major bump of an action",
      "Bump actions/cache from 4 to 6",
      /not a plain major\.minor\.patch/,
    ],
    [
      "a pre-release",
      "Bump x from 1.0.0 to 1.1.0-beta.1",
      /pre-release or unparseable/,
    ],
    [
      "a pre-release origin",
      "Bump x from 1.0.0-rc.1 to 1.0.0",
      /pre-release or unparseable/,
    ],
    ["a two-part version", "Bump x from 1.2 to 1.3", /unparseable/],
    ["a downgrade", "Bump x from 1.5.0 to 1.4.0", /not an increase/],
    ["no change", "Bump x from 1.5.0 to 1.5.0", /not an increase/],
    ["a non-bump title", "Update lodash", /title is not/],
    [
      "a multi-package title with no versions",
      "chore(deps): Bump react-dom and @types/react-dom in /playground",
      /title is not/,
    ],
  ])("refuses %s and says why", async (_n, title, why) => {
    const e = env(botPr({ title }));
    expect(await e.exec(["7", "--execute"])).toBe(1);
    expect(e.text()).toMatch(/FAIL {2}4\. +record/);
    expect(e.text()).toMatch(/FAIL {2}4b\. +audit/);
    expect(e.text()).toMatch(why);
    expect(e.text()).toContain("dependabot lane refused:");
    expect(e.merged()).toBe(false);
  });

  it.each([
    [
      "a human with a dependabot-like title",
      { login: "someone", is_bot: false },
    ],
    ["a look-alike login", { login: "dependabot", is_bot: false }],
    [
      "a look-alike bot name",
      { login: "dependabot-preview[bot]", is_bot: true },
    ],
    [
      "a login with the right name but is_bot false",
      { login: "dependabot[bot]", is_bot: false },
    ],
    ["a missing author", undefined],
  ])("refuses %s", async (_n, author) => {
    const e = env(botPr({ author }));
    expect(await e.exec(["7", "--execute"])).toBe(1);
    expect(e.text()).toMatch(/FAIL {2}4\. +record/);
    expect(e.text()).toMatch(/FAIL {2}4b\. +audit/);
    expect(e.text()).not.toContain("dependabot lane");
    expect(e.merged()).toBe(false);
  });

  it("refuses when gh lists an extra file", async () => {
    const e = env(botPr({ files: [...MANIFESTS, { path: "src/app.js" }] }));
    expect(await e.exec(["7", "--execute"])).toBe(1);
    expect(e.text()).toMatch(/FAIL {2}4\. +record/);
    expect(e.text()).toContain("touches files other than package.json");
    expect(e.merged()).toBe(false);
  });

  it("refuses when only the merge result shows an extra file", async () => {
    const e = makeEnv({
      pr: botPr(),
      diff: ["package.json"],
      mergeDiff: ["package.json", "src/app.js"],
    });
    expect(await e.exec(["7", "--execute"])).toBe(1);
    expect(e.text()).toMatch(/FAIL {2}4\. +record/);
    expect(e.text()).toMatch(/FAIL {2}4b\. +audit/);
    expect(e.text()).toContain("touches files other than package.json");
    expect(e.merged()).toBe(false);
  });

  it("refuses the playground manifests (outside the two root files)", async () => {
    const e = makeEnv({
      pr: botPr({
        title: "Bump x from 1.0.0 to 1.0.1 in /playground",
        files: [{ path: "playground/package.json" }],
      }),
      diff: ["playground/package.json"],
    });
    expect(await e.exec(["7", "--execute"])).toBe(1);
    expect(e.text()).toMatch(/FAIL {2}4\. +record/);
    expect(e.text()).toMatch(/FAIL {2}5\. +files/);
  });

  it("refuses a GitHub Actions bump, with or without --maintainer-approved for gates 4 and 4b", async () => {
    const pr = botPr({
      title: "chore(deps): Bump actions/cache from 4.0.0 to 4.1.0",
      files: [{ path: ".github/workflows/ci.yml" }],
    });
    const plain = makeEnv({ pr, diff: [".github/workflows/ci.yml"] });
    expect(await plain.exec(["7", "--execute"])).toBe(1);
    expect(plain.text()).toMatch(/FAIL {2}5\. +files/);
    expect(plain.text()).toMatch(/FAIL {2}4\. +record/);

    const approved = makeEnv({ pr, diff: [".github/workflows/ci.yml"] });
    expect(
      await approved.exec([
        "7",
        "--execute",
        "--maintainer-approved",
        "approved in chat for this actions bump",
      ]),
    ).toBe(1);
    expect(approved.text()).toMatch(/PASS {2}5\. +files/);
    expect(approved.text()).toMatch(/FAIL {2}4\. +record/);
    expect(approved.merged()).toBe(false);
  });

  it("still needs green checks, a clean test-merge and no changes requested", async () => {
    const red = { name: "e2e", status: "COMPLETED", conclusion: "FAILURE" };
    for (const [overrides, extra, id] of [
      [{ statusCheckRollup: [red] }, {}, "checks"],
      [{ reviewDecision: "CHANGES_REQUESTED" }, {}, "review"],
      [{ isDraft: true }, {}, "state"],
      [{}, { mergeCode: 1 }, "merge"],
    ]) {
      const e = env(botPr(overrides), extra);
      expect(await e.exec(["7", "--execute"]), id).toBe(1);
      expect(e.text(), id).toMatch(new RegExp(`FAIL {2}\\w+\\. +${id}`));
      expect(e.merged(), id).toBe(false);
    }
  });

  it("does not make a human PR on package.json skip the review record", async () => {
    const e = env(
      greenPr({ comments: [], body: "no record", files: MANIFESTS }),
    );
    expect(await e.exec(["7", "--execute"])).toBe(1);
    expect(e.text()).toMatch(/FAIL {2}4\. +record/);
  });

  describe("group PRs", () => {
    const groupBody = (...lines) =>
      [
        "Bumps the npm-minor-patch group with 2 updates in the / directory.",
        "",
        ...lines,
      ].join("\n");
    const groupTitle =
      "chore(deps): Bump the npm-minor-patch group with 2 updates";

    it("merges when the body lists every update and all are patch/minor", async () => {
      const e = env(
        botPr({
          title: groupTitle,
          body: groupBody(
            "Updates `eslint` from 9.1.0 to 9.4.0",
            "<details>",
            "Updates `prettier` from 3.0.0 to 3.0.3",
          ),
        }),
      );
      expect(await e.exec(["7", "--execute"])).toBe(0);
      expect(e.text()).toContain("eslint 9.1.0 -> 9.4.0");
    });

    it.each([
      [
        "a major bump hidden in the group",
        groupTitle,
        groupBody(
          "Updates `eslint` from 9.1.0 to 9.4.0",
          "Updates `prettier` from 3.0.0 to 4.0.0",
        ),
        /a major version change/,
      ],
      [
        "a body that lists fewer updates than the title",
        groupTitle,
        groupBody("Updates `eslint` from 9.1.0 to 9.4.0"),
        /title says 2 updates but the body lists 1/,
      ],
      [
        "a body that lists more updates than the title",
        groupTitle,
        groupBody(
          "Updates `a` from 1.0.0 to 1.0.1",
          "Updates `b` from 1.0.0 to 1.0.1",
          "Updates `c` from 1.0.0 to 1.0.1",
        ),
        /title says 2 updates but the body lists 3/,
      ],
      [
        "a body with no Updates lines",
        groupTitle,
        "Bumps the group.",
        /no "Updates/,
      ],
      [
        "a title with no update count",
        "chore(deps): Bump the npm-minor-patch group",
        groupBody("Updates `a` from 1.0.0 to 1.0.1"),
        /does not say how many updates/,
      ],
    ])("refuses %s", async (_n, title, body, why) => {
      const e = env(botPr({ title, body }));
      expect(await e.exec(["7", "--execute"])).toBe(1);
      expect(e.text()).toMatch(why);
      expect(e.text()).toMatch(/FAIL {2}4\. +record/);
      expect(e.merged()).toBe(false);
    });
  });

  describe("bumpProblem and dependabotLane", () => {
    it("accepts patch and minor increases only", () => {
      expect(bumpProblem("x", "1.2.3", "1.2.4")).toBeNull();
      expect(bumpProblem("x", "1.2.3", "1.3.0")).toBeNull();
      expect(bumpProblem("x", "1.2.3", "1.10.0")).toBeNull();
      expect(bumpProblem("x", "1.2.3", "2.0.0")).toMatch(/major/);
      expect(bumpProblem("x", "0.9.0", "1.0.0")).toMatch(/major/);
      expect(bumpProblem("x", "1.2.3", "1.2.3-rc.1")).toMatch(/pre-release/);
      expect(bumpProblem("x", "1.2.3", "1.2.3+build")).toMatch(/pre-release/);
      expect(bumpProblem("x", "1.3.0", "1.2.9")).toMatch(/not an increase/);
    });

    it("is not applicable to a PR from anyone else", () => {
      expect(dependabotLane(greenPr())).toEqual({
        author: false,
        eligible: false,
        reasons: [],
        summary: "",
      });
    });
  });
});

describe("review fixes (P17-65): F1 Dependabot lane content", () => {
  const bot = { login: "dependabot[bot]", is_bot: true };
  const MANIFESTS = [{ path: "package.json" }, { path: "package-lock.json" }];
  const authored = (...logins) => ({
    oid: OID,
    authors: logins.map((login) => ({ login })),
  });
  const botPr = (overrides = {}) =>
    greenPr({
      author: bot,
      title: "chore(deps): Bump lodash from 4.17.20 to 4.17.21",
      body: "Bumps lodash.",
      comments: [],
      files: MANIFESTS,
      commits: [authored("dependabot[bot]")],
      ...overrides,
    });
  const env = (pr, extra = {}) =>
    makeEnv({ pr, diff: ["package.json", "package-lock.json"], ...extra });
  const refused = async (e, why) => {
    expect(await e.exec(["7", "--execute"])).toBe(1);
    expect(e.text()).toContain("dependabot lane refused:");
    expect(e.text()).toMatch(why);
    expect(e.text()).toMatch(/FAIL {2}4\. +record/);
    expect(e.text()).toMatch(/FAIL {2}4b\. +audit/);
    expect(e.merged()).toBe(false);
  };

  describe("(a) every commit must be authored by dependabot", () => {
    it("accepts both spellings of the bot, across several commits", async () => {
      const commits = [
        { oid: "c".repeat(40), authors: [{ login: "app/dependabot" }] },
        authored("dependabot[bot]"),
      ];
      const e = env(botPr({ commits }));
      expect(await e.exec(["7", "--execute"])).toBe(0);
      expect(e.merged()).toBe(true);
    });

    it.each([
      [
        "a human commit pushed onto the branch",
        [authored("dependabot[bot]"), authored("someone")],
      ],
      [
        "a human commit first",
        [
          { oid: "c".repeat(40), authors: [{ login: "someone" }] },
          authored("dependabot[bot]"),
        ],
      ],
      [
        "a foreign author on a middle commit, the last being dependabot",
        [
          { oid: "c".repeat(40), authors: [{ login: "dependabot[bot]" }] },
          { oid: "d".repeat(40), authors: [{ login: "someone" }] },
          authored("dependabot[bot]"),
        ],
      ],
      ["a human co-author", [authored("dependabot[bot]", "someone")]],
      ["a look-alike login", [authored("dependabot")]],
      ["a commit with no authors", [{ oid: OID, authors: [] }]],
      ["a commit with no author list", [{ oid: OID }]],
      ["an author with no login", [{ oid: OID, authors: [{ name: "x" }] }]],
    ])("refuses %s", async (_n, commits) => {
      await refused(
        env(botPr({ commits })),
        /not authored by dependabot|no author/,
      );
    });

    it.each([
      ["a missing commit list", undefined, /missing/],
      ["an empty commit list", [], /missing/],
      ["a list that is not an array", "dependabot", /missing/],
      [
        "a list that does not end at the head commit",
        [{ oid: "d".repeat(40), authors: [{ login: "dependabot[bot]" }] }],
        /does not end at the head commit/,
      ],
      [
        "a list whose last commit is dependabot's but not the head",
        [
          authored("dependabot[bot]"),
          { oid: "d".repeat(40), authors: [{ login: "dependabot[bot]" }] },
        ],
        /does not end at the head commit/,
      ],
      [
        "a list of 100 (gh may have truncated it)",
        Array.from({ length: 99 }, () => ({
          oid: "c".repeat(40),
          authors: [{ login: "dependabot[bot]" }],
        })).concat(authored("dependabot[bot]")),
        /too many commits/,
      ],
    ])("fails closed on %s", async (_n, commits, why) => {
      await refused(env(botPr({ commits })), why);
    });

    it("fails closed when the PR data has no head commit to match", async () => {
      await refused(
        env(botPr({ headRefOid: undefined })),
        /does not end at the head commit|looks unsafe or is missing/,
      );
    });

    it("dependabotCommitProblems checks the head commit and an empty list on its own", () => {
      const bots = (...oids) =>
        oids.map((oid) => ({ oid, authors: [{ login: "dependabot[bot]" }] }));
      const head = "e".repeat(40);
      const other = "f".repeat(40);
      expect(
        dependabotCommitProblems({
          headRefOid: head,
          commits: bots(other, head),
        }),
      ).toEqual([]);
      expect(
        dependabotCommitProblems({
          headRefOid: head,
          commits: bots(head, other),
        }),
      ).toEqual([expect.stringMatching(/does not end at the head commit/)]);
      expect(
        dependabotCommitProblems({
          headRefOid: undefined,
          commits: bots(head),
        }),
      ).toEqual([expect.stringMatching(/does not end at the head commit/)]);
      expect(
        dependabotCommitProblems({ headRefOid: head, commits: [] }),
      ).toEqual(["commit authors are missing from the PR data"]);
      expect(
        dependabotCommitProblems({
          headRefOid: head,
          commits: [
            ...bots(other),
            { oid: other, authors: [{ login: "someone" }] },
            ...bots(head),
          ],
        }),
      ).toEqual([
        expect.stringMatching(/not authored by dependabot \("someone"\)/),
      ]);
    });

    it("dependabotCommitProblems is pure and reports each case", () => {
      expect(dependabotCommitProblems(botPr())).toEqual([]);
      expect(
        dependabotCommitProblems(botPr({ commits: [authored("x")] })),
      ).toHaveLength(1);
      expect(dependabotCommitProblems(botPr({ commits: null }))).toHaveLength(
        1,
      );
    });
  });

  describe("(b) the lockfile and package.json diff", () => {
    const patch = (...added) =>
      [
        "diff --git a/package-lock.json b/package-lock.json",
        "--- a/package-lock.json",
        "+++ b/package-lock.json",
        "@@ -1 +1 @@",
        ...added.map((line) => `+${line}`),
        "",
      ].join("\n");

    it("asks git for exactly the three-dot patch of the two manifests", async () => {
      const e = env(botPr());
      await e.exec(["7"]);
      const call = e.calls.find(
        (c) => c.args[0] === "diff" && c.args.includes("package-lock.json"),
      );
      expect(call.args).toEqual([
        "diff",
        "--no-renames",
        `origin/main...${OID}`,
        "--",
        "package-lock.json",
        "package.json",
      ]);
    });

    it("accepts a registry-only lockfile, and ignores removed lines", async () => {
      const e = env(botPr(), {
        lockPatch:
          patch(
            '      "resolved": "https://registry.npmjs.org/a/-/a-1.0.1.tgz",',
          ) + '-      "resolved": "git+ssh:\\u002f\\u002fold/removed.git",\n',
      });
      expect(await e.exec(["7", "--execute"])).toBe(0);
    });

    it("refuses when the patch cannot be read", async () => {
      await refused(
        env(botPr(), { lockPatchCode: 128 }),
        /could not read the lockfile patch/,
      );
    });

    it("lockfilePatchProblems flags a backslash on an added line only", () => {
      expect(lockfilePatchProblems(BENIGN_PATCH)).toEqual([]);
      expect(lockfilePatchProblems("")).toEqual([]);
      expect(
        lockfilePatchProblems(patch('"\\u0072esolved": "x"')),
      ).toHaveLength(1);
      expect(lockfilePatchProblems('-  "a": "\\u0072"\n')).toEqual([]);
      // The "+++" file header is not an added line.
      expect(lockfilePatchProblems("+++ b/package-lock.json\n")).toEqual([]);
    });

    it.each([
      ["scripts", { scripts: { ...MANIFEST.scripts, postinstall: "sh x" } }],
      ["bin", { bin: { x: "./x.js" } }],
      ["overrides", { overrides: { lodash: "1.0.0" } }],
      ["engines", { engines: { node: ">=1" } }],
      ["main", { main: "evil.js" }],
      ["exports", { exports: { ".": "./evil.js" } }],
      ["a key not named in the brief (config)", { config: { a: 1 } }],
    ])("refuses a package.json that changes %s", async (key, change) => {
      const e = env(botPr(), { mergedManifest: manifestText(change) });
      await refused(e, /changes keys other than dependencies and version/);
    });

    it("accepts a bumped named package, a version change, and a reordered file", async () => {
      const reordered = JSON.stringify(
        {
          devDependencies: MANIFEST.devDependencies,
          dependencies: { lodash: "^4.17.21" },
          version: "1.0.1",
          scripts: {
            "merge-pr": MANIFEST.scripts["merge-pr"],
            test: MANIFEST.scripts.test,
          },
          name: MANIFEST.name,
        },
        null,
        4,
      );
      const e = env(botPr(), { mergedManifest: reordered });
      expect(await e.exec(["7", "--execute"])).toBe(0);
      expect(e.merged()).toBe(true);
    });

    it("comparePackageJson compares parsed JSON, not text", () => {
      expect(
        comparePackageJson(manifestText(), manifestText()).otherKeys,
      ).toEqual([]);
      const changed = comparePackageJson(
        manifestText(),
        manifestText({ scripts: { test: "true" }, bin: "x" }),
      );
      expect(changed.scriptsChanged).toBe(true);
      expect(changed.otherKeys.sort()).toEqual(["bin", "scripts"]);
      expect(comparePackageJson("{", manifestText()).unreadable).toMatch(
        /main/,
      );
      expect(comparePackageJson(manifestText(), "[]").unreadable).toMatch(
        /merge/,
      );
    });

    it("a lane that the test-merge could not inspect is void", () => {
      const lane = dependabotLane(botPr(), MANIFESTS, [
        "the manifest changes could not be inspected",
      ]);
      expect(lane.eligible).toBe(false);
      expect(lane.reasons).toContain(
        "the manifest changes could not be inspected",
      );
    });
  });

  describe("author.is_bot must be exactly true", () => {
    it.each([
      ["missing", { login: "dependabot[bot]" }],
      ["null", { login: "dependabot[bot]", is_bot: null }],
      ["the string true", { login: "dependabot[bot]", is_bot: "true" }],
    ])("refuses is_bot %s and says so", async (_n, author) => {
      await refused(env(botPr({ author })), /not marked as a bot/);
    });

    it("dependabotLane reports it as a reason", () => {
      const lane = dependabotLane(
        botPr({ author: { login: "app/dependabot" } }),
      );
      expect(lane.eligible).toBe(false);
      expect(lane.author).toBe(true);
    });
  });
});

describe("review fixes round 2 (P17-65): G1 the lockfile is parsed, G2 the named packages", () => {
  const bot = { login: "dependabot[bot]", is_bot: true };
  const MANIFESTS = [{ path: "package.json" }, { path: "package-lock.json" }];
  const botPr = (overrides = {}) =>
    greenPr({
      author: bot,
      title: "chore(deps): Bump lodash from 4.17.20 to 4.17.21",
      body: "Bumps lodash.",
      comments: [],
      files: MANIFESTS,
      commits: [{ oid: OID, authors: [{ login: "dependabot[bot]" }] }],
      ...overrides,
    });
  const env = (pr, extra = {}) =>
    makeEnv({
      pr,
      diff: ["package.json", "package-lock.json"],
      baseManifest: laneBase(),
      mergedManifest: laneMerged(namedBy(pr)),
      ...extra,
    });
  const refused = async (e, why) => {
    expect(await e.exec(["7", "--execute"])).toBe(1);
    expect(e.text()).toContain("dependabot lane refused:");
    expect(e.text()).toMatch(why);
    expect(e.text()).toMatch(/FAIL {2}4\. +record/);
    expect(e.text()).toMatch(/FAIL {2}4b\. +audit/);
    expect(e.merged()).toBe(false);
  };

  const REG = "https://registry.npmjs.org/x/-/x-1.0.0.tgz";
  const lock = (packages, extra = {}) =>
    JSON.stringify({
      lockfileVersion: 3,
      packages: { "": { name: "x", version: "1.0.0" }, ...packages },
      ...extra,
    });
  const entry = (extra) =>
    lock({ "node_modules/x": { version: "1.0.0", resolved: REG, ...extra } });
  const OUTSIDE = /resolves outside https:\/\/registry\.npmjs\.org\//;

  describe("G1 lockfileProblems", () => {
    it("accepts registry entries, a root with no resolved, and a v2 tree", () => {
      expect(lockfileProblems(entry({}))).toEqual([]);
      expect(lockfileProblems(lock({}))).toEqual([]);
      expect(
        lockfileProblems(
          entry({
            dependencies: { y: "^1.2.3", z: "~2.0.0 || >=3" },
            optionalDependencies: { o: "1.x" },
            peerDependencies: { p: "latest" },
            devDependencies: { d: "*" },
          }),
        ),
      ).toEqual([]);
      expect(
        lockfileProblems(
          JSON.stringify({
            lockfileVersion: 2,
            packages: { "": {}, "node_modules/x": { version: "1.0.0" } },
            dependencies: {
              x: {
                version: "1.0.0",
                resolved: REG,
                requires: { y: "^1.0.0" },
                dependencies: { y: { version: "1.0.1", resolved: REG } },
              },
            },
          }),
        ),
      ).toEqual([]);
    });

    it("sees through a JSON-escaped key (the old line grep did not)", () => {
      const escaped =
        '{"lockfileVersion":3,"packages":{"node_modules/x":{"version":"1.0.0","\\u0072esolved":"git+ssh://git@example.invalid/x.git"}}}';
      expect(escaped).not.toContain('"resolved"');
      expect(lockfileProblems(escaped)).toEqual([
        expect.stringMatching(OUTSIDE),
      ]);
    });

    it.each([
      ["a git+ssh URL", { resolved: "git+ssh://git@example.invalid/x.git#a" }],
      ["a file: path", { resolved: "file:../x" }],
      ["a bare path", { resolved: "../evil" }],
      ["another https host", { resolved: "https://example.invalid/x.tgz" }],
      [
        "a registry look-alike host",
        { resolved: "https://registry.npmjs.org.example.invalid/x.tgz" },
      ],
      ["http, not https", { resolved: "http://registry.npmjs.org/x.tgz" }],
      [
        "a second URL after the registry prefix",
        { resolved: `${REGISTRY_PREFIX}x?u=https://evil.invalid/x.tgz` },
      ],
      ["a backslash", { resolved: `${REGISTRY_PREFIX}x\\y.tgz` }],
      ["a list", { resolved: [REG] }],
      ["a number", { resolved: 5 }],
      ["null", { resolved: null }],
    ])("refuses resolved: %s", (_n, change) => {
      expect(lockfileProblems(entry(change))).toEqual([
        expect.stringMatching(OUTSIDE),
      ]);
    });

    it("refuses a link, however it resolves", () => {
      expect(lockfileProblems(entry({ link: true }))).toEqual([
        expect.stringMatching(/link: true/),
      ]);
      expect(
        lockfileProblems(
          lock({ "node_modules/w": { resolved: "workspace/w", link: true } }),
        ),
      ).toEqual([
        expect.stringMatching(/link: true/),
        expect.stringMatching(OUTSIDE),
      ]);
    });

    it.each([
      ["file:", "file:../x"],
      ["git+https:", "git+https://github.com/a/b.git"],
      ["git:", "git://github.com/a/b.git"],
      ["github:", "github:a/b"],
      ["http:", "http://example.invalid/x.tgz"],
      ["npm:", "npm:evil@1.0.0"],
      ["a scheme separator", "1.0.0://x"],
      ["a number", 1],
    ])("refuses a version that is %s", (_n, version) => {
      expect(lockfileProblems(entry({ version }))).toEqual([
        expect.stringMatching(/version that is not a registry version/),
      ]);
    });

    it.each([
      "dependencies",
      "optionalDependencies",
      "peerDependencies",
      "devDependencies",
    ])("refuses a bad spec in %s", (map) => {
      for (const spec of [
        "npm:evil@1.0.0",
        "git+https://github.com/a/b.git",
        "git+ssh://git@example.invalid/b.git",
        "github:a/b",
        "file:../y",
        "http://example.invalid/y.tgz",
        "owner/repo",
        "../y",
        7,
      ]) {
        expect(
          lockfileProblems(entry({ [map]: { y: spec } })),
          `${map} ${spec}`,
        ).toHaveLength(1);
      }
    });

    it("refuses specs that are not a semver range or a dist-tag, in every map", () => {
      for (const map of [...DEPENDENCY_MAPS, "requires"]) {
        for (const spec of [
          "gist:11081aaa281",
          "evil.tgz",
          "evil.tar",
          "evil.tar.gz",
          "workspace:*",
          "git+https://x/y.git",
          "file:../x",
          "owner/repo",
          "@scope/pkg",
          "evil@1.0.0",
          "back\\slash",
          "latest:x",
          "1.0.0 latest",
          "",
        ]) {
          expect(
            lockfileProblems(entry({ [map]: { y: spec } })),
            `${map} ${JSON.stringify(spec)}`,
          ).toEqual([
            expect.stringMatching(/not a semver range or a dist-tag/),
          ]);
        }
      }
    });

    it("accepts a dist-tag in a non-root dependency spec, as npm records it", () => {
      for (const map of [...DEPENDENCY_MAPS, "requires"]) {
        for (const spec of ["latest", "next", "beta-2", "^1.2.3", "1.x"]) {
          expect(lockfileProblems(entry({ [map]: { y: spec } })), spec).toEqual(
            [],
          );
        }
      }
    });

    it("never takes a tag as a version", () => {
      for (const version of ["latest", "next", "1.0", "1.0.0 ", "^1.0.0"]) {
        expect(lockfileProblems(entry({ version })), version).toEqual([
          expect.stringMatching(/version that is not a registry version/),
        ]);
      }
    });

    it("refuses a bad spec in requires, and anything nested in a v2 tree", () => {
      const v2 = (tree) =>
        JSON.stringify({
          lockfileVersion: 2,
          packages: { "": {} },
          dependencies: tree,
        });
      expect(
        lockfileProblems(
          v2({
            x: { version: "1.0.0", resolved: REG, requires: { y: "npm:e@1" } },
          }),
        ),
      ).toHaveLength(1);
      expect(
        lockfileProblems(
          v2({
            x: {
              version: "1.0.0",
              resolved: REG,
              dependencies: {
                y: { version: "1.0.0", resolved: "git+ssh://e/y.git" },
              },
            },
          }),
        ),
      ).toEqual([expect.stringMatching(OUTSIDE)]);
      expect(
        lockfileProblems(v2({ x: { version: "file:../x" } })),
      ).toHaveLength(1);
      expect(lockfileProblems(v2([]))).toHaveLength(1);
    });

    it.each([
      [
        "lockfileVersion 1",
        JSON.stringify({ lockfileVersion: 1, dependencies: {} }),
      ],
      [
        "lockfileVersion 4",
        JSON.stringify({ lockfileVersion: 4, packages: {} }),
      ],
      [
        "a string lockfileVersion",
        JSON.stringify({ lockfileVersion: "3", packages: {} }),
      ],
      ["no lockfileVersion", JSON.stringify({ packages: {} })],
      ["text that is not JSON", "{ not json"],
      ["empty text", ""],
      ["a JSON array", "[]"],
      ["JSON null", "null"],
      ["a lockfile with no packages", JSON.stringify({ lockfileVersion: 3 })],
      [
        "packages as a list",
        JSON.stringify({ lockfileVersion: 3, packages: [] }),
      ],
    ])("fails closed on %s", (_n, text) => {
      expect(lockfileProblems(text).length).toBeGreaterThan(0);
    });

    it("caps what it reports at five", () => {
      const packages = {};
      for (let i = 0; i < 20; i += 1) {
        packages[`node_modules/p${i}`] = { resolved: `file:../p${i}` };
      }
      expect(lockfileProblems(lock(packages))).toHaveLength(5);
    });
  });

  describe("G1 through the whole flow", () => {
    it("refuses an escaped-key git resolution even when the patch looks clean", async () => {
      const escaped = `{"lockfileVersion":3,"packages":{"node_modules/lodash":{"version":"4.17.21","\\u0072esolved":"git+ssh://git@example.invalid/lodash.git"}}}`;
      await refused(env(botPr(), { mergedLock: escaped }), OUTSIDE);
    });

    it.each([
      ["file:", { resolved: "file:../x" }],
      ["a link", { link: true }],
      ["a git version", { version: "git+ssh://e/x.git" }],
      ["an npm: spec", { dependencies: { y: "npm:evil@1.0.0" } }],
    ])("refuses a merged lockfile with %s", async (_n, change) => {
      await refused(
        env(botPr(), { mergedLock: entry(change) }),
        /packages\["node_modules\/x"\]/,
      );
    });

    it("refuses a lockfile that does not parse", async () => {
      await refused(
        env(botPr(), { mergedLock: "{ not json" }),
        /package-lock\.json is not valid JSON/,
      );
    });

    it("refuses a lockfileVersion 1 lockfile", async () => {
      await refused(
        env(botPr(), {
          mergedLock: JSON.stringify({ lockfileVersion: 1, dependencies: {} }),
        }),
        /lockfileVersion is 1, not 2 or 3/,
      );
    });

    it("refuses when the merged lockfile cannot be shown", async () => {
      await refused(
        env(botPr(), { lockShowCode: 128 }),
        /could not read package-lock\.json after the merge/,
      );
    });

    it("reads the lockfile from the merge result (the index), in the test worktree", async () => {
      const e = env(botPr());
      await e.exec(["7"]);
      const show = e.calls.find(
        (c) => c.args.join(" ") === "show :package-lock.json",
      );
      expect(show.cwd).toBe(TMP);
    });

    it("refuses an added line with a backslash even when the lockfile parses clean", async () => {
      await refused(
        env(botPr(), {
          lockPatch: [
            "diff --git a/package-lock.json b/package-lock.json",
            "--- a/package-lock.json",
            "+++ b/package-lock.json",
            "@@ -1 +1 @@",
            '+      "\\u0072esolved": "https://registry.npmjs.org/x.tgz",',
            "",
          ].join("\n"),
        }),
        /contains a backslash/,
      );
    });
  });

  describe("G2 dependencyMapChanges", () => {
    const text = (changes) =>
      JSON.stringify({
        name: "x",
        dependencies: { a: "1.0.0", b: "^1.0.0" },
        devDependencies: { d: "2.0.0" },
        optionalDependencies: { o: "~3.0.0" },
        peerDependencies: { p: "^4.0.0" },
        ...changes,
      });

    it("reports nothing for identical files, and name, from and to otherwise", () => {
      expect(dependencyMapChanges(text(), text())).toEqual({
        problems: [],
        changed: [],
      });
      expect(
        dependencyMapChanges(
          text(),
          text({
            dependencies: { a: "1.0.1", b: "^1.0.0" },
            devDependencies: { d: "~2.1.0" },
            peerDependencies: { p: "^4.0.1" },
          }),
        ),
      ).toEqual({
        problems: [],
        changed: [
          { name: "a", from: "1.0.0", to: "1.0.1" },
          { name: "d", from: "2.0.0", to: "~2.1.0" },
          { name: "p", from: "^4.0.0", to: "^4.0.1" },
        ],
      });
    });

    it.each([
      "dependencies",
      "devDependencies",
      "optionalDependencies",
      "peerDependencies",
    ])("refuses an added, removed or renamed key in %s", (map) => {
      const from = JSON.parse(text())[map];
      const [name] = Object.keys(from);
      for (const to of [
        { ...from, extra: "1.0.0" },
        {},
        { [`${name}-renamed`]: from[name] },
      ]) {
        const result = dependencyMapChanges(text(), text({ [map]: to }));
        expect(result.problems, JSON.stringify(to)).toEqual([
          expect.stringMatching(new RegExp(`${map} adds or removes`)),
        ]);
      }
    });

    it("refuses a package moved from one map to another", () => {
      const result = dependencyMapChanges(
        text(),
        text({
          dependencies: { b: "^1.0.0" },
          devDependencies: { d: "2.0.0", a: "1.0.0" },
        }),
      );
      expect(result.problems).toHaveLength(2);
    });

    it("accepts [^~]major.minor.patch and nothing else as a changed value", () => {
      for (const ok of ["1.0.1", "^1.0.1", "~1.0.1"]) {
        expect(
          dependencyMapChanges(
            text(),
            text({ dependencies: { a: ok, b: "^1.0.0" } }),
          ).problems,
          ok,
        ).toEqual([]);
      }
      for (const bad of [
        "npm:evil@1.0.1",
        "git+https://github.com/a/b.git",
        "git+ssh://git@example.invalid/b.git",
        "github:a/b",
        "file:../x",
        "https://example.invalid/x.tgz",
        "http://example.invalid/x.tgz",
        "latest",
        "next",
        ">=1.0.1",
        "^1.0.0 || ^2.0.0",
        "1.x",
        "*",
        "",
        "^1.0.1-beta.1",
        "~1.0",
        "^1.0.1 ",
        "v1.0.1",
        "^^1.0.1",
        5,
        null,
        { a: 1 },
      ]) {
        const result = dependencyMapChanges(
          text(),
          text({ dependencies: { a: bad, b: "^1.0.0" } }),
        );
        expect(result.problems, JSON.stringify(bad)).toHaveLength(1);
        expect(result.problems[0]).toContain("package.json dependencies.a");
        expect(result.changed).toEqual([{ name: "a", from: "1.0.0", to: bad }]);
      }
    });

    it("sees an added key that Object.prototype also has (constructor, __proto__, toString)", () => {
      for (const key of ["constructor", "__proto__", "toString"]) {
        const withKey = JSON.parse(
          `{"dependencies":{"a":"1.0.0","b":"^1.0.0","${key}":"1.0.0"}}`,
        );
        expect(Object.keys(withKey.dependencies), key).toContain(key);
        const result = dependencyMapChanges(
          text(),
          JSON.stringify({ ...JSON.parse(text()), ...withKey }),
        );
        expect(result.problems, key).toEqual([
          expect.stringMatching(
            new RegExp(`dependencies adds or removes packages \\(\\+${key}`),
          ),
        ]);
        // and as a removed key
        const back = dependencyMapChanges(
          JSON.stringify({ ...JSON.parse(text()), ...withKey }),
          text(),
        );
        expect(back.problems, key).toEqual([
          expect.stringMatching(new RegExp(`-${key}\\)`)),
        ]);
      }
    });

    it("only judges values that changed", () => {
      const odd = { dependencies: { a: "latest", b: "^1.0.0" } };
      expect(dependencyMapChanges(text(odd), text(odd)).problems).toEqual([]);
    });

    it("fails closed on unreadable input and on a map that is not an object", () => {
      expect(dependencyMapChanges("{", text()).problems).toHaveLength(1);
      expect(dependencyMapChanges(text(), "[]").problems).toHaveLength(1);
      expect(
        dependencyMapChanges(text(), text({ dependencies: ["a"] })).problems,
      ).toEqual([expect.stringMatching(/dependencies is not an object/)]);
    });
  });

  describe("G2 through the whole flow", () => {
    const merged = (deps) =>
      JSON.stringify({ ...LANE_MANIFEST, ...deps }, null, 2);

    it("refuses a changed package that the title does not name", async () => {
      await refused(
        env(botPr(), { mergedManifest: laneMerged(["lodash", "eslint"]) }),
        /does not name: "eslint"/,
      );
    });

    it("compares names exactly", async () => {
      await refused(
        env(botPr({ title: "Bump Lodash from 4.17.20 to 4.17.21" }), {
          mergedManifest: laneMerged(["lodash"]),
        }),
        /does not name: "lodash"/,
      );
    });

    it("refuses a PR whose package.json changes no dependency version", async () => {
      await refused(
        env(botPr(), { mergedManifest: laneMerged([], { version: "1.0.1" }) }),
        /changes no dependency version/,
      );
    });

    it("refuses an added dependency, even one with a plain version", async () => {
      await refused(
        env(botPr(), {
          mergedManifest: merged({
            dependencies: {
              ...LANE_MANIFEST.dependencies,
              lodash: "4.17.21",
              evil: "1.0.0",
            },
          }),
        }),
        /dependencies adds or removes packages/,
      );
    });

    it("refuses a removed or renamed dependency", async () => {
      const { x, ...rest } = LANE_MANIFEST.dependencies;
      expect(x).toBe("1.0.0");
      for (const dependencies of [
        { ...rest, lodash: "4.17.21" },
        { ...rest, lodash: "4.17.21", "x-renamed": "1.0.0" },
      ]) {
        await refused(
          env(botPr(), { mergedManifest: merged({ dependencies }) }),
          /adds or removes packages/,
        );
      }
    });

    it.each([
      ["an npm: alias", "npm:evil@4.17.21"],
      ["a git URL", "git+https://github.com/a/lodash.git"],
      ["a file: path", "file:../lodash"],
      ["a tarball URL", "https://example.invalid/lodash.tgz"],
      ["a tag", "latest"],
      ["a range with ||", "^4.17.21 || ^5.0.0"],
    ])("refuses the named package set to %s", async (_n, value) => {
      await refused(
        env(botPr(), {
          mergedManifest: merged({
            dependencies: { ...LANE_MANIFEST.dependencies, lodash: value },
          }),
        }),
        /not a plain \[\^~\]major\.minor\.patch/,
      );
    });

    it("accepts a caret or tilde range on the named package", async () => {
      for (const value of ["^4.17.21", "~4.17.21"]) {
        const e = env(botPr(), {
          mergedManifest: merged({
            dependencies: { ...LANE_MANIFEST.dependencies, lodash: value },
          }),
        });
        expect(await e.exec(["7", "--execute"]), value).toBe(0);
      }
    });

    it("lets a group PR change a subset of the packages its body names", async () => {
      const body = [
        "Bumps the npm-minor-patch group with 2 updates in the / directory.",
        "Updates `eslint` from 9.1.0 to 9.4.0",
        "Updates `prettier` from 3.0.0 to 3.0.3",
      ].join("\n");
      const title =
        "chore(deps): Bump the npm-minor-patch group with 2 updates";
      const subset = env(botPr({ title, body }), {
        mergedManifest: laneMerged({ eslint: "9.4.0" }),
      });
      expect(await subset.exec(["7", "--execute"])).toBe(0);
      await refused(
        env(botPr({ title, body }), {
          mergedManifest: laneMerged({ eslint: "9.4.0", lodash: "4.17.21" }),
        }),
        /does not name: "lodash"/,
      );
    });

    describe("N3 direction and agreement with the title", () => {
      const bump = (title, ...changes) => ({
        lane: dependabotLane(botPr({ title }), MANIFESTS, [], changes),
      });
      const change = (to, from = "^1.2.0", name = "lodash") => ({
        name,
        from,
        to,
      });
      const REASON = /dependabot lane refused: /;

      it("accepts a value equal to the title's, with or without ^ or ~", () => {
        for (const [from, to] of [
          ["1.2.0", "1.2.1"],
          ["^1.2.0", "^1.2.1"],
          ["~1.2.0", "~1.2.1"],
          ["^1.2.0", "1.2.1"],
          ["1.2.0", "~1.2.1"],
        ]) {
          expect(
            bump("Bump lodash from 1.2.0 to 1.2.1", change(to, from)).lane
              .eligible,
            `${from} -> ${to}`,
          ).toBe(true);
        }
      });

      it("refuses ^1.2.0 -> ^9.0.0 under a title that says 1.2.0 to 1.2.1", () => {
        const { lane } = bump(
          "Bump lodash from 1.2.0 to 1.2.1",
          change("^9.0.0"),
        );
        expect(lane.eligible).toBe(false);
        expect(lane.reasons.join(";")).toMatch(
          /the PR names 1\.2\.1, not 9\.0\.0/,
        );
      });

      it.each([
        ["^1.2.0", "^1.1.9"],
        ["1.2.0", "1.2.0"],
        ["~1.2.3", "~1.2.2"],
        ["^2.0.0", "^1.9.9"],
      ])("refuses %s -> %s, which is not an increase", (from, to) => {
        const { lane } = bump(
          `Bump lodash from ${from.replace(/^[\^~]/, "")} to ${to.replace(/^[\^~]/, "")}`,
          change(to, from),
        );
        expect(lane.eligible).toBe(false);
        expect(lane.reasons.join(";")).toMatch(/not an increase/);
      });

      it("refuses a from that cannot be compared", () => {
        const { lane } = bump(
          "Bump lodash from 1.2.0 to 1.2.1",
          change("1.2.1", "latest"),
        );
        expect(lane.eligible).toBe(false);
        expect(lane.reasons.join(";")).toMatch(/not comparable/);
      });

      it("checks each package of a group against its own line of the body", () => {
        const body = [
          "Updates `eslint` from 9.1.0 to 9.4.0",
          "Updates `prettier` from 3.0.0 to 3.0.3",
        ].join("\n");
        const pr = botPr({
          title: "chore(deps): Bump the npm group with 2 updates",
          body,
        });
        const eslint = { name: "eslint", from: "9.1.0", to: "9.4.0" };
        const prettier = { name: "prettier", from: "3.0.0", to: "3.0.3" };
        expect(
          dependabotLane(pr, MANIFESTS, [], [eslint, prettier]).eligible,
        ).toBe(true);
        // prettier takes eslint's version: still an increase, but not its own
        const swapped = dependabotLane(
          pr,
          MANIFESTS,
          [],
          [eslint, { ...prettier, to: "9.4.0" }],
        );
        expect(swapped.eligible).toBe(false);
        expect(swapped.reasons.join(";")).toMatch(
          /"prettier".*the PR names 3\.0\.3, not 9\.4\.0/,
        );
      });

      it("voids the lane through the whole flow with the refusal note", async () => {
        const e = env(botPr(), {
          mergedManifest: laneMerged({ lodash: "^9.0.0" }),
        });
        expect(await e.exec(["7", "--execute"])).toBe(1);
        expect(e.text()).toMatch(REASON);
        expect(e.text()).toMatch(/the PR names 4\.17\.21, not 9\.0\.0/);
        expect(e.merged()).toBe(false);
        const down = env(botPr(), {
          mergedManifest: laneMerged({ lodash: "4.17.19" }),
        });
        expect(await down.exec(["7", "--execute"])).toBe(1);
        expect(down.text()).toMatch(/not an increase/);
        expect(down.merged()).toBe(false);
      });
    });

    it("dependabotLane applies the check only when it is given the changed names", () => {
      const pr = botPr();
      expect(dependabotLane(pr, MANIFESTS, [], null).eligible).toBe(true);
      const up = { name: "lodash", from: "4.17.20", to: "4.17.21" };
      expect(dependabotLane(pr, MANIFESTS, [], [up]).eligible).toBe(true);
      expect(dependabotLane(pr, MANIFESTS, [], []).eligible).toBe(false);
      expect(
        dependabotLane(pr, MANIFESTS, [], [{ ...up, name: "other" }]).eligible,
      ).toBe(false);
    });
  });
});

describe("review fixes (P17-65): F2 nested instruction files in the released directories", () => {
  const names = [
    "CLAUDE.md",
    "CLAUDE.local.md",
    "AGENTS.md",
    ".mcp.json",
    ".gitattributes",
    ".gitmodules",
    ".npmrc",
    ".env",
    ".env.local",
    ".env.production",
    "settings.json",
    "settings.local.json",
    ".hidden",
    ".gitkeep",
  ];
  const paths = [];
  for (const dir of [".claude/commands", ".claude/scripts"]) {
    for (const name of names) {
      paths.push(`${dir}/${name}`, `${dir}/sub/deeper/${name}`);
    }
  }
  paths.push(
    ".claude/commands/claude.md",
    ".claude/scripts/Agents.MD",
    ".claude/commands/Settings.JSON",
    ".claude/scripts/.MCP.json",
    ".claude/scripts/.dotdir/run.sh",
    ".claude/commands/sub/.hidden/x.md",
  );

  it.each(paths)("stays restricted: %s", (file) => {
    expect(isPrefixException(file)).toBe(false);
    expect(restrictedPatternFor(file)).not.toBeNull();
    expect(checkFiles([{ path: file }])).toEqual([
      `touches ${file}: maintainer merges this one`,
    ]);
  });

  it("goes through the full flow as a gate 5 failure", async () => {
    const e = makeEnv({ diff: [".claude/commands/CLAUDE.md"] });
    expect(await e.exec(["7", "--execute"])).toBe(1);
    expect(e.text()).toMatch(/FAIL {2}5\. +files/);
    expect(e.merged()).toBe(false);
  });

  it.each([
    ".claude/commands/verify-all.md",
    ".claude/commands/sub/deeper.md",
    ".claude/scripts/check-merged-prs.sh",
    ".claude/scripts/sub/helper.mjs",
    ".claude/scripts/settings-helper.sh",
    ".claude/commands/claude-notes.md",
  ])("still released: %s", (file) => {
    expect(isPrefixException(file)).toBe(true);
    expect(checkFiles([{ path: file }])).toEqual([]);
  });
});

describe("review fixes (P17-65): F3 package.json scripts", () => {
  const scriptsChanged = manifestText({
    scripts: { ...MANIFEST.scripts, test: "true" },
  });
  const pkgPr = (overrides = {}) =>
    greenPr({ files: [{ path: "package.json" }], ...overrides });
  const TEXT = "i approve merging PR 7 with the scripts change";

  it("fails gate 5 when scripts differ from main", async () => {
    const e = makeEnv({
      pr: pkgPr(),
      diff: ["package.json"],
      mergedManifest: scriptsChanged,
    });
    expect(await e.exec(["7", "--execute"])).toBe(1);
    expect(e.text()).toMatch(/FAIL {2}5\. +files/);
    expect(e.text()).toContain(
      "package.json scripts changed: maintainer merges this one",
    );
    expect(e.merged()).toBe(false);
  });

  it("--maintainer-approved clears it", async () => {
    const e = makeEnv({
      pr: pkgPr(),
      diff: ["package.json"],
      mergedManifest: scriptsChanged,
    });
    expect(
      await e.exec(["7", "--execute", "--maintainer-approved", TEXT]),
    ).toBe(0);
    expect(e.text()).toContain(
      "overrode: package.json scripts changed: maintainer merges this one",
    );
    expect(e.merged()).toBe(true);
  });

  it("passes when only dependencies changed, or the scripts are merely reordered", async () => {
    for (const merged of [
      manifestText({ dependencies: { lodash: "4.17.21" } }),
      JSON.stringify({
        scripts: {
          "merge-pr": MANIFEST.scripts["merge-pr"],
          test: MANIFEST.scripts.test,
        },
        name: MANIFEST.name,
        version: MANIFEST.version,
        dependencies: MANIFEST.dependencies,
        devDependencies: MANIFEST.devDependencies,
      }),
    ]) {
      const e = makeEnv({
        pr: pkgPr(),
        diff: ["package.json"],
        mergedManifest: merged,
      });
      expect(await e.exec(["7", "--execute"])).toBe(0);
      expect(e.text()).toMatch(/PASS {2}5\. +files/);
    }
  });

  it("fails when scripts are removed or added", async () => {
    for (const merged of [
      JSON.stringify({ ...MANIFEST, scripts: undefined }),
      manifestText({ scripts: { ...MANIFEST.scripts, extra: "x" } }),
    ]) {
      const e = makeEnv({
        pr: pkgPr(),
        diff: ["package.json"],
        mergedManifest: merged,
      });
      expect(await e.exec(["7"])).toBe(1);
      expect(e.text()).toContain("package.json scripts changed");
    }
  });

  it("fails closed when package.json cannot be shown or parsed", async () => {
    for (const extra of [
      { showCode: 128 },
      { mergedManifest: "{ not json" },
      { baseManifest: "" },
    ]) {
      const e = makeEnv({ pr: pkgPr(), diff: ["package.json"], ...extra });
      expect(await e.exec(["7", "--execute"])).toBe(1);
      expect(e.text()).toContain("package.json could not be compared");
      expect(e.merged()).toBe(false);
    }
  });

  it("does not look at package.json when the PR does not touch it", async () => {
    const e = makeEnv();
    expect(await e.exec(["7"])).toBe(0);
    expect(e.calls.some((c) => c.args[0] === "show")).toBe(false);
  });

  it("reads main and the merge result (the index), nothing else", async () => {
    const e = makeEnv({ pr: pkgPr(), diff: ["package.json"] });
    await e.exec(["7"]);
    const shows = e.calls.filter((c) => c.args[0] === "show");
    expect(shows.map((c) => [c.args.join(" "), c.cwd])).toEqual([
      ["show :package-lock.json", TMP],
      ["show origin/main:package.json", "/repo"],
      ["show :package.json", TMP],
    ]);
  });
});

describe("review fixes (P17-65): F4 approval in the merge commit", () => {
  const TEXT = "i approve merging PR 7 with the workflow change";
  const PREFIX =
    "Maintainer approval (recorded by the conductor, honour system): ";
  const mergeCall = (e) =>
    e.calls.find((c) => c.file === "gh" && c.args[1] === "merge");
  const wf = () => greenPr({ files: [{ path: ".github/workflows/ci.yml" }] });

  it("passes the text to gh pr merge --body", async () => {
    const e = makeEnv({ pr: wf() });
    expect(
      await e.exec(["7", "--execute", "--maintainer-approved", TEXT]),
    ).toBe(0);
    const { args } = mergeCall(e);
    const at = args.indexOf("--body");
    expect(at).toBeGreaterThan(-1);
    expect(args[at + 1]).toBe(`${PREFIX}${TEXT}`);
    expect(args).toContain("--squash");
    expect(args).toContain("--match-head-commit");
  });

  it("sanitises and truncates the body text", async () => {
    const e = makeEnv({ pr: wf() });
    const long = `ok\x1b[31m\nline two\r\n${"a".repeat(300)}`;
    await e.exec(["7", "--execute", "--maintainer-approved", long]);
    const { args } = mergeCall(e);
    const body = args[args.indexOf("--body") + 1];
    // eslint-disable-next-line no-control-regex -- asserting they are gone
    expect(body).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/);
    expect(body.startsWith(`${PREFIX}ok `)).toBe(true);
    expect(body.length).toBe(PREFIX.length + 200 + 3);
  });

  it("writes no --body when the flag is given but nothing was overridden", async () => {
    const e = makeEnv();
    expect(
      await e.exec(["7", "--execute", "--maintainer-approved", TEXT]),
    ).toBe(0);
    expect(mergeCall(e).args).not.toContain("--body");
    expect(e.text()).toContain("nothing was overridden");
    expect(e.text()).not.toContain("overrode:");
  });

  it("the record is the whole body, written once, when gate 5 was overridden", async () => {
    const e = makeEnv({ pr: wf() });
    await e.exec(["7", "--execute", "--maintainer-approved", TEXT]);
    const { args } = mergeCall(e);
    expect(args.filter((a) => a === "--body")).toHaveLength(1);
    expect(args.filter((a) => a.startsWith(PREFIX))).toEqual([
      `${PREFIX}${TEXT}`,
    ]);
    expect(e.text()).not.toContain("nothing was overridden");
  });

  it("writes the body when the override was needed only after the test-merge", async () => {
    const e = makeEnv({
      pr: greenPr({ files: [{ path: "package.json" }] }),
      diff: ["package.json"],
      mergedManifest: manifestText({
        scripts: { ...MANIFEST.scripts, test: "true" },
      }),
    });
    expect(
      await e.exec(["7", "--execute", "--maintainer-approved", TEXT]),
    ).toBe(0);
    const { args } = mergeCall(e);
    expect(args[args.indexOf("--body") + 1]).toBe(`${PREFIX}${TEXT}`);
  });

  it("writes no --body when the flag is absent", async () => {
    const e = makeEnv();
    expect(await e.exec(["7", "--execute"])).toBe(0);
    expect(mergeCall(e).args).not.toContain("--body");
  });

  it("does not run gh pr merge in a dry run", async () => {
    const e = makeEnv({ pr: wf() });
    await e.exec(["7", "--maintainer-approved", TEXT]);
    expect(mergeCall(e)).toBeUndefined();
  });

  it("--help says the text goes into the commit body", async () => {
    const e = makeEnv();
    await e.exec(["--help"]);
    expect(e.text()).toMatch(/commit body/);
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

  it("installs SIGHUP, SIGINT, SIGQUIT and SIGTERM handlers that clean up, then exit", async () => {
    for (const [signal, code] of [
      ["SIGHUP", 129],
      ["SIGINT", 130],
      ["SIGQUIT", 131],
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

  it("ignores a second signal while cleanup is still running", async () => {
    const proc = new EventEmitter();
    proc.exit = vi.fn();
    let finish;
    const gate = new Promise((resolve) => {
      finish = resolve;
    });
    let completed = false;
    const cleanup = vi.fn(async () => {
      await gate;
      completed = true;
    });
    registerCleanup(cleanup);
    installSignalHandlers(proc);
    proc.emit("SIGINT");
    proc.emit("SIGTERM");
    proc.emit("SIGINT");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(proc.exit).not.toHaveBeenCalled();
    // Handlers stay installed, so a second signal cannot fall to the default.
    expect(proc.listenerCount("SIGINT")).toBe(1);
    expect(proc.listenerCount("SIGTERM")).toBe(1);
    finish();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(completed).toBe(true);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(proc.exit).toHaveBeenCalledTimes(1);
    expect(proc.exit).toHaveBeenCalledWith(130);
  });

  describe("a real signal mid-npm-test leaves nothing behind", () => {
    useHermeticGit();
    let base;
    let caller;
    let head;
    let driver;
    let scratch;
    const git = (dir, ...args) =>
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
        {
          cwd: dir,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          env: hermeticGitEnv(),
        },
      );

    beforeAll(() => {
      base = mkdtempSync(path.join(tmpdir(), "merge-pr-sig-"));
      scratch = path.join(base, "scratch");
      mkdirSync(scratch);
      const origin = path.join(base, "origin.git");
      const seed = path.join(base, "seed");
      caller = path.join(base, "caller");
      mkdirSync(seed);
      git(base, "init", "-q", "--bare", "--initial-branch=main", origin);
      git(seed, "init", "-q", "--initial-branch=main");
      git(seed, "remote", "add", "origin", origin);
      // `npm test` starts a background sleep, records its pid, and waits. The
      // pid file is named by the test through the file next to it.
      writeFileSync(
        path.join(seed, "package.json"),
        JSON.stringify({ scripts: { test: "sh ./slow.sh" } }),
      );
      writeFileSync(
        path.join(seed, "slow.sh"),
        `sleep 300 &\necho $! > "${scratch}/sleep.pid"\nwait\n`,
      );
      git(seed, "add", "-A");
      git(seed, "commit", "-q", "-m", "base");
      git(seed, "push", "-q", "origin", "main");
      git(seed, "checkout", "-q", "-b", "feature");
      writeFileSync(path.join(seed, "f.md"), "f\n");
      git(seed, "add", "-A");
      git(seed, "commit", "-q", "-m", "feature");
      git(seed, "push", "-q", "origin", "feature");
      head = git(seed, "rev-parse", "HEAD").trim();
      // main moves on, so the head is behind it and gate 6 runs npm test.
      git(seed, "checkout", "-q", "main");
      writeFileSync(path.join(seed, "m.md"), "m\n");
      git(seed, "add", "-A");
      git(seed, "commit", "-q", "-m", "main moves");
      git(seed, "push", "-q", "origin", "main");
      git(base, "clone", "-q", origin, caller);

      driver = path.join(base, "driver.mjs");
      writeFileSync(
        driver,
        [
          `import { defaultFs, defaultRunner, installSignalHandlers, testMerge } from ${JSON.stringify(
            pathToFileURL(path.join(process.cwd(), "scripts/merge-pr.mjs"))
              .href,
          )};`,
          "installSignalHandlers();",
          `const pr = { headRefName: "feature", headRefOid: ${JSON.stringify(head)} };`,
          `testMerge(pr, { run: defaultRunner, fs: defaultFs, cwd: ${JSON.stringify(caller)} }).then((r) => {`,
          "  process.stdout.write(JSON.stringify(r));",
          "});",
          "",
        ].join("\n"),
      );
    }, 60_000);

    afterAll(() => {
      if (base) rmSync(base, { recursive: true, force: true });
    });

    const alive = (pid) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    };

    it.each([
      ["SIGHUP", 129],
      ["SIGINT", 130],
      ["SIGQUIT", 131],
      ["SIGTERM", 143],
    ])(
      "%s kills the test group, removes the worktree and temp dirs, exits %i",
      async (signal, code) => {
        const pidFile = path.join(scratch, "sleep.pid");
        rmSync(pidFile, { force: true });
        const tmp = mkdtempSync(path.join(base, "tmp-"));
        const child = spawn(process.execPath, [driver], {
          cwd: caller,
          env: { ...process.env, TMPDIR: tmp },
          stdio: ["ignore", "pipe", "pipe"],
        });
        const exited = new Promise((resolve) => {
          child.on("close", (exitCode, sig) => resolve({ exitCode, sig }));
        });
        let pid = 0;
        try {
          for (let i = 0; i < 300 && !existsSync(pidFile); i += 1) {
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
          expect(existsSync(pidFile), "npm test never started").toBe(true);
          await new Promise((resolve) => setTimeout(resolve, 100));
          pid = Number(readFileSync(pidFile, "utf8").trim());
          expect(alive(pid)).toBe(true);
          // While running, the worktree and the scrubbed HOME exist.
          const present = readdirSync(tmp);
          expect(present).toHaveLength(2);
          expect(
            present.filter((n) => n.startsWith("merge-pr-home-")),
          ).toHaveLength(1);

          child.kill(signal);
          const result = await exited;
          expect(result.exitCode).toBe(code);

          await new Promise((resolve) => setTimeout(resolve, 200));
          expect(alive(pid), "the sleep grandchild survived").toBe(false);
          expect(readdirSync(tmp)).toEqual([]);
          expect(
            git(caller, "worktree", "list").trim().split("\n"),
          ).toHaveLength(1);
        } finally {
          child.kill("SIGKILL");
          if (pid && alive(pid)) process.kill(pid, "SIGKILL");
        }
      },
      60_000,
    );
  });

  it("runs npm test in its own process group with a long timeout", async () => {
    const env = makeEnv({ ancestorCode: 1 });
    await env.exec(["7"]);
    const test = env.calls.find((c) => c.file === "npm");
    expect(test.options.killGroup).toBe(true);
    expect(test.options.timeout).toBe(600_000);
  });

  describe("the test run gets a scrubbed environment", () => {
    afterEach(() => vi.unstubAllEnvs());

    const secrets = {
      GH_TOKEN: "gh-secret",
      GITHUB_TOKEN: "github-secret",
      SSH_AUTH_SOCK: "/tmp/agent.sock",
      NPM_TOKEN: "npm-secret",
      NODE_AUTH_TOKEN: "node-secret",
      AWS_SECRET_ACCESS_KEY: "aws-secret",
      HOME: "/Users/real-person",
      XDG_CONFIG_HOME: "/Users/real-person/.config",
    };

    it("hands npm test only PATH, LANG, TERM, CI, NODE_ENV and a fresh HOME", async () => {
      for (const [key, value] of Object.entries(secrets)) {
        vi.stubEnv(key, value);
      }
      vi.stubEnv("PATH", "/usr/bin:/bin");
      vi.stubEnv("LANG", "en_US.UTF-8");
      vi.stubEnv("TERM", "xterm");
      const env = makeEnv({ ancestorCode: 1 });
      await env.exec(["7"]);
      const test = env.calls.find((c) => c.file === "npm");
      const given = test.options.env;
      expect(given).toEqual({
        PATH: "/usr/bin:/bin",
        LANG: "en_US.UTF-8",
        TERM: "xterm",
        CI: "1",
        NODE_ENV: "test",
        HOME: HOME_TMP,
        XDG_CONFIG_HOME: HOME_TMP,
      });
      for (const key of Object.keys(secrets)) {
        if (key !== "HOME" && key !== "XDG_CONFIG_HOME") {
          expect(given).not.toHaveProperty(key);
        }
      }
      expect(JSON.stringify(given)).not.toContain("real-person");
    });

    it("removes the fresh HOME afterwards, and never reuses the worktree dir", async () => {
      const env = makeEnv({ ancestorCode: 1 });
      await env.exec(["7"]);
      expect(env.fsCalls.filter((c) => c === `rm ${HOME_TMP}`)).toHaveLength(1);
      expect(HOME_TMP).not.toBe(TMP);
    });

    it("does not make a HOME when tests are not run", async () => {
      const env = makeEnv({ ancestorCode: 0 });
      await env.exec(["7"]);
      expect(env.fsCalls).not.toContain(`rm ${HOME_TMP}`);
    });

    it("scrubbedEnv omits unset optional variables", () => {
      expect(scrubbedEnv("/h", { PATH: "/p", GH_TOKEN: "t" })).toEqual({
        PATH: "/p",
        CI: "1",
        NODE_ENV: "test",
        HOME: "/h",
        XDG_CONFIG_HOME: "/h",
      });
    });

    it("defaultRunner passes exactly the env it is given to the child", async () => {
      vi.stubEnv("GH_TOKEN", "leak-me");
      const result = await defaultRunner(
        process.execPath,
        ["-e", "process.stdout.write(JSON.stringify(process.env))"],
        { env: { ONLY: "this" } },
      );
      expect(JSON.parse(result.stdout)).toMatchObject({ ONLY: "this" });
      expect(result.stdout).not.toContain("leak-me");
    });
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

  it("the header states the limits, the fetch side effect and the 4b rule", () => {
    const source = readFileSync(
      path.join(process.cwd(), "scripts/merge-pr.mjs"),
      "utf8",
    );
    const header = source.split("\nimport ")[0].replace(/\n\/\/ ?/g, " ");
    expect(header).toMatch(/Limits\./);
    expect(header).toMatch(/mitigation, not a sandbox/);
    expect(header).toMatch(/symlink to the caller's/);
    expect(header).toMatch(/updates the caller's `origin\/main` and/);
    expect(header).toMatch(/remote-tracking refs/);
    expect(header).toMatch(/LATEST \(by createdAt\)/);
    expect(header).toMatch(/control character/);
    expect(header).toMatch(/FAILS CLOSED/);
    expect(header).toMatch(/AND be at least 200 characters/);
    expect(header).toMatch(/mode 100644/);
    expect(header).toMatch(/older than 24 h/);
    expect(header).toMatch(/not re-read|NOT re-read/);
    expect(header).toMatch(/do not merge/);
    expect(header).toMatch(/Unicode-invisible/);
    expect(header).toMatch(/100 or more is refused/);
  });

  it("--help describes the 4b rule, the control-character rule and the limits", async () => {
    const env = makeEnv();
    await env.exec(["--help"]);
    expect(env.text()).toMatch(/latest PR comment that mentions a verdict/);
    expect(env.text()).toMatch(/fails closed/);
    expect(env.text()).toMatch(/100\+ comments are refused/);
    expect(env.text()).toMatch(/older than 24 h/);
    expect(env.text()).toMatch(/control character/);
    expect(env.text()).toMatch(/not a sandbox/);
  });
});
