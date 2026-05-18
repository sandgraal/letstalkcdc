/**
 * Glossary entries rendered at /glossary/.
 *
 * Each entry has:
 *   - term:       canonical display string (e.g. "WAL / Redo log").
 *   - slug:       kebab-case anchor; the entry renders with
 *                 id="`slug`" so other pages can deep-link to it
 *                 (`/glossary/#tombstone`, etc.).
 *   - definition: HTML string (rendered with `| safe`). Keep
 *                 definitions single-paragraph and link-light;
 *                 root-relative internal links bypass the path
 *                 prefix and 404 in production — use external URLs
 *                 or omit them. The page template adds Related
 *                 anchors automatically.
 *   - aliases:    optional array of alternate names worth listing
 *                 inline (e.g. "binlog" for "WAL").
 *   - related:    optional array of other entries' slugs to
 *                 render as "See also" cross-links.
 *
 * Sort order in the rendered page is alphabetical by `term`; this
 * file can stay grouped by concept area for editor sanity.
 */

export default [
  // ---- Log internals ----
  {
    term: "WAL / Redo log",
    slug: "wal-redo-log",
    aliases: ["WAL", "binlog", "redo log", "T-log"],
    definition: `<p>The database's append-only record of committed
        writes. Log-based CDC tools tail this log instead of polling
        the source tables — Postgres calls it the WAL
        (Write-Ahead Log), MySQL the binlog, Oracle the redo log,
        SQL Server the transaction log (T-log). All four serve the
        same role: a durable, ordered stream of every committed
        change.</p>`,
    related: ["lsn-scn", "log-retention"],
  },
  {
    term: "LSN / SCN",
    slug: "lsn-scn",
    aliases: ["LSN", "SCN", "log sequence number", "system change number"],
    definition: `<p>A monotonically increasing identifier the database
        assigns to each log position. Postgres calls it the LSN
        (Log Sequence Number); Oracle calls it the SCN (System
        Change Number); MySQL's GTID + binlog coordinates and
        SQL Server's <code>__$start_lsn</code> serve the same
        purpose. CDC consumers checkpoint progress as the last
        applied LSN/SCN so a restart resumes without gaps or
        duplicates.</p>`,
    related: ["wal-redo-log", "checkpoint"],
  },
  {
    term: "Log retention",
    slug: "log-retention",
    definition: `<p>How long the source database keeps WAL/binlog/redo
        segments before recycling them. If a CDC consumer falls
        behind and its checkpoint LSN ages out, the connector can't
        resume — it has to bootstrap with a full snapshot. Tune
        retention to cover your worst-case consumer outage plus a
        margin; on Postgres this means <code>wal_keep_size</code>
        (or replication slots, which are stricter) and
        <code>max_slot_wal_keep_size</code>.</p>`,
    related: ["wal-redo-log", "snapshot"],
  },
  {
    term: "Checkpoint",
    slug: "checkpoint",
    definition: `<p>The persisted record of "I have successfully
        processed everything up to LSN/SCN X" stored by a CDC
        consumer. Restarts replay from the checkpoint, so a missed
        flush means duplicates on resume; idempotent sinks handle
        this. Most connectors checkpoint after a confirmed sink
        write, not after a read.</p>`,
    related: ["lsn-scn", "idempotent-write"],
  },

  // ---- Event shapes ----
  {
    term: "Tombstone",
    slug: "tombstone",
    definition: `<p>A Kafka message with a <code>null</code> value
        and a populated key, used by log compaction as the
        "delete this key" marker. In Debezium and similar CDC
        producers, a source-row delete is carried by the normal
        change event (the envelope's <code>op</code> field is
        <code>"d"</code> and the <code>before</code> block holds the
        pre-delete row); the tombstone is an <em>optional</em>
        follow-up message that lets a compacted topic eventually
        drop the key. Sinks read the delete from the change event,
        not from the tombstone. Tombstones need a non-zero
        <code>delete.retention.ms</code> long enough for every
        consumer to see them before compaction reclaims the slot.</p>`,
    related: ["compaction"],
  },
  {
    term: "Compaction",
    slug: "compaction",
    definition: `<p>Kafka's "keep the latest value per key" retention
        mode. Combined with tombstones it gives you a materialized
        view of state on the topic that a late-joining consumer can
        rebuild without replaying every historical write — useful
        for downstream state stores. The gotcha: until compaction
        actually runs (it's a background process, not instant),
        readers still see every intermediate value; until
        <code>delete.retention.ms</code> elapses, tombstones linger.</p>`,
    related: ["tombstone"],
  },
  {
    term: "Snapshot",
    slug: "snapshot",
    aliases: ["initial snapshot", "incremental snapshot"],
    definition: `<p>The bootstrap process: read the current state of
        every row, emit it as change events, then switch to
        streaming the log. Initial snapshots can interleave with
        live changes — design consumers to reconcile by version
        column or <code>op_ts</code>. Incremental snapshots (signal-
        based, popularized by Debezium) let you re-snapshot a
        subset without taking down the whole connector, at the
        cost of potential duplicates the sink has to dedupe.</p>`,
    related: ["log-retention", "idempotent-write"],
  },
  {
    term: "Schema evolution",
    slug: "schema-evolution",
    definition: `<p>The discipline of versioning the event payload's
        shape so producers can add fields without breaking
        consumers. Additive changes (new optional fields) are safe;
        renames and removals require a migration window with both
        the old and new field present. Schema Registry (Confluent,
        Karapace, AWS Glue) enforces compatibility rules at
        produce time.</p>`,
  },

  // ---- Delivery semantics ----
  {
    term: "Idempotent write",
    slug: "idempotent-write",
    definition: `<p>An operation that produces the same end state
        regardless of how many times it's replayed. Keyed
        <code>MERGE</code> / <code>UPSERT</code> on a stable
        primary key is the most common pattern. Without
        idempotency, at-least-once delivery from the source
        amplifies into duplicate rows in the sink on every
        connector restart.</p>`,
    related: ["exactly-once", "effectively-once"],
  },
  {
    term: "Exactly-once",
    slug: "exactly-once",
    definition: `<p>The (mostly aspirational) guarantee that every
        source event lands in the sink exactly once, with no
        duplicates and no drops. End-to-end exactly-once across a
        CDC pipeline requires coordinated transactions in the
        source, the broker, and the sink — most stacks settle for
        "effectively-once" (at-least-once delivery + idempotent
        sinks + a deduplication ledger). The errata page covers
        the specific traps.</p>`,
    related: ["effectively-once", "idempotent-write"],
  },
  {
    term: "Effectively-once",
    slug: "effectively-once",
    definition: `<p>The pragmatic alternative to exactly-once: the
        source is at-least-once, but the sink's idempotent writes
        plus a durable <code>event_id</code> ledger collapse
        duplicates so the observable end state matches an
        exactly-once delivery. This is what most production CDC
        pipelines actually ship.</p>`,
    related: ["exactly-once", "idempotent-write"],
  },
  {
    term: "Lag",
    slug: "lag",
    definition: `<p>The time between a source commit and the
        corresponding sink apply. Track p50/p95/p99, not just
        the mean — CDC lag is bursty (DDL, large transactions,
        consumer restarts), and the average hides the tail you
        actually have to capacity-plan against.</p>`,
  },

  // ---- Streaming infrastructure ----
  {
    term: "Partition key",
    slug: "partition-key",
    definition: `<p>The field whose hash decides which Kafka
        partition (or equivalent) a message lands on. CDC ordering
        is guaranteed per partition key, not cross-key — if you
        partition by <code>user_id</code>, every event for a given
        user is ordered, but events across users are not. Choose
        the key to match the unit of ordering your downstream
        actually needs.</p>`,
    related: ["compaction"],
  },
  {
    term: "Dead-letter queue",
    slug: "dead-letter-queue",
    aliases: ["DLQ"],
    definition: `<p>A side topic / table where the connector parks
        events it can't process — typically schema mismatches,
        deserialization failures, or sink errors. Without a DLQ,
        the connector either drops the event (data loss) or stalls
        the whole partition (head-of-line blocking). With one, the
        bad records are visible and triageable.</p>`,
  },
];
