import type {
  CDCMode,
  Event,
  Table,
  SourceOp,
  SchemaColumn,
  SchemaChangeAction,
} from "../domain/types";
import type { EventBus } from "../engine/eventBus";
import type { Scheduler } from "../engine/scheduler";
import type { MetricsStore } from "../engine/metrics";

export type ModeIdentifier = Extract<CDCMode, 'LOG_BASED' | 'QUERY_BASED' | 'TRIGGER_BASED'>;

export type ModeRuntime = {
  bus: EventBus;
  scheduler: Scheduler;
  metrics: MetricsStore;
  topic: string;
};

export type EmitFn = (events: Event[]) => Event[];

export interface ModeLifecycle {
  startSnapshot?(tables: Table[], emit: EmitFn): void;
  startTailing?(emit: EmitFn): void;
  pause?(): void;
  resume?(): void;
  stop?(): void;
}

export interface ModeAdapter extends ModeLifecycle {
  readonly id: ModeIdentifier;
  initialise?(runtime: ModeRuntime): void;
  configure?(config: Record<string, unknown>): void;
  /**
   * `scenarioIndex` is the op's 0-based index in the scenario's `ops`. Only the
   * scenario runner passes it; synthetic (generator) ops do not, so a
   * `redeliver.ref` can never land on one.
   */
  applySource?(op: SourceOp, scenarioIndex?: number): void;
  applySchemaChange?(table: string, action: SchemaChangeAction, column: SchemaColumn, commitTs: number): void;
  tick?(nowMs: number): void;
}
