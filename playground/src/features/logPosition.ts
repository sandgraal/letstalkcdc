/**
 * Ordering in CDC is defined by the source log position (LSN / bus offset), not by
 * wall-clock timestamps. Two commits can share a timestamp, and clocks skew; the
 * position stamped when the change entered the log cannot go backwards.
 */
export type PositionedEvent = {
  table: string;
  pk: { id: string };
  tx: { lsn: number | null };
};

/**
 * A lane is ordered when, for every (table, primary key), the log position of each
 * event is not lower than the position of the previous event for that key.
 * Events without a position (for example engines that do not stamp one) are skipped
 * because there is nothing to compare. A position already seen for the key is a
 * repeat delivery of the same log entry, not a reordering, so it is not a violation.
 */
export function isOrderedByLogPosition(events: readonly PositionedEvent[]): boolean {
  const lastPosition = new Map<string, number>();
  const seenPositions = new Map<string, Set<number>>();
  for (const evt of events) {
    const position = evt.tx?.lsn;
    if (typeof position !== "number") continue;
    const key = `${evt.table}\u0000${evt.pk?.id ?? ""}`;
    const seen = seenPositions.get(key) ?? new Set<number>();
    const previous = lastPosition.get(key);
    if (previous !== undefined && position < previous) {
      if (seen.has(position)) continue;
      return false;
    }
    seen.add(position);
    seenPositions.set(key, seen);
    lastPosition.set(key, position);
  }
  return true;
}
