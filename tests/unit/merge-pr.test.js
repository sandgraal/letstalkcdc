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
  RESTRICTED_PATTERNS,
  checkAuditTrail,
  checkChecks,
  checkExceptionModes,
  checkFiles,
  checkReviewRecord,
  checkState,
  cleanStaleTemp,
  defaultFs,
  defaultRunner,
  installSignalHandlers,
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
    [".claude/scripts/check-merged-prs.sh", "claude scripts"],
    [".claude/agents/reviewer.md", "claude agents"],
    [".claude/rules/testing.md", "claude rules"],
    [".claude/skills/review/SKILL.md", "claude skills"],
    [".claude/commands/verify-all.md", "claude commands"],
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
        { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
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
