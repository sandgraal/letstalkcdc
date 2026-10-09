import type { Scenario, SourceOp } from "../sim";
import { SCENARIO_TEMPLATES } from "../src/features/scenarios";
import { type ScenarioTemplate } from "../src/features/shared-scenario-normaliser";

export interface ShellScenario extends Scenario {
  id: string;
  label: string;
  description: string;
  highlight?: string;
  stats?: {
    rows: number;
    ops: number;
  };
  table?: string;
  tags: string[];
  schema?: ScenarioTemplate["schema"];
  rows?: ScenarioTemplate["rows"];
  events?: ScenarioTemplate["events"];
  schemaVersion?: number;
  comparator?: ScenarioTemplate["comparator"] | null;
}

function cloneOp(op: SourceOp): SourceOp {
  const clone: SourceOp = { ...op } as SourceOp;
  if (op.pk) {
    clone.pk = { ...op.pk };
  }
  if (op.after) {
    clone.after = { ...op.after } as SourceOp["after"];
  }
  if (op.txn) {
    clone.txn = { ...op.txn };
  }
  return clone;
}

function cloneJson<T>(value: T): T {
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
}

// Distinct rows the scenario touches: pre-existing `rows` plus keys that `ops`
// inserts. `ops` is the source of truth, so inserted rows are not also listed
// in `rows`; counting both keeps the "N rows" label honest.
export function countScenarioRows(template: Pick<ScenarioTemplate, "table" | "rows" | "ops">): number {
  const keys = new Set<string>();
  template.rows.forEach(row => keys.add(`${template.table ?? ""}|${String(row.id)}`));
  template.ops.forEach(op => {
    if (op.op === "insert") keys.add(`${op.table}|${String(op.pk.id)}`);
  });
  return keys.size;
}

function toShellScenario(template: ScenarioTemplate): ShellScenario {
  return {
    id: template.id,
    name: template.name,
    label: template.label,
    description: template.description,
    highlight: template.highlight,
    stats: {
      rows: countScenarioRows(template),
      ops: template.ops.length,
    },
    table: template.table,
    tags: [...template.tags],
    schema: template.schema.length ? template.schema.map(column => ({ ...column })) : undefined,
    rows: template.rows.length ? template.rows.map(row => ({ ...row })) : undefined,
    events: template.events.length ? template.events.map(event => ({ ...event })) : undefined,
    schemaVersion: template.schemaVersion,
    seed: template.seed,
    ops: template.ops.map(cloneOp),
    comparator: template.comparator ? cloneJson(template.comparator) : null,
  };
}

const templates = SCENARIO_TEMPLATES;

if (templates.length === 0 && typeof console !== "undefined") {
  console.warn(
    "No scenario templates were loaded from assets/shared-scenarios.js; the comparator scenario gallery will be empty.",
  );
}

export const SCENARIOS: ShellScenario[] = templates.map(toShellScenario);
