#!/usr/bin/env node
/**
 * Score the CDC assistant against the golden question set (P17-37).
 *
 * Offline and deterministic: it runs the shipped matcher
 * (src/js/assistant-matcher.js) over the shipped knowledge base
 * (src/data/assistant.yml). No network, no model calls.
 *
 *   node scripts/assistant-golden.mjs          # print the report
 *   node scripts/assistant-golden.mjs --json   # print the summary as JSON
 *
 * A question passes when the intent the matcher returns equals `expect`
 * (null means "no answer") AND, for each rule named in `thesis`, the returned
 * answer satisfies that required pattern. Separately, no answer in the
 * knowledge base may match a forbidden thesis pattern (see forbiddenHits).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { matchIntent } from "../src/js/assistant-matcher.js";
import { parseAssistantYaml } from "../lib/assistant-yaml.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const GOLDEN_PATH = path.join(
  root,
  "tests/fixtures/assistant-golden.json",
);
export const BASELINE_PATH = path.join(
  root,
  "tests/fixtures/assistant-golden-baseline.json",
);

export function loadKnowledgeBase() {
  return parseAssistantYaml(
    fs.readFileSync(path.join(root, "src/data/assistant.yml"), "utf8"),
  );
}

export function loadGolden() {
  return JSON.parse(fs.readFileSync(GOLDEN_PATH, "utf8"));
}

const re = (pattern) => new RegExp(pattern, "i");

/** Answers in the knowledge base that match a forbidden thesis pattern. */
export function forbiddenHits(kb, golden) {
  const hits = [];
  for (const rule of golden.thesis.forbidden) {
    const rx = re(rule.pattern);
    for (const intent of kb.intents) {
      const m = rx.exec(intent.answer);
      if (m) hits.push({ intent: intent.id, rule: rule.label, text: m[0] });
    }
  }
  return hits;
}

/** Score every golden question. Pure: takes the parsed inputs. */
export function evaluate(kb, golden) {
  const results = golden.questions.map((item) => {
    const intent = matchIntent(item.q, kb, item.module ?? null);
    const got = intent?.id ?? null;
    const routed = got === item.expect;
    const thesisFailures = [];
    for (const name of item.thesis ?? []) {
      const rule = golden.thesis.required[name];
      if (!rule) {
        thesisFailures.push(`unknown thesis rule "${name}"`);
      } else if (!intent || !re(rule.pattern).test(intent.answer)) {
        thesisFailures.push(rule.label);
      }
    }
    for (const rule of golden.thesis.forbidden) {
      if (intent && re(rule.pattern).test(intent.answer)) {
        thesisFailures.push(`forbidden: ${rule.label}`);
      }
    }
    return {
      q: item.q,
      expect: item.expect,
      got,
      kind: item.kind ?? "in-scope",
      routed,
      thesisFailures,
      pass: routed && thesisFailures.length === 0,
    };
  });

  const inScope = results.filter((r) => r.expect !== null);
  const outOfScope = results.filter((r) => r.expect === null);
  const perIntent = {};
  for (const r of inScope) {
    const row = (perIntent[r.expect] ??= { total: 0, passed: 0 });
    row.total += 1;
    if (r.pass) row.passed += 1;
  }
  return {
    results,
    perIntent,
    total: results.length,
    passed: results.filter((r) => r.pass).length,
    inScopeTotal: inScope.length,
    inScopePassed: inScope.filter((r) => r.pass).length,
    notAnswered: inScope.filter((r) => r.got === null).length,
    outOfScopeTotal: outOfScope.length,
    outOfScopeRefused: outOfScope.filter((r) => r.got === null).length,
  };
}

const pct = (n, d) => (d === 0 ? "n/a" : `${((100 * n) / d).toFixed(1)}%`);

/** Stable text report: same input gives byte-identical output. */
export function formatReport(summary) {
  const s = summary;
  const lines = [
    "assistant golden set",
    `questions: ${s.total} (in scope ${s.inScopeTotal}, out of scope ${s.outOfScopeTotal})`,
    `pass: ${s.passed}/${s.total} (${pct(s.passed, s.total)})`,
    `precision@1 (in scope): ${s.inScopePassed}/${s.inScopeTotal} (${pct(s.inScopePassed, s.inScopeTotal)})`,
    `not-answered rate (in scope): ${s.notAnswered}/${s.inScopeTotal} (${pct(s.notAnswered, s.inScopeTotal)})`,
    `honest refusals (out of scope): ${s.outOfScopeRefused}/${s.outOfScopeTotal} (${pct(s.outOfScopeRefused, s.outOfScopeTotal)})`,
    "",
    "per intent (passed/total)",
  ];
  for (const id of Object.keys(s.perIntent).sort()) {
    const { passed, total } = s.perIntent[id];
    lines.push(`  ${id}: ${passed}/${total}`);
  }
  const failing = s.results.filter((r) => !r.pass);
  lines.push("", `failing (${failing.length})`);
  for (const r of failing) {
    const why = r.routed ? r.thesisFailures.join("; ") : `got ${r.got}`;
    lines.push(`  ${JSON.stringify(r.q)} expected ${r.expect}: ${why}`);
  }
  return lines.join("\n");
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const summary = evaluate(loadKnowledgeBase(), loadGolden());
  const out = process.argv.includes("--json")
    ? JSON.stringify(summary, null, 2)
    : formatReport(summary);
  process.stdout.write(`${out}\n`);
}
