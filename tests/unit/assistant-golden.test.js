import { describe, it, expect } from "vitest";
import fs from "node:fs";
import {
  BASELINE_PATH,
  evaluate,
  forbiddenHits,
  formatReport,
  loadGolden,
  loadKnowledgeBase,
} from "../../scripts/assistant-golden.mjs";

/**
 * Golden question set for the assistant (P17-37). Offline and deterministic:
 * the shipped matcher over the shipped knowledge base, no network or model.
 * Floors live in tests/fixtures/assistant-golden-baseline.json and move only
 * upward. Known failures are listed in the fixture; a new failure, or a known
 * failure that now passes, fails this file so the list and floors stay true.
 */
const kb = loadKnowledgeBase();
const golden = loadGolden();
const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
const summary = evaluate(kb, golden);

const HOW_TO_FIX =
  "Do not lower tests/fixtures/assistant-golden-baseline.json or add to knownFailures to make this pass. Fix the matcher or the knowledge base. When a known failure starts passing, remove it from knownFailures and raise the baseline.";

describe("assistant golden set: the fixture", () => {
  it("has at least 40 in-scope and 10 adversarial questions", () => {
    expect(summary.inScopeTotal).toBeGreaterThanOrEqual(40);
    const adversarial = golden.questions.filter(
      (q) => q.kind === "adversarial",
    );
    expect(adversarial.length).toBeGreaterThanOrEqual(10);
  });

  it("names a real intent for every expected id and has no repeated question", () => {
    const ids = new Set(kb.intents.map((i) => i.id));
    for (const q of golden.questions) {
      if (q.expect !== null) expect(ids.has(q.expect), q.q).toBe(true);
    }
    const texts = golden.questions.map((q) => q.q);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it("lists only known failures that are questions in the set", () => {
    const texts = new Set(golden.questions.map((q) => q.q));
    for (const q of golden.knownFailures) expect(texts.has(q), q).toBe(true);
  });

  it("covers every thesis-critical topic with a thesis-checked question", () => {
    const thesisQs = golden.questions.filter((q) => (q.thesis ?? []).length);
    const text = thesisQs.map((q) => q.q.toLowerCase()).join("\n");
    for (const term of ["exactly", "ts_ms", "lsn", "dedupe", "duplicate"]) {
      expect(text, term).toContain(term);
    }
  });
});

describe("assistant golden set: thesis rules", () => {
  it("no answer in the knowledge base makes a forbidden claim", () => {
    expect(forbiddenHits(kb, golden)).toEqual([]);
  });

  it("the forbidden patterns do catch the claims they name", () => {
    const bad = [
      "CDC guarantees exactly-once end to end.",
      "Debezium provides end-to-end exactly-once delivery.",
      "Exactly-once is guaranteed here.",
      "Order by ts_ms and you are fine.",
      "Sort on the ts_ms column.",
      "ts_ms is the commit time.",
      "Debezium never delivers duplicates.",
      "Arrival order is fine.",
    ];
    for (const text of bad) {
      const fake = { intents: [{ id: "x", answer: text }] };
      expect(forbiddenHits(fake, golden).length, text).toBeGreaterThan(0);
    }
  });

  it("the forbidden patterns leave honest negations alone", () => {
    const ok = [
      "none gives end-to-end exactly-once across systems",
      "end-to-end exactly-once is not achievable in general",
      "Order on the log position, not on ts_ms.",
      "Debezium does not guarantee end-to-end exactly-once.",
    ];
    for (const text of ok) {
      const fake = { intents: [{ id: "x", answer: text }] };
      expect(forbiddenHits(fake, golden), text).toEqual([]);
    }
  });
});

describe("assistant golden set: score and ratchet", () => {
  it("prints a stable report", () => {
    const report = formatReport(summary);
    expect(report).toBe(formatReport(evaluate(kb, golden)));
    expect(report).toMatch(
      /^precision@1 \(in scope\): \d+\/\d+ \(\d+\.\d%\)$/m,
    );
    expect(report).toMatch(/^not-answered rate \(in scope\): \d+\/\d+ /m);
  });

  it("does not shrink the set or drop below the recorded floors", () => {
    expect(summary.total, HOW_TO_FIX).toBeGreaterThanOrEqual(baseline.minTotal);
    expect(summary.passed, HOW_TO_FIX).toBeGreaterThanOrEqual(
      baseline.minPassed,
    );
    expect(summary.inScopePassed, HOW_TO_FIX).toBeGreaterThanOrEqual(
      baseline.minInScopePassed,
    );
    expect(summary.outOfScopeRefused, HOW_TO_FIX).toBeGreaterThanOrEqual(
      baseline.minOutOfScopeRefused,
    );
  });

  it("fails only on the recorded known failures", () => {
    const failing = summary.results.filter((r) => !r.pass).map((r) => r.q);
    expect(failing.sort(), HOW_TO_FIX).toEqual(
      [...golden.knownFailures].sort(),
    );
  });
});
