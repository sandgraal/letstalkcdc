import { describe, expect, it } from "vitest";
import { createLogBasedAdapter, createQueryBasedAdapter, createTriggerBasedAdapter, type ModeAdapter, type ModeRuntime } from "../../modes";
import { EventBus } from "../../engine/eventBus";
import { Scheduler } from "../../engine/scheduler";
import { MetricsStore } from "../../engine/metrics";
import type { Event, SourceOp } from "../../domain/types";

const TOPIC = "cdc.log";

function startLane(adapter: ModeAdapter, topic = TOPIC) {
  const bus = new EventBus<Event>();
  const runtime: ModeRuntime = { bus, scheduler: new Scheduler(), metrics: new MetricsStore(), topic };
  adapter.initialise?.(runtime);
  adapter.configure?.({ fetch_interval_ms: 10, poll_interval_ms: 10, extract_interval_ms: 10 });
  // Publish through the bus, exactly as CDCController.emit does, so events get
  // the per-topic offset a real lane would stamp.
  const delivered: Event[] = [];
  adapter.startTailing?.(events => {
    const enriched = bus.publish(topic, events);
    delivered.push(...enriched);
    return enriched;
  });
  let now = 0;
  return {
    delivered,
    apply: (op: SourceOp) => adapter.applySource?.(op),
    advance: (ms: number) => {
      now += ms;
      adapter.tick?.(now);
    },
  };
}

const order = (t: number, op: "insert" | "update", status: string): SourceOp => ({
  t,
  op,
  table: "orders",
  pk: { id: "ORD-1" },
  after: { status },
});

const redeliver = (t: number, ref: number): SourceOp => ({
  t,
  op: "redeliver",
  ref,
  table: "orders",
  pk: { id: "ORD-1" },
});

const position = (event: Event) => event.sourcePosition ?? event.offset;

// Reference sinks used only to state the property. The playground's own sink
// modes are tested in sinkGuard.test.ts.
function naiveSink(events: Event[]) {
  let row: Record<string, unknown> | null = null;
  let applications = 0;
  for (const event of events) {
    applications += 1;
    row = event.kind === "DELETE" ? null : { ...(row ?? {}), ...(event.after ?? {}) };
  }
  return { row, applications };
}

function positionGuardedSink(events: Event[]) {
  let row: Record<string, unknown> | null = null;
  let last = -Infinity;
  let applications = 0;
  let skipped = 0;
  for (const event of events) {
    const pos = position(event) as number;
    if (pos <= last) {
      skipped += 1;
      continue;
    }
    last = pos;
    applications += 1;
    row = event.kind === "DELETE" ? null : { ...(row ?? {}), ...(event.after ?? {}) };
  }
  return { row, applications, skipped };
}

describe("redeliver (at-least-once redelivery of a log record)", () => {
  it("re-sends an already delivered record with its original position, and nothing else changes", () => {
    const lane = startLane(createLogBasedAdapter());
    lane.apply(order(100, "insert", "created"));
    lane.apply(order(200, "update", "paid"));
    lane.advance(50);
    const [first, second] = lane.delivered;
    expect(lane.delivered).toHaveLength(2);

    lane.apply(redeliver(400, 1));
    lane.advance(50);

    expect(lane.delivered).toHaveLength(3);
    const copy = lane.delivered[2];
    expect(copy.redelivered).toBe(true);
    // Fresh delivery, original position.
    expect(copy.offset).toBeGreaterThan(second.offset as number);
    expect(copy.sourcePosition).toBe(second.offset);
    expect(position(copy)).toBe(position(second));
    // Same change: payload and commit time are the original's.
    expect(copy.kind).toBe(second.kind);
    expect(copy.after).toEqual(second.after);
    expect(copy.commitTs).toBe(second.commitTs);
    expect(copy.id).not.toBe(second.id);
    // The originals are untouched.
    expect(first.redelivered).toBeUndefined();
    expect(second.redelivered).toBeUndefined();
    expect(second.sourcePosition).toBeUndefined();
  });

  it("flushes a not-yet-delivered record first, so the original position exists", () => {
    const lane = startLane(createLogBasedAdapter());
    lane.apply(order(100, "insert", "created"));
    // No tick between the write and the redelivery.
    lane.apply(redeliver(101, 0));
    lane.advance(50);
    expect(lane.delivered).toHaveLength(2);
    expect(lane.delivered[1].sourcePosition).toBe(lane.delivered[0].offset);
  });

  it("ignores a ref that names no row op, and a redelivery of a redelivery", () => {
    const lane = startLane(createLogBasedAdapter());
    lane.apply(order(100, "insert", "created"));
    lane.advance(50);
    lane.apply(redeliver(200, 7));
    lane.apply(redeliver(210, 0));
    lane.apply(redeliver(220, 2)); // op 2 is itself a redelivery
    lane.advance(50);
    expect(lane.delivered.filter(e => e.redelivered)).toHaveLength(1);
  });

  it("is a log-lane concept: polling and trigger lanes emit nothing for it", () => {
    for (const adapter of [createQueryBasedAdapter(), createTriggerBasedAdapter()]) {
      const lane = startLane(adapter);
      lane.apply(order(100, "insert", "created"));
      lane.advance(600);
      const before = lane.delivered.length;
      lane.apply(redeliver(700, 0));
      lane.advance(600);
      expect(lane.delivered).toHaveLength(before);
    }
  });

  it("a naive sink double-applies a replay; a position-guarded sink converges", () => {
    const lane = startLane(createLogBasedAdapter());
    lane.apply(order(100, "insert", "created"));
    lane.apply(order(200, "update", "paid"));
    lane.apply(order(300, "update", "shipped"));
    lane.advance(50);
    // Rewind: the consumer restarts and the log re-sends the last two records.
    lane.apply(redeliver(400, 1));
    lane.apply(redeliver(410, 2));
    lane.advance(50);

    expect(lane.delivered).toHaveLength(5);
    const naive = naiveSink(lane.delivered);
    expect(naive.applications).toBe(5); // 3 changes, 5 applications
    const guarded = positionGuardedSink(lane.delivered);
    expect(guarded.applications).toBe(3);
    expect(guarded.skipped).toBe(2);
    expect(guarded.row?.status).toBe("shipped");
  });

  it("holds for random redelivery patterns: the guarded sink always ends on the source state", () => {
    let state = 12345;
    const rand = () => {
      state = (state * 16807) % 2147483647;
      return (state - 1) / 2147483646;
    };
    for (let run = 0; run < 40; run += 1) {
      const lane = startLane(createLogBasedAdapter());
      lane.apply(order(100, "insert", "s0"));
      let opCount = 1;
      let t = 100;
      const writes = 3 + Math.floor(rand() * 5);
      for (let i = 1; i <= writes; i += 1) {
        t += 50;
        lane.apply(order(t, "update", `s${i}`));
        opCount += 1;
        lane.advance(20);
        if (rand() < 0.6) {
          t += 5;
          lane.apply(redeliver(t, Math.floor(rand() * opCount)));
          opCount += 1;
        }
      }
      // Always rewind to the oldest record last, the worst case for upsert.
      lane.apply(redeliver(t + 5, 0));
      lane.advance(50);

      const guarded = positionGuardedSink(lane.delivered);
      expect(guarded.row?.status).toBe(`s${writes}`);
      const naive = naiveSink(lane.delivered);
      expect(naive.row?.status).toBe("s0");
      expect(naive.applications).toBeGreaterThan(writes + 1);
    }
  });
});
