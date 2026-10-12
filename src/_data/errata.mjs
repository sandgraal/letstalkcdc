/**
 * Errata entries surfaced inline on module pages.
 *
 * Each entry can apply to one or more page URLs. The
 * `errata-callout.njk` partial in `base.njk` renders a collapsed
 * `<details>` disclosure near the top of any page whose `page.url`
 * matches an entry's `urls` list.
 *
 * Shape:
 *
 *   {
 *     id: "kebab-case-unique-id",
 *     urls: ["/intro/", "/quickstarts/quickstart-postgres/"],
 *     title: "Short headline",
 *     dateModified: "YYYY-MM-DD",   // when the correction landed
 *     body: "<p>HTML</p>",          // rendered as-is inside the details
 *   }
 *
 * The hub at `/errata/` remains hand-written prose; this data file
 * is strictly for per-page callouts that need to follow the reader
 * to the place they're affected.
 *
 * URLs are path-prefix-naked (start with `/`, no `/letstalkcdc/`
 * prefix). The partial compares against `page.url`, which is
 * already in the same shape regardless of GitHub Pages prefix.
 *
 * `body` is rendered as raw HTML (`| safe`). Do NOT hand-write
 * internal links (root-absolute href starting with a single
 * slash) — those bypass the `| url` filter and will 404 under
 * the GitHub Pages path prefix. Keep entries link-free (the
 * partial appends a hub link), or restrict links to absolute
 * external URLs.
 */

export default [
  {
    id: "video-embed-removed-2026-05-15",
    urls: ["/intro/", "/quickstarts/quickstart-postgres/"],
    title: "Embedded video removed",
    dateModified: "2026-05-15",
    body: `<p>An embedded YouTube tutorial previously appeared on this
        page. The upstream video had been pulled, leaving a broken
        embed plus a 404'd thumbnail that was the page's primary
        layout-shift contributor; both have been removed. A
        replacement (interactive demo or curated alternative) is
        tracked on the errata hub linked below; the surrounding
        prose stands on its own without it.</p>`,
  },
  {
    id: "connect-offsets-topic-2026-08-24",
    urls: ["/ops-offsets/"],
    title: "Corrected: Kafka Connect offset topic",
    dateModified: "2026-08-24",
    body: `<p>The storage table previously named
        <code>__consumer_offsets</code> as Kafka Connect's primary
        offset store. That topic holds <em>consumer-group</em>
        offsets. A source connector's own progress (the LSN/binlog
        position Debezium checkpoints) lives in
        <code>connect-offsets</code>, set via
        <code>offset.storage.topic</code>. The table now reads
        <code>connect-offsets</code>, matching the backup commands
        lower on the same page.</p>`,
  },
  {
    id: "forward-compat-upgrade-order-2026-08-24",
    urls: ["/schema-evolution/"],
    title: "Corrected: forward-compatibility upgrade order",
    dateModified: "2026-08-24",
    body: `<p>The Forward Compatibility card previously said you must
        upgrade all consumers <em>before</em> producers. That is the
        <em>backward</em>-compatibility rule. Under forward
        compatibility, old consumers can already read data written
        with the new schema, so you upgrade producers first and let
        consumers catch up. The card has been corrected.</p>`,
  },
  {
    id: "reconcile-by-log-position-2026-10-09",
    urls: ["/snapshotting/", "/materialization/"],
    title: "Corrected: reconcile by log position, not a timestamp",
    dateModified: "2026-10-09",
    body: `<p>Several examples ordered or reconciled changes by a
        timestamp or left them unguarded. The snapshotting page's
        warehouse MERGE had no version guard, so a replay or an
        overlapping snapshot chunk could overwrite a newer row, and its
        "no primary key" advice said to dedupe on a hash plus the latest
        timestamp. The errata page said to reconcile snapshots using
        version columns or <code>op_ts</code>, and its soft-delete note
        suggested physical deletes where a delete marker is the safe
        choice. The dbt incremental model
        on the materialization page filtered deletes out before the
        target, so the deleted key's old row stayed, and had no
        incremental bound or guard; its BigQuery rebuild also dropped
        deletes instead of marking them. All now key the sink on the primary key and apply
        a change only if its source log position is greater than the one
        stored, keeping deletes as delete markers. Delivery stays
        at-least-once; none of this is end-to-end exactly-once.</p>`,
  },
  {
    id: "exactly-once-per-hop-2026-10-09",
    urls: ["/exactly-once/"],
    title: "Corrected: exactly-once is a per-hop question",
    dateModified: "2026-10-09",
    body: `<p>This page said exactly-once was not achievable and that
        source connectors such as Debezium are at-least-once into Kafka.
        That is too blunt. Since Debezium 3.3 the documentation describes
        an opt-in exactly-once mode for Kafka Connect source connectors
        (MariaDB, MongoDB, MySQL, Oracle, PostgreSQL, SQL Server), built on
        Kafka transactions. It needs distributed mode, Kafka Connect 3.3.0
        or later, <code>exactly.once.source.support=enabled</code> on the
        workers and <code>exactly.once.support=required</code> on the
        connector. It is off by default, and Debezium's own page still says
        it provides at-least-once delivery, has no internal deduplication
        layer, and that it is unclear whether the implementation is fully
        correct. It lists KAFKA-17734, KAFKA-17754 and KAFKA-17582 as open;
        as of 2026-10-09 KAFKA-17754 (a delayed EndTxn causing aborted reads
        and lost writes) is marked resolved in Apache JIRA via KIP-890, and
        the other two remain open. Kafka transactions make writes and offsets atomic inside
        Kafka; they do not cover a database, a warehouse load or an HTTP
        call. The page now answers hop by hop. The sink still has to be
        idempotent, keyed on the primary key and ordered by source log
        position. The errata page's source-connector note was updated to
        match.</p>`,
  },
  {
    id: "postgres-wal-level-needs-restart-2026-10-11",
    urls: ["/snapshotting/"],
    title: "Corrected: the PostgreSQL setup needs a server restart",
    dateModified: "2026-10-11",
    body: `<p>The PostgreSQL snippet ran <code>ALTER SYSTEM SET wal_level =
        logical</code> and <code>ALTER SYSTEM SET max_replication_slots =
        10</code> and then <code>SELECT pg_reload_conf()</code>. Both
        settings have the context <code>postmaster</code> in
        <code>pg_settings</code>, which means they only take effect after a
        server restart; a reload does not apply them. A reader who followed
        the snippet would not have had a logical slot available. The snippet
        now says a restart is required and checks <code>SHOW wal_level</code>
        afterwards.</p>`,
  },
  {
    id: "postgres-snapshot-lsn-race-2026-10-11",
    urls: ["/snapshotting/"],
    title: "Corrected: the PostgreSQL boundary snippet has a race",
    dateModified: "2026-10-11",
    body: `<p>The snippet opened a <code>REPEATABLE READ</code> transaction and
        then ran <code>SELECT pg_current_wal_lsn()</code> to record the
        boundary. The transaction snapshot is taken before the LSN is read,
        so a commit in between is invisible to the scan yet sits below the
        recorded LSN, and a stream that starts at that LSN misses it. The
        snippet is now labelled as an illustration of the idea only, with the
        race stated. Reading the LSN and taking the snapshot in two
        separate steps can miss a commit between them, so a procedure must
        obtain the consistent point and the snapshot together. The
        PostgreSQL documentation for creating a logical replication slot
        describes how to do this; check the documentation for your version.
        This site does not provide a tested recipe for that.</p>`,
  },
  {
    id: "snapshot-resume-claim-2026-10-11",
    urls: ["/snapshotting/"],
    title: "Corrected: only incremental snapshots resume mid-table",
    dateModified: "2026-10-11",
    body: `<p>Three statements said a plain boundary snapshot could resume from
        its last completed chunk. The page's own description of snapshot
        modes says only an incremental snapshot supports resuming
        mid-table. All three now say that: with an idempotent sink,
        re-reading rows is harmless, only an incremental snapshot
        resumes from the last completed chunk, and if the log is purged
        mid-snapshot a plain boundary snapshot has to start again.</p>`,
  },
  {
    id: "delete-event-before-image-2026-10-11",
    urls: [
      "/deletes-stay-deleted/",
      "/event-envelope/",
      "/use-cases/",
      "/security/",
    ],
    title: "Corrected: a delete event does not always carry the full row",
    dateModified: "2026-10-11",
    body: `<p>The pages said a delete event holds the row as it was (the
        before image), or that the log holds the before image. That is only
        true under the right source settings. On PostgreSQL, with the default
        replica identity on a table that has a primary key, the before image
        carries only the key columns; <code>REPLICA IDENTITY FULL</code>
        adds the rest of the row, and other replica identity settings
        differ, so check yours. On MySQL, <code>binlog_row_image</code>
        controls how much of the row is written (FULL, MINIMAL, NOBLOB); the
        full row needs <code>binlog_row_image=FULL</code>. The places that
        described the before image now state both conditions: the delete
        page, the event envelope quiz, the use cases page and the security
        page. A sink that needs the old column values of a deleted row must
        not assume them.</p>`,
  },
  {
    id: "exactly-once-sql-claims-2026-10-11",
    urls: ["/is-cdc-exactly-once/"],
    title: "Corrected: the guard has no tie-break, and a review claim",
    dateModified: "2026-10-11",
    body: `<p>The sink example compares a single position,
        <code>customers.src_lsn &lt; EXCLUDED.src_lsn</code>, with no
        tie-break. If two different changes to one key can share a position,
        compare a (position, seq) pair instead; the page now says so and
        points to the merge cookbook. The page also said an independent
        review had run the PostgreSQL statements on PGlite and that the
        table matched. Nothing in this repository recorded that review, so
        the sentence has been replaced. The statements are now executed as
        printed on PGlite (PostgreSQL 18.3 compiled to WebAssembly) by this
        site's unit tests, and the logic is also run in SQLite. Neither is a
        PostgreSQL server.</p>`,
  },
  {
    id: "oracle-scn-tie-break-2026-10-12",
    urls: ["/oracle-notes/", "/quickstarts/quickstart-oracle/"],
    title: "Corrected: an Oracle SCN alone is not a safe guard",
    dateModified: "2026-10-12",
    body: `<p>The first-aid list said to guard the sink on the source log
        position (SCN), and the latest-wins check took
        <code>MAX(source_scn)</code> per key. The partitioning and
        materialization pages already say that an Oracle <code>scn</code>
        can repeat across changes in one transaction, so a single SCN can
        tie. The guard and the check now use a (position, tie-break) pair,
        where the tie-break is <code>rs_id</code> and <code>ssn</code> or
        your own within-transaction ordinal (verify the ordering semantics
        for your Debezium version). The SCN and commit timestamp the page
        asks you to expose are for lag metrics only, never for ordering.
        The tie-break is a single orderable column: if you use both
        <code>rs_id</code> and <code>ssn</code>, compare them as separate
        columns (<code>rs_id</code> is a string) and do not concatenate them
        as text. The Oracle quickstart's acceptance line said latest-wins by
        SCN alone and now says (SCN, tie-break). The Oracle SQL on the page is now labelled as not run against an
        Oracle database.</p>`,
  },
  {
    id: "cassandra-timestamp-rationale-2026-10-12",
    urls: ["/non-relational/"],
    title: "Corrected: the Cassandra timestamp is not a logical clock",
    dateModified: "2026-10-12",
    body: `<p>The page said the Cassandra cell timestamp is a logical clock
        the database assigns, not a wall-clock guess, and so was the correct
        ordering key. That rationale was wrong. The timestamp is a write time
        assigned by the coordinator or the client, not a log position, so
        clock skew can pick a different winner than real time would.
        Merging on it is justified only because it reproduces the source's
        own conflict rule; it is not an order to trust anywhere else. The
        checklist also listed the cell timestamp, and a MongoDB resume
        token, as stand-ins for an LSN. Neither is now offered: use the
        field the source documents as orderable and check its
        documentation. Two absolutes about DynamoDB Streams (retention
        cannot be extended, a full scan is the only repair) could not be
        verified and are now worded as this page's assumption, with a pointer
        to your provider's documentation; the DynamoDB heading, callout and
        the 24-hour figure now say it is the retention as documented when the
        page was written. The Cassandra paragraph also said that merging on
        cell timestamps reproduces the source's semantics: it can reproduce
        the winner only if you also reproduce the source's rule for equal
        timestamps, which this page does not state, so check the source's
        documentation.</p>`,
  },
  {
    id: "dedup-table-same-transaction-2026-10-12",
    urls: ["/exactly-once/"],
    title: "Corrected: the event-ID table needs the same transaction",
    dateModified: "2026-10-12",
    body: `<p>The deduplication-table recipe said to insert the event ID into
        a <code>processed_events</code> table and proceed. Done as two
        separate steps, a crash after the ID is recorded and before the sink
        write skips the replayed event as a duplicate, and the change is lost
        permanently. The ID insert and the sink write must happen in the same
        transaction. The page also now says, beside the pseudocode and the
        two event-ID <code>MERGE</code> examples, that they remove replays
        only: the sink still needs the upsert ordered by source log position.
        The Snowflake-style and BigQuery statements are labelled as not
        run. The page also described the event-ID statements as skipping an
        event they have already seen; they leave the table unchanged when the
        event comes again, by re-applying the same payload. The
        deduplication table needs a primary key or unique constraint on the
        event ID in the same transactional store as the sink; in PostgreSQL a
        unique violation aborts the transaction, so use
        <code>INSERT ... ON CONFLICT DO NOTHING</code> and check the row
        count.</p>`,
  },
  {
    id: "partitioning-ts-ms-tie-break-2026-10-12",
    urls: ["/partitioning/"],
    title: "Corrected: ts_ms is not a tie-break",
    dateModified: "2026-10-12",
    body: `<p>The page said to keep <code>ts_ms</code> for lag metrics and,
        at most, as a secondary tie-break. That contradicted the
        materialization page and the rest of this page, which keep it out of
        ordering. It now says to keep <code>ts_ms</code> for lag metrics only
        and to use the within-transaction ordinal as the tie-break. The
        simulator's "Ordering guarantee" readout used to say "Per-key"
        whatever the settings; when the hot key is split over several
        shards it now says that per-key order is broken for the hot key. The
        PostgreSQL example is now stated as run on PGlite, and the BigQuery
        example as not run. The static line under the readout no longer
        says "per-key only", which the readout can contradict.</p>`,
  },
  {
    id: "materialization-ts-ms-meaning-2026-10-12",
    urls: ["/materialization/"],
    title: "Corrected: what ts_ms is",
    dateModified: "2026-10-12",
    body: `<p>The dedupe step called the envelope <code>ts_ms</code> a
        millisecond commit time. In the event envelope, <code>ts_ms</code> is
        when the connector processed the event, and the source commit time is
        <code>source.ts_ms</code>. The sentence now says so; the advice to keep
        it out of ordering is unchanged. The Snowflake MERGE is labelled as
        not run in Snowflake (its guard logic was run as a PostgreSQL
        MERGE).</p>`,
  },
];
