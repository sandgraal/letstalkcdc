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
        margin; on Postgres, a replication slot retains WAL until
        its consumer confirms it, <code>max_slot_wal_keep_size</code>
        caps that (default <code>-1</code>, unlimited), and
        <code>wal_keep_size</code> is only a minimum kept for
        standbys.</p>`,
    related: ["wal-redo-log", "snapshot", "replication-slot"],
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
        live changes — design consumers to reconcile by source log
        position (LSN/SCN/binlog coordinates), not by a timestamp:
        keep a row only if the incoming event's position is newer
        than the one the row already holds. Snapshot reads carry the
        snapshot's boundary position, so live streaming events that
        follow it win. Incremental snapshots (signal-
        based, popularized by Debezium) let you re-snapshot a
        subset without taking down the whole connector, at the
        cost of potential duplicates the sink has to dedupe.</p>`,
    related: ["log-retention", "idempotent-write", "backfill", "watermark"],
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
    related: ["schema-registry", "backfill"],
  },

  // ---- Delivery semantics ----
  {
    term: "Idempotent write",
    slug: "idempotent-write",
    definition: `<p>An operation that produces the same end state
        regardless of how many times it's replayed. Keyed
        <code>MERGE</code> / <code>UPSERT</code> on a stable
        primary key is the most common pattern, applied only if
        the incoming event's source log position is newer than the
        one the row already holds, so a replayed older event
        becomes a no-op. Without idempotency, at-least-once
        delivery from the source amplifies into duplicate rows in
        the sink on every connector restart.</p>`,
    related: ["exactly-once", "effectively-once", "upsert", "at-least-once"],
  },
  {
    term: "Exactly-once",
    slug: "exactly-once",
    definition: `<p>The guarantee that every source event lands in the
        sink exactly once, with no duplicates and no drops.
        End-to-end exactly-once across independent systems (source
        database, broker, warehouse) is not achievable;
        exactly-once is possible only inside one transactional
        boundary, such as Kafka to Kafka (and Debezium's opt-in
        Kafka Connect EOS covers only the source-to-Kafka hop).
        Most stacks ship "effectively-once" (at-least-once delivery
        + idempotent sinks + a deduplication ledger). The errata
        page covers the specific traps.</p>`,
    related: ["effectively-once", "idempotent-write", "at-least-once"],
  },
  {
    term: "Effectively-once",
    slug: "effectively-once",
    definition: `<p>The pragmatic alternative to exactly-once: the
        source is at-least-once, but the sink's idempotent writes
        plus a durable <code>event_id</code> ledger collapse
        duplicates so the observable end state matches an
        exactly-once delivery. The write is a keyed upsert applied
        only if the incoming source log position is newer than the
        row's. This is what most production CDC pipelines actually
        ship.</p>`,
    related: ["exactly-once", "idempotent-write", "at-least-once"],
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

  // ---- Added from usage (P16-14) ----
  {
    term: "Upsert",
    slug: "upsert",
    aliases: ["MERGE", "INSERT … ON CONFLICT"],
    definition: `<p>A write that inserts a row when its primary key is
        absent and updates it when present — <code>INSERT … ON
        CONFLICT DO UPDATE</code> in Postgres, <code>MERGE</code> in
        SQL Server, Oracle, Snowflake and BigQuery. Keyed on the
        source primary key, it lets a sink apply insert and update
        events idempotently, so a replay converges on the same row
        instead of duplicating it. An upsert alone does not stop an
        older event from overwriting a newer one; guard it with the
        source log position.</p>`,
    related: ["idempotent-write", "deduplication", "lsn-scn"],
  },
  {
    term: "Kafka Connect",
    slug: "kafka-connect",
    definition: `<p>The Apache Kafka framework for running source
        connectors (system into Kafka) and sink connectors (Kafka
        out to a system) on a pool of workers that handle
        configuration, scaling and offset storage. Debezium's CDC
        connectors are Kafka Connect source connectors; they commit
        the source log position as their offset in a Kafka topic in
        distributed mode (standalone mode stores offsets in a file),
        and a restart resumes from the last committed one.</p>`,
    related: ["smt", "dead-letter-queue", "checkpoint", "at-least-once"],
  },
  {
    term: "Deduplication",
    slug: "deduplication",
    aliases: ["dedup", "dedupe"],
    definition: `<p>Collapsing repeated deliveries of the same change
        into one effect. At-least-once delivery allows repeats
        after retries and restarts, so the sink either makes the
        write idempotent (an upsert on the primary key) or skips any
        event whose source log position is not newer than what the
        row already holds. Compare by log position (LSN/SCN/binlog
        coordinates), not by timestamp or Kafka offset: a timestamp
        can tie or move backwards, and an offset is local to one
        topic partition.</p>`,
    related: ["idempotent-write", "upsert", "effectively-once", "lsn-scn"],
  },
  {
    term: "Replication slot",
    slug: "replication-slot",
    aliases: ["slot", "logical replication slot"],
    definition: `<p>A Postgres server-side bookmark recording how far a
        replication consumer, such as a Debezium connector, has read,
        so the server keeps every WAL segment that consumer still
        needs. An unconsumed or abandoned slot retains WAL
        indefinitely and can fill the primary's disk. Cap the
        retention with <code>max_slot_wal_keep_size</code> (default
        <code>-1</code>, unlimited), accepting that a slot that falls
        further behind is invalidated and the connector must
        re-snapshot, and drop slots you no longer use.</p>`,
    related: ["wal-redo-log", "log-retention", "checkpoint", "snapshot"],
  },
  {
    term: "Backfill",
    slug: "backfill",
    aliases: ["re-snapshot", "historical load"],
    definition: `<p>Re-loading existing rows into a sink — after the
        first deploy, a schema change, a bug fix or a sink rebuild —
        usually with a snapshot or an incremental snapshot. A
        backfill interleaves with live changes and produces
        duplicates, so it must go through the same idempotent,
        primary-key-keyed writes as streaming and must never replace
        a newer streamed value with an older snapshot read.</p>`,
    related: ["snapshot", "idempotent-write", "watermark", "upsert"],
  },
  {
    term: "At-least-once",
    slug: "at-least-once",
    aliases: ["ALO", "at least once"],
    definition: `<p>A delivery guarantee: every committed change reaches
        the consumer one or more times, never zero. Duplicates follow
        retries, restarts and replays from a checkpoint, so
        correctness comes from idempotent sinks keyed on the primary
        key and ordered by source log position, not from the
        transport. It is a per-hop property: Debezium documents
        at-least-once delivery, and its opt-in Kafka Connect
        exactly-once mode (requires Kafka Connect 3.3+, KIP-618;
        documented from Debezium 3.3) covers only the source-to-Kafka
        hop, and the docs note open correctness issues in Kafka
        transactions, so it does not make the pipeline exactly-once
        end to end.</p>`,
    related: [
      "exactly-once",
      "effectively-once",
      "idempotent-write",
      "deduplication",
    ],
  },
  {
    term: "Schema registry",
    slug: "schema-registry",
    definition: `<p>A service that stores versioned event schemas (Avro,
        Protobuf, JSON Schema) so each message carries a small schema
        ID instead of the full schema, and that rejects a new schema
        version that breaks the configured compatibility rule.
        Confluent Schema Registry, Karapace and AWS Glue Schema
        Registry are common implementations. It guards the payload
        shape only; it does nothing about ordering or duplicates.</p>`,
    related: ["schema-evolution", "kafka-connect", "dead-letter-queue"],
  },
  {
    term: "Outbox",
    slug: "outbox",
    aliases: ["outbox pattern", "transactional outbox"],
    definition: `<p>A pattern where a service writes its business row and
        an event row to an outbox table in the same database
        transaction, and CDC reads the outbox and publishes the
        events. It removes the dual write (database plus broker) that
        can lose or invent events, but delivery stays at-least-once,
        so consumers deduplicate on a stable event id. Debezium ships
        an Outbox Event Router SMT for it.</p>`,
    related: ["smt", "at-least-once", "deduplication", "effectively-once"],
  },
  {
    term: "SMT (single message transform)",
    slug: "smt",
    aliases: ["SMT", "single message transform"],
    definition: `<p>A Kafka Connect transformation applied to each record
        as it passes through a connector, configured in the
        connector's JSON rather than written as a separate service —
        for example Debezium's <code>ExtractNewRecordState</code> to
        flatten the change envelope, or the outbox event router. An
        SMT sees one record at a time, so it cannot join, aggregate
        or reorder across records.</p>`,
    related: ["kafka-connect", "outbox"],
  },
  {
    term: "Watermark",
    slug: "watermark",
    aliases: ["high-watermark", "low-watermark"],
    definition: `<p>A marker of how far processing has safely progressed.
        In snapshotting, the high-watermark is the source log position
        (LSN/SCN) recorded at the snapshot boundary, where streaming
        takes over; incremental snapshots write low and high marker
        rows so the log brackets each chunk read. A consumer-side
        watermark (a polling cursor, or “safe up to T-Δ” event time
        for aggregates) only bounds replay or window closing — it
        never decides which version of a row wins; log position does.</p>`,
    related: ["snapshot", "lsn-scn", "checkpoint", "backfill"],
  },
];
