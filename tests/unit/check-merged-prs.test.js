import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * .claude/scripts/check-merged-prs.sh is the merge watcher wired into
 * SessionStart and Stop. These tests run the real script in a throwaway git
 * repo with a stub `gh` first on PATH, so nothing touches the network or the
 * real state file.
 *
 * Rules under test: no state file -> initialise silently; the newest merge
 * (by mergedAt, not PR number) fires once if it is not already acknowledged;
 * never fire for a merge older than 6 hours or dated in the future; an
 * unwritable state file or a gh failure is silent.
 */

const script = path.resolve(
  __dirname,
  "../../.claude/scripts/check-merged-prs.sh",
);

const haveTools = ["bash", "jq", "git"].every(
  (bin) => spawnSync("sh", ["-c", `command -v ${bin}`]).status === 0,
);

const isoAgo = (hours) =>
  new Date(Date.now() - hours * 3600 * 1000)
    .toISOString()
    .replace(/\.\d+Z$/, "Z");

const pr = (number, hoursAgo, branch = "claude/some-work") => ({
  number,
  title: `PR ${number}`,
  headRefName: branch,
  mergedAt: isoAgo(hoursAgo),
});

describe.skipIf(!haveTools)("check-merged-prs.sh", () => {
  let repo;
  let binDir;
  let stateFile;

  const writeGhStub = (body) => {
    fs.writeFileSync(path.join(binDir, "gh"), `#!/bin/sh\n${body}\n`, {
      mode: 0o755,
    });
  };

  /** Stub gh: auth succeeds, `pr list` prints the given PRs. */
  const stubPrs = (prs) => {
    const json = path.join(binDir, "prs.json");
    fs.writeFileSync(json, JSON.stringify(prs));
    writeGhStub(`if [ "$1" = "auth" ]; then exit 0; fi\ncat "${json}"`);
  };

  const run = (event = "Stop") =>
    spawnSync("bash", [script], {
      cwd: repo,
      input: JSON.stringify({ hook_event_name: event }),
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
      },
    });

  const readState = () => JSON.parse(fs.readFileSync(stateFile, "utf8"));
  const writeState = (obj) => {
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(
      stateFile,
      typeof obj === "string" ? obj : JSON.stringify(obj),
    );
  };

  beforeEach(() => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "merge-watcher-"));
    repo = path.join(root, "repo");
    binDir = path.join(root, "bin");
    fs.mkdirSync(repo);
    fs.mkdirSync(binDir);
    spawnSync("git", ["init", "-q"], { cwd: repo });
    stateFile = path.join(repo, ".claude/.merge-watcher-state.json");
  });

  afterEach(() => {
    fs.rmSync(path.dirname(repo), { recursive: true, force: true });
  });

  it("with no state file, initialises to the newest PR and stays silent", () => {
    // Fresh enough to fire if the rule were missing.
    stubPrs([pr(41, 30), pr(42, 1)]);
    const res = run("Stop");
    expect(res.status).toBe(0);
    expect(res.stdout).toBe("");
    expect(readState().lastSeenPR).toBe(42);
  });

  it("treats an unreadable state file the same way", () => {
    writeState("{ this is not json");
    stubPrs([pr(42, 1)]);
    const res = run("Stop");
    expect(res.status).toBe(0);
    expect(res.stdout).toBe("");
    expect(readState().lastSeenPR).toBe(42);
  });

  it("fires once for a fresh merge when the state is stale, then goes quiet", () => {
    writeState({
      lastSeenPR: 40,
      ackedPRs: [40],
      acknowledgedAt: "2026-01-01T00:00:00Z",
    });
    stubPrs([pr(41, 2)]);
    const first = run("Stop");
    expect(first.status).toBe(2);
    const envelope = JSON.parse(first.stdout);
    expect(envelope.hookSpecificOutput.hookEventName).toBe("Stop");
    expect(envelope.hookSpecificOutput.additionalContext).toContain("PR #41");
    expect(readState().lastSeenPR).toBe(41);

    const second = run("Stop");
    expect(second.status).toBe(0);
    expect(second.stdout).toBe("");
  });

  it("on SessionStart a fresh merge emits the envelope and exits 0", () => {
    writeState({ lastSeenPR: 40, ackedPRs: [40] });
    stubPrs([pr(41, 0.5)]);
    const res = run("SessionStart");
    expect(res.status).toBe(0);
    expect(JSON.parse(res.stdout).hookSpecificOutput.hookEventName).toBe(
      "SessionStart",
    );
  });

  it("ignores a merge older than 6 hours but records it as seen", () => {
    writeState({ lastSeenPR: 40, ackedPRs: [40] });
    stubPrs([pr(41, 7)]);
    const res = run("Stop");
    expect(res.status).toBe(0);
    expect(res.stdout).toBe("");
    expect(readState().lastSeenPR).toBe(41);
  });

  it("never fires again for a PR that is already acknowledged", () => {
    writeState({ lastSeenPR: 50, ackedPRs: [50] });
    stubPrs([pr(50, 0.1), pr(49, 0.2)]);
    const res = run("Stop");
    expect(res.status).toBe(0);
    expect(res.stdout).toBe("");
    expect(readState().lastSeenPR).toBe(50);
  });

  it("fires for a lower-numbered PR that merges after a higher-numbered one, once", () => {
    // #431 landed earlier and is acknowledged; the long-lived #430 merges later.
    writeState({ lastSeenPR: 431, ackedPRs: [431] });
    stubPrs([pr(431, 3), pr(430, 1)]);
    const first = run("Stop");
    expect(first.status).toBe(2);
    expect(
      JSON.parse(first.stdout).hookSpecificOutput.additionalContext,
    ).toContain("PR #430");
    expect(readState().ackedPRs).toEqual(expect.arrayContaining([430, 431]));

    const second = run("Stop");
    expect(second.status).toBe(0);
    expect(second.stdout).toBe("");
  });

  it("stays silent when the same PR is seen twice", () => {
    writeState({ lastSeenPR: 40, ackedPRs: [40] });
    stubPrs([pr(41, 1)]);
    expect(run("Stop").status).toBe(2);
    const again = run("SessionStart");
    expect(again.status).toBe(0);
    expect(again.stdout).toBe("");
  });

  it("stays silent for a merge dated in the future (clock skew) but records it", () => {
    writeState({ lastSeenPR: 40, ackedPRs: [40] });
    stubPrs([pr(41, -2)]);
    const res = run("Stop");
    expect(res.status).toBe(0);
    expect(res.stdout).toBe("");
    expect(readState().ackedPRs).toContain(41);
  });

  it("keeps ackedPRs bounded to the newest 200", () => {
    writeState({
      lastSeenPR: 300,
      ackedPRs: Array.from({ length: 250 }, (_, i) => i + 1),
    });
    stubPrs([pr(301, 1)]);
    expect(run("Stop").status).toBe(2);
    const { ackedPRs } = readState();
    expect(ackedPRs).toHaveLength(200);
    expect(ackedPRs[0]).toBe(301);
  });

  it.skipIf(process.getuid?.() === 0)(
    "is silent and emits no directive when the state file cannot be written",
    () => {
      writeState({ lastSeenPR: 40, ackedPRs: [40] });
      stubPrs([pr(41, 1)]);
      const dir = path.dirname(stateFile);
      fs.chmodSync(dir, 0o555);
      try {
        const res = run("Stop");
        expect(res.status).toBe(0);
        expect(res.stdout).toBe("");
      } finally {
        fs.chmodSync(dir, 0o755);
      }
      expect(readState().lastSeenPR).toBe(40);
    },
  );

  it("only considers claude/* branches", () => {
    writeState({ lastSeenPR: 40, ackedPRs: [40] });
    stubPrs([pr(41, 1, "feature/not-claude")]);
    const res = run("Stop");
    expect(res.status).toBe(0);
    expect(res.stdout).toBe("");
    expect(readState().lastSeenPR).toBe(40);
  });

  it("is silent and writes nothing when gh fails", () => {
    writeGhStub(`if [ "$1" = "auth" ]; then exit 0; fi\nexit 1`);
    const res = run("Stop");
    expect(res.status).toBe(0);
    expect(res.stdout).toBe("");
    expect(fs.existsSync(stateFile)).toBe(false);
  });

  it("is silent when gh is not authenticated", () => {
    writeGhStub(`exit 1`);
    const res = run("Stop");
    expect(res.status).toBe(0);
    expect(res.stdout).toBe("");
    expect(fs.existsSync(stateFile)).toBe(false);
  });
});
