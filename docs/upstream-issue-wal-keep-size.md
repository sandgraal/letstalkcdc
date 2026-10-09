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

## Title

PostgreSQL connector docs: `wal_keep_size` does not limit WAL retained by a
replication slot; `max_slot_wal_keep_size` does

## Body

The PostgreSQL connector documentation says, in the section on a connector
that stops while its replication slot keeps retaining WAL:

> Or you can set `wal_keep_size` to limit the maximum WAL size of a
> replication slot.

Source: `documentation/modules/ROOT/pages/connectors/postgresql.adoc`, line
2741 on `main` (the 3.7 documentation).

The PostgreSQL documentation describes the two settings differently:

- `wal_keep_size` "sets only the minimum size of segments retained in
  `pg_wal`" for the benefit of standby servers. It is a floor for standbys.
  It does not cap how much WAL a replication slot can hold back.
- `max_slot_wal_keep_size` is the setting that limits the WAL a replication
  slot may retain. The default is `-1`, which means no limit. A slot that
  falls further behind than the limit is invalidated.

Both settings exist since PostgreSQL 13 (`wal_keep_size` replaced
`wal_keep_segments` there). The quotes above are from the PostgreSQL 18
documentation, "Replication" configuration parameters.

As written, a reader can follow the Debezium page, set `wal_keep_size`, and
believe the slot is now bounded when it is not.

### Suggested replacement wording

> To limit how much WAL a replication slot can retain, set
> `max_slot_wal_keep_size` (PostgreSQL 13 and later; the default is `-1`,
> unlimited). `wal_keep_size` is a minimum kept for standby servers and does
> not cap slot retention. Monitor `pg_replication_slots` for a stopped
> consumer.

Setting a cap trades disk safety for the risk of invalidating the slot, which
forces a new snapshot. That trade-off may deserve a sentence of its own in the
docs, since it is the reason many operators leave the default.

### Sources

- Debezium PostgreSQL connector, line 2741 of `postgresql.adoc` on
  `debezium/debezium` `main`:
  <https://github.com/debezium/debezium/blob/main/documentation/modules/ROOT/pages/connectors/postgresql.adoc>
- PostgreSQL 18, "Replication" parameters (`wal_keep_size`,
  `max_slot_wal_keep_size`):
  <https://www.postgresql.org/docs/18/runtime-config-replication.html>

## Before filing

1. Re-run the search in `debezium/dbz` and Jira for `wal_keep_size`.
2. Re-open the PostgreSQL 18 page and confirm the quoted phrases; copy them
   exactly into the issue.
3. Confirm line 2741 still holds the sentence (it moves as the file changes);
   quote the sentence rather than relying on the line number.
4. After filing, put the issue URL in the plan item P15-39 and tick it. If the
   Debezium docs change, update the note on `/postgres-replication-slots/`.
