import { describe, expect, it } from "vitest";
import { createLogBasedAdapter, type ModeRuntime } from "../../modes";
import { EventBus } from "../../engine/eventBus";
import { Scheduler } from "../../engine/scheduler";
import { MetricsStore } from "../../engine/metrics";
import { InMemoryTableStorage, type SinkOptions } from "../../domain/storage";
import type { Event, SourceOp } from "../../domain/types";
import { SCENARIO_TEMPLATES } from "../../features/scenarios";
import { getScenarioGuidance } from "../../features/scenarioGuidance";

const TOPIC = "cdc.log";

/**
 * Run a scenario's ops through the log adapter and a destination the way the
 * Compare tab does: ops are applied in order as time passes, the adapter is
 * ticked, and whatever reaches the bus is applied to the lane's storage.
 */
function runLogLane(ops: SourceOp[], sink?: SinkOptions) {
  const bus = new EventBus<Event>();
  const runtime: ModeRuntime = { bus, scheduler: new Scheduler(), metrics: new MetricsStore(), topic: TOPIC };
  const adapter = createLogBasedAdapter();
  adapter.initialise?.(runtime);
  adapter.configure?.({ fetch_interval_ms: 50 });
  adapter.startTailing?.(events => bus.publish(TOPIC, events));
  const storage = new InMemoryTableStorage([], sink);
  const applied: Event[] = [];
  const statusHistory: Array<string | undefined> = [];
  const horizon = (ops.length ? Math.max(...ops.map(op => op.t)) : 0) + 1000;
  let next = 0;
  for (let now = 0; now <= horizon; now += 50) {
    while (next < ops.length && ops[next].t <= now) {
      adapter.applySource?.(ops[next], next);
      next += 1;
    }
    adapter.tick?.(now);
    for (const event of bus.consume(TOPIC, 100)) {
      storage.applyEvent(event);
      applied.push(event);
      statusHistory.push(String(storage.getTable("orders")?.rows[0]?.status));
    }
  }
  return {
    applied,
    rows: storage.getTable("orders")?.rows ?? [],
    stats: storage.getSinkStats(),
    markers: storage.getTombstones(),
    statusHistory,
  };
}

const lab = (id: string) => {
  const template = SCENARIO_TEMPLATES.find(t => t.id === id);
  if (!template) throw new Error(`missing scenario ${id}`);
  return template;
};

const statusOf = (rows: Array<Record<string, unknown>>, id: string) => rows.find(r => r.id === id)?.status;

describe("lab: replay against a guarded sink", () => {
  const { ops, sink } = lab("replay-guard");

  it("starts unguarded and redelivers the paid and shipped changes", () => {
    expect(sink).toEqual({ guard: "none", deleteMarkers: false });
    expect(ops.filter(op => op.op === "redeliver").map(op => (op.op === "redeliver" ? op.ref : null))).toEqual([1, 2]);
  });

  it("no guard: applies 5 deliveries for 3 changes and shows paid again after shipped", () => {
    const run = runLogLane(ops, { guard: "none" });
    expect(run.applied).toHaveLength(5);
    expect(run.statusHistory).toEqual(["created", "paid", "shipped", "paid", "shipped"]);
    expect(statusOf(run.rows, "ORD-1")).toBe("shipped");
    expect(run.stats).toEqual({ applied: 5, skipped: 0, staleApplied: 2 });
  });

  it("position guard: skips both repeats and never goes back to paid", () => {
    const run = runLogLane(ops, { guard: "position" });
    expect(run.statusHistory).toEqual(["created", "paid", "shipped", "shipped", "shipped"]);
    expect(run.stats).toEqual({ applied: 3, skipped: 2, staleApplied: 0 });
  });

  it("the repeats carry the position of their first delivery", () => {
    const run = runLogLane(ops);
    const originals = run.applied.filter(e => !e.redelivered);
    const repeats = run.applied.filter(e => e.redelivered);
    expect(repeats.map(e => e.sourcePosition)).toEqual([originals[1].offset, originals[2].offset]);
  });
});

describe("lab: ts_ms against log position", () => {
  const { ops, sink } = lab("ts-vs-position");

  it("starts with the timestamp guard", () => {
    expect(sink?.guard).toBe("timestamp");
  });

  it("the skewed refund carries an older ts_ms than the paid change before it, and the tie carries the same", () => {
    const run = runLogLane(ops);
    const tsOf = (id: string, status: string) =>
      run.applied.find(e => e.after?.id === id && e.after?.status === status)?.commitTs;
    expect(tsOf("ORD-7", "paid")).toBe(205);
    expect(tsOf("ORD-7", "refunded")).toBe(198);
    expect(tsOf("ORD-8", "paid")).toBe(tsOf("ORD-8", "refunded"));
  });

  it("timestamp guard keeps paid for both orders and skips one change each", () => {
    const run = runLogLane(ops, { guard: "timestamp" });
    expect(statusOf(run.rows, "ORD-7")).toBe("paid");
    expect(statusOf(run.rows, "ORD-8")).toBe("paid");
    expect(run.stats.skipped).toBe(2);
  });

  it("position guard ends on refunded for both orders and skips nothing", () => {
    const run = runLogLane(ops, { guard: "position" });
    expect(statusOf(run.rows, "ORD-7")).toBe("refunded");
    expect(statusOf(run.rows, "ORD-8")).toBe("refunded");
    expect(run.stats.skipped).toBe(0);
  });

  it("no guard also ends on refunded: the log delivered everything once, in order", () => {
    const run = runLogLane(ops, { guard: "none" });
    expect(statusOf(run.rows, "ORD-7")).toBe("refunded");
    expect(run.applied.every(e => !e.redelivered)).toBe(true);
  });
});

describe("lab: delete followed by a late update", () => {
  const { ops, sink } = lab("delete-then-late-update");

  it("starts with no guard and no markers", () => {
    expect(sink).toEqual({ guard: "none", deleteMarkers: false });
  });

  it("no guard, no markers: the deleted order comes back as packed", () => {
    const run = runLogLane(ops, { guard: "none", deleteMarkers: false });
    expect(run.rows).toHaveLength(1);
    expect(statusOf(run.rows, "ORD-9")).toBe("packed");
  });

  it("position guard without markers: still comes back", () => {
    const run = runLogLane(ops, { guard: "position", deleteMarkers: false });
    expect(statusOf(run.rows, "ORD-9")).toBe("packed");
    expect(run.stats.skipped).toBe(0);
  });

  it("markers without a guard: still comes back", () => {
    const run = runLogLane(ops, { guard: "none", deleteMarkers: true });
    expect(run.rows).toHaveLength(1);
  });

  it("position guard with markers: stays deleted, skips the repeat and keeps a marker at the delete's position", () => {
    const run = runLogLane(ops, { guard: "position", deleteMarkers: true });
    expect(run.rows).toHaveLength(0);
    expect(run.stats.skipped).toBe(1);
    const deleteEvent = run.applied.find(e => e.kind === "DELETE");
    expect(run.markers).toEqual([
      { table: "orders", id: "ORD-9", position: deleteEvent?.offset, ts: 300 },
    ]);
  });
});

describe("new scenarios are well formed", () => {
  const ids = ["replay-guard", "ts-vs-position", "delete-then-late-update"];

  it.each(ids)("%s has guidance copy and valid redeliver refs", id => {
    const template = lab(id);
    expect(getScenarioGuidance(template.name)).not.toBeNull();
    template.ops.forEach((op, index) => {
      if (op.op !== "redeliver") return;
      const target = template.ops[op.ref];
      expect(op.ref).toBeLessThan(index);
      expect(target).toBeDefined();
      expect(target.op).not.toBe("redeliver");
      expect(target.table).toBe(op.table);
      expect(target.pk.id).toBe(op.pk.id);
    });
  });

  it("every other scenario in the list is unchanged by the guard modes", () => {
    const others = SCENARIO_TEMPLATES.filter(t => !ids.includes(t.id));
    expect(others.length).toBeGreaterThanOrEqual(11);
    const modes: SinkOptions[] = [
      { guard: "timestamp" },
      { guard: "position" },
      { guard: "position", deleteMarkers: true },
    ];
    for (const template of others) {
      const baseline = runLogLane(template.ops);
      for (const mode of modes) {
        const run = runLogLane(template.ops, mode);
        // Same rows, and the guard never refused a delivery. A timestamp guard
        // may skip same-millisecond writes; the position guard may not.
        if (mode.guard === "position") {
          expect(run.stats.skipped, `${template.id} ${JSON.stringify(mode)}`).toBe(0);
        }
        if (mode.guard === "position") {
          expect(run.rows, `${template.id} ${JSON.stringify(mode)}`).toEqual(baseline.rows);
        }
      }
    }
  });
});
