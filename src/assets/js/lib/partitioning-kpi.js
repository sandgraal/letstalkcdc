/**
 * The "Ordering guarantee" KPI of the partitioning simulator.
 *
 * Per-key ordering holds because one key always hashes to one partition. The
 * simulator's key salting spreads the hot key over several partitions, and
 * there is no order across partitions, so the hot key loses it. Salting only
 * applies to the "hot" distribution (see simulate() in pages/partitioning.js).
 */
export const PER_KEY = "Per-key";
export const PER_KEY_BROKEN_FOR_HOT_KEY = "Per-key, broken for the hot key";

export const orderingGuarantee = ({ dist, shards }) =>
  dist === "hot" && Math.max(1, Number(shards) || 1) > 1
    ? PER_KEY_BROKEN_FOR_HOT_KEY
    : PER_KEY;
