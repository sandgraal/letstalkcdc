import { describe, expect, it } from "vitest";
import { DEMO_SCENARIOS } from "../../../web/changefeed/DemoScenarios";
import { createInitialState, reducePlayground, selectLanes, type PlaygroundState } from "../../changefeed/model";

const runTicks = (state: PlaygroundState, ticks: number) => {
  let next = state;
  for (let i = 0; i < ticks; i += 1) {
    next = reducePlayground(next, { type: "tick", deltaMs: 50 });
  }
  return next;
};

// Replays a demo button the way ChangefeedPlayground does: reset, then the scenario's actions.
const runDemo = (id: string, ticks: number) => {
  const demo = DEMO_SCENARIOS.find(scenario => scenario.id === id);
  if (!demo) throw new Error(`missing demo scenario ${id}`);
  let state = reducePlayground(createInitialState(), { type: "reset" });
  for (const action of demo.actions) {
    state = reducePlayground(state, action);
  }
  return runTicks(state, ticks);
};

describe("apply-on-commit orders by log position", () => {
  it("applies the higher lsn last even when its commit timestamp is earlier", () => {
    // lsn 1 carries the later wall-clock commit time; lsn 2 the earlier one.
    let state = createInitialState({ applyPolicy: "apply-on-commit", partitions: 1 });
    state = reducePlayground(state, { type: "updateCustomer", tier: "first-in-log", commitTs: 900, id: "C-100" });
    state = reducePlayground(state, { type: "updateCustomer", tier: "last-in-log", commitTs: 100, id: "C-100" });
    state = runTicks(state, 6);

    const applied = selectLanes(state).consumer.appliedLog;
    expect(applied.map(evt => evt.lsn)).toEqual([1, 2]);
    expect(selectLanes(state).consumer.tables.customers?.["C-100"]?.tier).toBe("last-in-log");
  });

  it("applies a drift-reordered pair in lsn order regardless of timestamps", () => {
    let state = createInitialState({ applyPolicy: "apply-on-commit", partitions: 2, commitDrift: true });
    state = reducePlayground(state, { type: "updateCustomer", tier: "a", commitTs: 500, id: "C-100" });
    state = reducePlayground(state, { type: "updateCustomer", tier: "b", commitTs: 200, id: "C-100" });
    state = runTicks(state, 8);

    expect(selectLanes(state).consumer.appliedLog.map(evt => evt.lsn)).toEqual([1, 2]);
    expect(selectLanes(state).consumer.tables.customers?.["C-100"]?.tier).toBe("b");
  });
});

describe("fault-injection demo", () => {
  it("drops events and counts them in broker.dropped", () => {
    const state = runDemo("fault-injection", 20);
    const lanes = selectLanes(state);

    expect(lanes.broker.dropped).toBeGreaterThan(0);
    // Every event emitted at the source is either applied/buffered at the consumer or was dropped.
    const delivered = lanes.consumer.appliedLog.length + Object.values(lanes.consumer.buffered).reduce((acc, tx) => acc + tx.events.length, 0) + lanes.consumer.ready.reduce((acc, tx) => acc + tx.events.length, 0);
    expect(delivered + lanes.broker.dropped).toBe(lanes.source.log.length);
  });

  it("never drops anything when the probability is zero", () => {
    let state = reducePlayground(createInitialState(), { type: "insertCustomers", count: 5 });
    state = runTicks(state, 20);
    expect(selectLanes(state).broker.dropped).toBe(0);
  });

  it("drops roughly the requested share across a long run and resets the counter", () => {
    let state = createInitialState({ dropProbability: 0.2, applyPolicy: "apply-as-polled", maxApplyPerTick: 50 });
    state = reducePlayground(state, { type: "injectBacklog", count: 500 });
    state = runTicks(state, 40);
    const dropped = selectLanes(state).broker.dropped;
    expect(dropped).toBeGreaterThan(50);
    expect(dropped).toBeLessThan(150);

    state = reducePlayground(state, { type: "reset" });
    expect(selectLanes(state).broker.dropped).toBe(0);
  });
});

describe("backlog-recovery demo", () => {
  it("shows lag mid-run, then drains it to zero", () => {
    const demo = DEMO_SCENARIOS.find(scenario => scenario.id === "backlog-recovery")!;
    let state = reducePlayground(createInitialState(), { type: "reset" });
    for (const action of demo.actions) state = reducePlayground(state, action);

    const lagSamples: number[] = [];
    for (let i = 0; i < 30; i += 1) {
      state = runTicks(state, 1);
      lagSamples.push(selectLanes(state).metrics.lagMs);
    }

    expect(Math.max(...lagSamples)).toBeGreaterThan(0);
    // Lag is non-zero while a backlog remains and drains monotonically to zero.
    const peak = lagSamples.indexOf(Math.max(...lagSamples));
    const draining = lagSamples.slice(peak);
    expect([...draining].sort((a, b) => b - a)).toEqual(draining);
    expect(lagSamples[lagSamples.length - 1]).toBe(0);
    expect(selectLanes(state).metrics.backlog).toBe(0);
  });

  it("spreads commit timestamps across the injected backlog", () => {
    const state = reducePlayground(createInitialState(), { type: "injectBacklog", count: 12 });
    const commitTimes = new Set(selectLanes(state).source.log.map(evt => evt.commitTs));
    expect(commitTimes.size).toBe(12);
  });
});
