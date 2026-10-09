import type { SourceOp } from "../domain/types";
import type { SinkOptions } from "../domain/storage";

export type SharedScenarioSink = SinkOptions;
import sharedScenarios from "../../assets/shared-scenarios.js";

export type SharedScenarioComparatorLane = {
  method?: unknown;
  eventCount?: unknown;
  metrics?: unknown;
};

export type SharedScenarioComparator = {
  preferences?: unknown;
  summary?: unknown;
  analytics?: unknown;
  diffs?: unknown;
  tags?: unknown;
  preset?: unknown;
  overlay?: unknown;
  lanes?: unknown;
} | null;

export type SharedScenarioColumnType = "string" | "number" | "bool" | "json";

export type SharedScenarioColumn = {
  name: string;
  type: SharedScenarioColumnType;
  pk: boolean;
};

export type SharedScenarioRow = Record<string, unknown>;

export type SharedScenarioEvent = Record<string, unknown>;

export type SharedScenario = {
  id: string;
  name: string;
  label?: string;
  description: string;
  highlight?: string;
  tags?: string[];
  seed?: number;
  schemaVersion?: number;
  table?: string;
  schema?: SharedScenarioColumn[];
  rows?: SharedScenarioRow[];
  events?: SharedScenarioEvent[];
  ops?: SourceOp[];
  /** How the log lane's destination applies events when the scenario loads. Defaults to no guard. */
  sink?: SharedScenarioSink;
  comparator?: SharedScenarioComparator;
};

export default sharedScenarios as SharedScenario[];
