import { describe, expect, it } from "vitest";
import { InMemoryTableStorage, type SinkOptions } from "../../domain/storage";
import type { Event } from "../../domain/types";

let seq = 0;
const evt = (
  kind: Event["kind"],
  offset: number,
  commitTs: number,
  fields: Record<string, unknown> = {},
  extra: Partial<Event> = {},
): Event => {
  const row = { id: "ORD-1", ...fields };
  return {
    id: `e${++seq}`,
    kind,
    table: "orders",
    before: kind === "DELETE" ? row : undefined,
    after: kind === "DELETE" ? undefined : row,
    commitTs,
    schemaVersion: 1,
    topic: "cdc.log",
    partition: 0,
    offset,
    ...extra,
  };
};

/** A redelivery: a fresh bus offset, the position of the first delivery. */
const redelivered = (original: Event, newOffset: number, extra: Partial<Event> = {}): Event => ({
  ...original,
  id: `e${++seq}`,
  offset: newOffset,
  sourcePosition: original.sourcePosition ?? original.offset,
  redelivered: true,
  ...extra,
});

const run = (events: Event[], options?: SinkOptions) => {
  const sink = new InMemoryTableStorage([], options);
  const history: Array<Record<string, unknown> | undefined> = [];
  for (const event of events) {
    sink.applyEvent(event);
    history.push(sink.getTable("orders")?.rows[0]);
  }
  return {
    sink,
    rows: sink.getTable("orders")?.rows ?? [],
    history,
    stats: sink.getSinkStats(),
  };
};

describe("sink guard modes", () => {
  const insert = evt("INSERT", 0, 100, { status: "created" });
  const paid = evt("UPDATE", 1, 200, { status: "paid" });
  const shipped = evt("UPDATE", 2, 300, { status: "shipped" });

  describe("replay of already-delivered changes", () => {
    const stream = [insert, paid, shipped, redelivered(paid, 3), redelivered(shipped, 4)];

    it("no guard: applies every delivery, shows the old value mid-replay, ends right by luck of order", () => {
      const { rows, history, stats } = run(stream);
      expect(history[3]?.status).toBe("paid"); // regressed while the replay ran
      expect(rows[0].status).toBe("shipped");
      expect(stats).toEqual({ applied: 5, skipped: 0, staleApplied: 2 });
    });

    it("no guard: a replay that stops early leaves the stale value", () => {
      const { rows } = run([insert, paid, shipped, redelivered(paid, 3)]);
      expect(rows[0].status).toBe("paid");
    });

    it("position guard: never regresses and skips both repeats", () => {
      const { rows, history, stats } = run(stream, { guard: "position" });
      expect(history.map(row => row?.status)).toEqual(["created", "paid", "shipped", "shipped", "shipped"]);
      expect(rows[0].status).toBe("shipped");
      expect(stats).toEqual({ applied: 3, skipped: 2, staleApplied: 0 });
    });

    it("position guard converges on the same state however the replay is cut", () => {
      for (let cut = 3; cut <= stream.length; cut += 1) {
        const { rows } = run(stream.slice(0, cut), { guard: "position" });
        expect(rows[0].status).toBe("shipped");
      }
    });
  });

  describe("ts_ms against log position", () => {
    // The second change was committed on a node whose clock is behind: it is
    // later in the log but carries an earlier ts_ms.
    const created = evt("INSERT", 0, 100, { status: "created" });
    const paidFirst = evt("UPDATE", 1, 205, { status: "paid" });
    const refundedSkewed = evt("UPDATE", 2, 198, { status: "refunded" });

    it("timestamp guard keeps the wrong winner", () => {
      const { rows, stats } = run([created, paidFirst, refundedSkewed], { guard: "timestamp" });
      expect(rows[0].status).toBe("paid");
      expect(stats.skipped).toBe(1);
    });

    it("position guard keeps the later change in the log", () => {
      const { rows, stats } = run([created, paidFirst, refundedSkewed], { guard: "position" });
      expect(rows[0].status).toBe("refunded");
      expect(stats.skipped).toBe(0);
    });

    it("equal ts_ms is not newer, so the timestamp guard skips the second of two same-millisecond writes", () => {
      const a = evt("UPDATE", 1, 205, { status: "paid" });
      const b = evt("UPDATE", 2, 205, { status: "refunded" });
      expect(run([created, a, b], { guard: "timestamp" }).rows[0].status).toBe("paid");
      expect(run([created, a, b], { guard: "position" }).rows[0].status).toBe("refunded");
    });

    it("no guard applies in arrival order", () => {
      expect(run([created, paidFirst, refundedSkewed]).rows[0].status).toBe("refunded");
    });
  });

  describe("delete followed by a late update", () => {
    const del = evt("DELETE", 3, 400, { status: "packed" });
    const late = redelivered(paid, 4);
    const stream = [insert, paid, del, late];

    it("no guard, physical delete: the row comes back", () => {
      const { rows } = run(stream);
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe("paid");
    });

    it("position guard without a delete marker still resurrects: nothing remembers the delete", () => {
      const { rows, stats } = run(stream, { guard: "position" });
      expect(rows).toHaveLength(1);
      expect(stats.skipped).toBe(0);
    });

    it("delete marker without a guard still resurrects: nothing compares positions", () => {
      const { rows } = run(stream, { deleteMarkers: true });
      expect(rows).toHaveLength(1);
    });

    it("position guard with a delete marker keeps the row deleted and remembers where", () => {
      const { sink, rows, stats } = run(stream, { guard: "position", deleteMarkers: true });
      expect(rows).toHaveLength(0);
      expect(stats.skipped).toBe(1);
      expect(sink.getTombstones()).toEqual([{ table: "orders", id: "ORD-1", position: 3, ts: 400 }]);
    });

    it("a genuinely newer insert after the delete is applied and clears the marker", () => {
      const reinsert = evt("INSERT", 5, 500, { status: "created-again" });
      const { sink, rows } = run([...stream, reinsert], { guard: "position", deleteMarkers: true });
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe("created-again");
      expect(sink.getTombstones()).toHaveLength(0);
    });

    it("a redelivered delete is skipped and keeps the marker", () => {
      const { sink, rows, stats } = run([insert, paid, del, redelivered(del, 4)], {
        guard: "position",
        deleteMarkers: true,
      });
      expect(rows).toHaveLength(0);
      expect(stats.skipped).toBe(1);
      expect(sink.getTombstones()).toHaveLength(1);
    });
  });

  describe("defaults and edge cases", () => {
    it("with no options the sink is the original unconditional upsert", () => {
      const sink = new InMemoryTableStorage();
      expect(sink.getSinkOptions()).toEqual({ guard: "none", deleteMarkers: false });
      sink.applyEvents([insert, paid]);
      expect(sink.getTable("orders")?.rows[0].status).toBe("paid");
    });

    it("an unknown guard value falls back to none", () => {
      const sink = new InMemoryTableStorage([], { guard: "bogus" as never });
      expect(sink.getSinkOptions().guard).toBe("none");
    });

    it("on a clean in-order stream every mode ends on the same rows as no guard", () => {
      const stream = [
        evt("INSERT", 0, 100, { id: "A", n: 1 }),
        evt("INSERT", 1, 110, { id: "B", n: 1 }),
        evt("UPDATE", 2, 120, { id: "A", n: 2 }),
        evt("DELETE", 3, 130, { id: "B" }),
        evt("UPDATE", 4, 140, { id: "A", n: 3 }),
      ];
      const baseline = run(stream).sink.snapshot();
      const modes: SinkOptions[] = [
        { guard: "timestamp" },
        { guard: "position" },
        { guard: "position", deleteMarkers: true },
        { deleteMarkers: true },
      ];
      for (const options of modes) {
        const result = run(stream, options);
        expect(result.sink.snapshot()).toEqual(baseline);
        expect(result.stats.skipped).toBe(0);
      }
    });

    it("an event with no position cannot be compared by the position guard and is applied", () => {
      const noPos = (e: Event): Event => ({ ...e, offset: undefined });
      const { rows, stats } = run([noPos(insert), noPos(paid), noPos(insert)], { guard: "position" });
      expect(rows[0].status).toBe("created");
      expect(stats.skipped).toBe(0);
    });

    it("random replay patterns: the position guard always ends on the last write", () => {
      let state = 99;
      const rand = () => {
        state = (state * 16807) % 2147483647;
        return (state - 1) / 2147483646;
      };
      for (let run_ = 0; run_ < 50; run_ += 1) {
        const writes: Event[] = [evt("INSERT", 0, 100, { status: "s0" })];
        const stream: Event[] = [writes[0]];
        let offset = 1;
        const total = 2 + Math.floor(rand() * 6);
        for (let i = 1; i <= total; i += 1) {
          const write = evt("UPDATE", offset, 100 + i * 10, { status: `s${i}` });
          offset += 1;
          writes.push(write);
          stream.push(write);
          if (rand() < 0.5) {
            stream.push(redelivered(writes[Math.floor(rand() * writes.length)], offset));
            offset += 1;
          }
        }
        stream.push(redelivered(writes[0], offset));
        const guarded = run(stream, { guard: "position", deleteMarkers: true });
        expect(guarded.rows[0].status).toBe(`s${total}`);
        const naive = run(stream);
        expect(naive.rows[0].status).toBe("s0");
        expect(naive.stats.applied).toBeGreaterThan(guarded.stats.applied);
      }
    });
  });
});
