import { describe, expect, it } from "vitest";
import { isOrderedByLogPosition, type PositionedEvent } from "../../features/logPosition";

type TestEvent = PositionedEvent & { ts_ms: number };

const evt = (table: string, id: string, lsn: number | null, ts_ms: number): TestEvent => ({
  table,
  pk: { id },
  tx: { lsn },
  ts_ms,
});

describe("isOrderedByLogPosition", () => {
  it("reads ordered when timestamps decrease but log positions increase", () => {
    // Clock skew: the later change in the log carries an earlier wall-clock time.
    const events = [evt("customers", "C-1", 0, 500), evt("customers", "C-1", 1, 200), evt("orders", "O-1", 2, 100)];
    expect(isOrderedByLogPosition(events)).toBe(true);
  });

  it("reads misordered when timestamps increase but a key's log position goes backwards", () => {
    const events = [evt("customers", "C-1", 5, 100), evt("customers", "C-1", 3, 900)];
    expect(isOrderedByLogPosition(events)).toBe(false);
  });

  it("treats equal positions and tied timestamps as ordered", () => {
    const events = [evt("customers", "C-1", 4, 100), evt("customers", "C-1", 4, 100)];
    expect(isOrderedByLogPosition(events)).toBe(true);
  });

  it("only compares positions within the same table and key", () => {
    const events = [evt("customers", "C-1", 9, 10), evt("customers", "C-2", 1, 20), evt("orders", "C-1", 2, 30)];
    expect(isOrderedByLogPosition(events)).toBe(true);
  });

  it("ignores events that carry no log position", () => {
    const events = [evt("customers", "C-1", null, 300), evt("customers", "C-1", 2, 100), evt("customers", "C-1", null, 50)];
    expect(isOrderedByLogPosition(events)).toBe(true);
  });

  it("does not call a repeat delivery of an already-seen position a reordering", () => {
    const events = [evt("customers", "C-1", 0, 10), evt("customers", "C-1", 3, 20), evt("customers", "C-1", 0, 10)];
    expect(isOrderedByLogPosition(events)).toBe(true);
  });

  it("still flags a new lower position arriving after a higher one", () => {
    const events = [evt("customers", "C-1", 0, 10), evt("customers", "C-1", 3, 20), evt("customers", "C-1", 1, 30)];
    expect(isOrderedByLogPosition(events)).toBe(false);
  });

  it("reads an empty lane as ordered", () => {
    expect(isOrderedByLogPosition([])).toBe(true);
  });
});
