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
        correct. Kafka transactions make writes and offsets atomic inside
        Kafka; they do not cover a database, a warehouse load or an HTTP
        call. The page now answers hop by hop. The sink still has to be
        idempotent, keyed on the primary key and ordered by source log
        position. The errata page's source-connector note was updated to
        match.</p>`,
  },
];
