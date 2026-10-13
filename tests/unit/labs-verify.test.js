import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  CONNECTOR_NAME,
  SERVICES,
  TOPIC,
  buildPlan,
  evaluateChangeEvents,
  evaluateConnectorStatus,
  evaluateSeedCount,
  parseComposeImages,
  parseCount,
  parseKcatEvents,
  pollUntil,
} from "../../scripts/labs-verify.mjs";

const root = path.resolve(__dirname, "../..");
const read = (f) => readFileSync(path.join(root, f), "utf8");

const snapshot = [1, 2, 3, 4, 5].map((id) => ({
  op: "r",
  after: { id, weight: 1 },
  source: { lsn: 10 + id },
}));
const update = {
  op: "u",
  before: null,
  after: { id: 1, weight: 3.0 },
  source: { lsn: 99 },
};

describe("labs-verify parsing", () => {
  it("parses a psql count and rejects anything else", () => {
    expect(parseCount("5\n")).toBe(5);
    expect(parseCount("\n 12 \n\n")).toBe(12);
    expect(parseCount("ERROR: relation does not exist")).toBeNull();
    expect(parseCount("")).toBeNull();
    expect(parseCount(undefined)).toBeNull();
  });

  it("parses kcat output and skips banners and broken lines", () => {
    const out = [
      "% Reached end of topic",
      JSON.stringify(update),
      '{"op":"r"',
      "",
      "null",
    ].join("\n");
    expect(parseKcatEvents(out)).toEqual([update]);
  });

  it("lists compose images per service", () => {
    const images = parseComposeImages(read("compose.yaml"));
    expect(images).toContainEqual({
      service: "connect",
      image: "quay.io/debezium/connect:2.7.4.Final",
    });
    for (const s of SERVICES) expect(images.map((i) => i.service)).toContain(s);
  });
});

describe("labs-verify decisions", () => {
  it("seed count must match the README claim", () => {
    expect(evaluateSeedCount(5).ok).toBe(true);
    expect(evaluateSeedCount(9).ok).toBe(false);
    expect(evaluateSeedCount(null).ok).toBe(false);
  });

  it("connector and every task must be RUNNING", () => {
    const run = {
      connector: { state: "RUNNING" },
      tasks: [{ id: 0, state: "RUNNING" }],
    };
    expect(evaluateConnectorStatus(run).ok).toBe(true);
    expect(
      evaluateConnectorStatus({ ...run, tasks: [{ id: 0, state: "FAILED" }] }),
    ).toMatchObject({
      ok: false,
      reason: "task 0 is FAILED",
    });
    expect(evaluateConnectorStatus({ ...run, tasks: [] }).ok).toBe(false);
    expect(
      evaluateConnectorStatus({ connector: { state: "UNASSIGNED" }, tasks: [] })
        .ok,
    ).toBe(false);
    expect(evaluateConnectorStatus(null).ok).toBe(false);
  });

  it("needs the snapshot rows and the documented update with an lsn", () => {
    expect(evaluateChangeEvents([...snapshot, update]).ok).toBe(true);
    expect(evaluateChangeEvents(snapshot).reason).toMatch(/no update event/);
    expect(
      evaluateChangeEvents([...snapshot.slice(0, 3), update]).reason,
    ).toMatch(/3 snapshot rows/);
    expect(
      evaluateChangeEvents([
        ...snapshot,
        { ...update, after: { id: 1, weight: 2.5 } },
      ]).ok,
    ).toBe(false);
    expect(
      evaluateChangeEvents([...snapshot, { ...update, source: {} }]).reason,
    ).toMatch(/lsn/);
    expect(evaluateChangeEvents(undefined).ok).toBe(false);
  });
});

describe("pollUntil", () => {
  const clock = () => {
    let t = 0;
    return { now: () => t, sleep: async (ms) => void (t += ms) };
  };

  it("returns the first passing attempt", async () => {
    let n = 0;
    const r = await pollUntil(
      async () => ({ ok: ++n === 3, reason: `try ${n}` }),
      {
        timeoutMs: 100,
        intervalMs: 10,
        ...clock(),
      },
    );
    expect(r).toEqual({ ok: true, reason: "try 3" });
  });

  it("fails with the last reason when time runs out", async () => {
    const r = await pollUntil(
      async () => ({ ok: false, reason: "still down" }),
      {
        timeoutMs: 50,
        intervalMs: 20,
        ...clock(),
      },
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("timed out after 50 ms: still down");
  });
});

describe("lab stays tied to the files it documents", () => {
  it("plan names the documented connector, topic and script", () => {
    const plan = buildPlan().join("\n");
    expect(plan).toContain(CONNECTOR_NAME);
    expect(plan).toContain(TOPIC);
    expect(plan).toContain("sandbox/register-postgres-connector.sh");
  });

  it("connector config and the README agree with the constants", () => {
    const cfg = JSON.parse(read("sandbox/connectors/postgres-connector.json"));
    expect(cfg.name).toBe(CONNECTOR_NAME);
    expect(`${cfg.config["topic.prefix"]}.public.products`).toBe(TOPIC);
    expect(cfg.config["table.include.list"]).toContain("public.products");
    expect(read("sandbox/README.md")).toContain("5 products");
  });
});

describe("labs-verify workflow", () => {
  // Comment lines are dropped so the explanation at the top cannot satisfy
  // or break a pattern.
  const wf = read(".github/workflows/labs-verify.yml")
    .split("\n")
    .filter((l) => !l.trim().startsWith("#"))
    .join("\n");

  it("is manual plus weekly, read-only, bounded, and not tied to PRs or secrets", () => {
    expect(wf).toMatch(/^on:\n {2}workflow_dispatch:/m);
    expect(wf).toMatch(/schedule:\n\s+- cron: "\d+ \d+ \* \* \d"/);
    expect(wf).toMatch(/^permissions:\n {2}contents: read$/m);
    expect(wf).toMatch(/timeout-minutes: \d+/);
    expect(wf).toMatch(/concurrency:\n {2}group: labs-verify/);
    expect(wf).not.toMatch(/pull_request|push:|secrets\./);
    expect(wf).toContain("node scripts/labs-verify.mjs");
  });
});
