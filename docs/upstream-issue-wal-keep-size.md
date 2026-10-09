# Draft upstream issue: `wal_keep_size` in the Debezium PostgreSQL docs

Draft for plan item P15-39. **The maintainer files it, not an agent.** Nothing
here has been sent. Drafted 2026-10-09.

- **Where to file:** <https://github.com/debezium/dbz/issues> (Debezium's
  issue tracker).
- **Checked before drafting (2026-10-09):** no existing report in
  `debezium/dbz` issues or in the DBZ Jira project. Search again just before
  filing; the state may have changed.
- **Why this site cares:** `/postgres-replication-slots/` teaches that a
  stopped consumer makes a slot retain WAL until the disk fills, and tells
  readers to cap it with `max_slot_wal_keep_size`. The Debezium docs suggest
  a different setting for the same job, so the page carries a note on the
  disagreement.
- **Facts re-read 2026-10-09:** Debezium sentence and line numbers through
  `gh api`; PostgreSQL quotes from the PostgreSQL 18 pages above; the 13
  release-note titles as given by the maintainer's review.

## Title

PostgreSQL connector docs suggest `wal_keep_size` to limit a slot's WAL;
PostgreSQL documents `max_slot_wal_keep_size` for that

## Body

The PostgreSQL connector documentation has a section headed "Replication
parameters and performance considerations". After a sentence about raising
`max_wal_senders` and `max_replication_slots`, it says:

> Or you can set `wal_keep_size` to limit the maximum WAL size of a
> replication slot.

Source: `documentation/modules/ROOT/pages/connectors/postgresql.adoc` on
`main` (3.8.0-SNAPSHOT); the same sentence is at line 2741 in v3.7.0.Final.

The PostgreSQL 18 documentation (Replication configuration parameters) words
the two settings differently:

- `wal_keep_size`: "Specifies the minimum size of past WAL files kept in the
  `pg_wal` directory, in case a standby server needs to fetch them for
  streaming replication", and "This sets only the minimum size of segments
  retained in `pg_wal`". My reading is that this is a floor for standby
  servers and does not cap what a replication slot retains; the page does not
  say so in those words.
- `max_slot_wal_keep_size`: "Specify the maximum size of WAL files that
  replication slots are allowed to retain in the `pg_wal` directory at
  checkpoint time. If `max_slot_wal_keep_size` is -1 (the default),
  replication slots may retain an unlimited amount of WAL files." When a slot
  falls further behind than the limit, "the standby using the slot may no
  longer be able to continue replication due to removal of required WAL
  files". `pg_replication_slots.wal_status` shows `lost` for a slot that is
  no longer usable.

PostgreSQL 13 introduced both names. Its release notes list "Rename
configuration parameter `wal_keep_segments` to `wal_keep_size`" and "Allow WAL
storage for replication slots to be limited by `max_slot_wal_keep_size`".

As written, a reader can follow the Debezium page, set `wal_keep_size`, and
believe a slot's retention is now bounded. On the PostgreSQL wording above, the
setting that bounds it is `max_slot_wal_keep_size`.

### Suggested replacement wording

> To limit how much WAL a replication slot can retain, set
> `max_slot_wal_keep_size` (PostgreSQL 13 and later; default -1, unlimited).
> `wal_keep_size` is a minimum kept for standby servers and does not cap slot
> retention. Monitor `pg_replication_slots` for a stopped consumer.

Optional, for the maintainers to judge: a slot that exceeds the cap can become
`lost`, and a lost slot cannot resume, so the connector would need a new
snapshot. That trade-off may deserve a sentence of its own.

### Sources

- Debezium PostgreSQL connector, `postgresql.adoc`, section "Replication
  parameters and performance considerations" (line 2737 heading, line 2741
  sentence on `main` 3.8.0-SNAPSHOT and in v3.7.0.Final):
  <https://github.com/debezium/debezium/blob/main/documentation/modules/ROOT/pages/connectors/postgresql.adoc>
- PostgreSQL 18, Replication configuration parameters:
  <https://www.postgresql.org/docs/18/runtime-config-replication.html>
- PostgreSQL 18, `pg_replication_slots` (`wal_status`):
  <https://www.postgresql.org/docs/18/view-pg-replication-slots.html>
- PostgreSQL 13 release notes:
  <https://www.postgresql.org/docs/13/release-13.html>

## Before filing

1. Re-run the search in `debezium/dbz` and Jira for `wal_keep_size`.
2. Re-open the PostgreSQL 18 page and confirm the quoted phrases; copy them
   exactly into the issue.
3. Confirm line 2741 still holds the sentence (it moves as the file changes);
   quote the sentence rather than relying on the line number.
4. After filing, put the issue URL in the plan item P15-39 and tick it. If the
   Debezium docs change, update the note on `/postgres-replication-slots/`.
