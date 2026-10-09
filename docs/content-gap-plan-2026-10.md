# Content-gap and keyword plan — 2026-10 (P16-2)

Date: 2026-10-09. Scope: what the site covers, what readers plausibly search
for around change data capture, and which new modules would be both missing
and uniquely ours to write. Companion to `docs/seo-audit-2026-10.md` (P16-1).

This is a **plan from public documentation and a thin search sample, not from
visitor data.** There is no analytics, no Search Console, and the assistant
feedback table is nearly empty. Section 1 says exactly what that means; read it
before using any priority below.

## 1. Status, method and honest limits

### What was and was not available

| Input the brief asked for                                   | State on 2026-10-09                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `assistant_feedback` table (unanswered questions, 👎 votes) | **Not read.** This work had no database access, and the browser key cannot read rows (`docs/SETUP.md`, "Reading feedback"). The maintainer reports roughly 1 to 2 rows as of 2026-10-09. That is not a sample. **This plan must be re-run when the table has data** (trigger in section 8).                                                                                                                                                                                                                   |
| Search volume, ranking, impressions, click data             | **None.** Analytics are not installed and Search Console is not connected (P16-12). No volume, difficulty or competitor-position number appears in this document, and none should be inferred from it.                                                                                                                                                                                                                                                                                                        |
| `WebSearch` tool                                            | **Not available in this session.** Instead I scraped one search engine's HTML results page (Bing, unpersonalised, one run per query, 2026-10-09) with a throwaway script. It handled head-term queries but **dropped the technical qualifiers on most long-tail queries** (for example "change data capture iceberg" returned petitions and icebergs; "Delta Lake CDC" returned an airline). Where that happened the table in section 3 says "SERP not obtained" rather than pretending a result list exists. |
| Authoritative pages for each query family                   | **Fetched directly** (HTTP 200 on 43 of 46 URLs tried; two returned 403 and one returned a 308 redirect, and none of those three is cited as evidence). I counted keyword occurrences in the page text and read short passages to check specific claims. Counts are page-text counts, not a judgement of quality.                                                                                                                                                                                             |
| Assistant intent data                                       | Read from `src/data/assistant.yml` in this checkout (23 intents, 229 triggers).                                                                                                                                                                                                                                                                                                                                                                                                                               |

### Labels used below

- **Verified**: I fetched the page or read the file on 2026-10-09 and the
  statement is what it says.
- **Inferred**: a judgement from verified facts. The reasoning is given.
- **Unverified**: stated only so a later run can test it.

Nothing is copied from the sources; they are cited by URL (section 9) and
paraphrased.

## 2. What the site already covers

Source: `src/_data/series.mjs` (26 series entries) plus the other content pages
under `src/`. Coverage is "owns the topic" (a module or a named section),
"mentions" (a sentence or a code sample) or "none". Every site count below was
re-run on 2026-10-09 against this branch after merging `origin/main`, with the
command in the table at the end of this section. "Pages" means `.njk` and `.md`
files under `src/`; "files" means every file under `src/` (this includes
data files such as `src/_data/glossary.mjs`, which the page count misses).

| Topic                                               | Owns it                                                                                                         | Mentions only                                                                                                                     | Gap                                                                                                                                                                                                                                                                      |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| What CDC is, methods (log, trigger, query)          | `/intro/`, `/overview/`, `/strategy/`                                                                           | `/use-cases/`                                                                                                                     | None worth a module.                                                                                                                                                                                                                                                     |
| Event shape, keys, before/after, tombstones         | `/event-envelope/` (also transports: Kafka, Pulsar, Kinesis, Pub/Sub)                                           | 18 pages mention tombstones (C1)                                                                                                  | None.                                                                                                                                                                                                                                                                    |
| At-least-once, idempotency, ordering                | `/exactly-once/`, `/materialization/`, `/partitioning/`, `/errata/` (effectively-once panel)                    | `/merge-cookbook/`                                                                                                                | **No page names the opt-in Kafka Connect exactly-once support that Debezium documents from 3.3 onward** (0 files match `KIP-618`, `KIP-98` or `exactly.once.support` in `src/` and `docs/`, command C10).                                                                |
| Initial load, incremental snapshot, watermark       | `/snapshotting/` (`#watermarks`)                                                                                | "backfill" on 12 pages (C2a), not defined in the glossary                                                                         | Backfill and re-snapshot as a task (when, how, what it does to the sink).                                                                                                                                                                                                |
| Offsets, replay, repair                             | `/ops-offsets/`, `/reconciliation-surgery/`                                                                     | —                                                                                                                                 | None.                                                                                                                                                                                                                                                                    |
| Schema change                                       | `/schema-evolution/` (registry, compatibility, CDC wrinkles)                                                    | "data contract" in 2 pages (`/strategy/`, `/event-envelope/`); the bare word "contract", in any sense, in 7 (C7, C8)              | Contracts as a practice (ownership, enforcement, breaking-change process) is not its own topic.                                                                                                                                                                          |
| Operations: lag, alerts, runbooks                   | `/observability/`, `/troubleshooting/`, `/troubleshooting/failure-drills/`, `/dlq-triage/`                      | "replication slot" on 11 pages (C4); `/troubleshooting/` and the quickstart show `wal_keep_size` checks                           | **Postgres replication slots and WAL growth have no runbook.** `max_slot_wal_keep_size` is named once, in the `log-retention` glossary entry (`src/_data/glossary.mjs`, C9); no lesson page explains it, and the Debezium and PostgreSQL treatments are not on the site. |
| Testing                                             | `/tests/` (shell scripts that check the **lab** stack)                                                          | "testing" on 10 pages (C5); the phrases "integration test" or "contract test" in 2 (`/event-envelope/`, `/schema-evolution/`, C6) | **No guide to testing your own pipeline** (envelope contract, replay, idempotency).                                                                                                                                                                                      |
| Security, PII, erasure                              | `/security/` (masking, privileges, DLQ as a copy, three erasure strategies ending in crypto-shredding)          | GDPR on 3 pages (`/use-cases/`, `/case-study/`, `/cloud-labs/fivetran/`; C11)                                                     | Erasure **after** the event leaves Kafka: warehouse and lakehouse retention, time travel, compaction. See cluster D.                                                                                                                                                     |
| Non-relational sources                              | `/non-relational/`                                                                                              | —                                                                                                                                 | None.                                                                                                                                                                                                                                                                    |
| Targets: warehouse and lakehouse                    | `/materialization/` (MERGE, dbt incremental sample), `/cloud-labs/snowflake-cdc/`, `/cloud-labs/matillion-cdc/` | Iceberg, Delta Lake, Hudi or "lakehouse" in 1 file (`/use-cases/`, a few lines about offline tables; C12)                         | **Nothing on how each target decides which version of a row wins.** See cluster A.                                                                                                                                                                                       |
| Outbox                                              | `/exactly-once/` (outbox section), playground scenario `outbox-relay`                                           | "outbox" on 8 pages (C3)                                                                                                          | The lesson covers the pattern; router configuration and the relay's behaviour on replay are thin. Candidate for batch 2 (cluster H).                                                                                                                                     |
| Tool choice                                         | `/tooling/`, `/compare/`, `/case-study/`, five cloud labs                                                       | —                                                                                                                                 | Overlap between `/tooling/` and `/compare/` is P16-13, not a new module.                                                                                                                                                                                                 |
| Database specifics                                  | Four quickstarts, `/oracle-notes/`, `/connector-builder/`                                                       | "SQL Server" on 12 pages (C2b)                                                                                                    | No SQL Server page beyond the quickstart; candidate for batch 2.                                                                                                                                                                                                         |
| Cost                                                | —                                                                                                               | "cost" on 17 pages (C13); `/multi-tenancy/` has rough egress numbers                                                              | No model. Not now (section 7).                                                                                                                                                                                                                                           |
| Search-index sync, Debezium Server, embedded engine | —                                                                                                               | 1 file each (C14)                                                                                                                 | Candidates for batch 2 (section 7).                                                                                                                                                                                                                                      |

### Count commands (run 2026-10-09, branch after merging `origin/main`)

Pattern for the "pages" column: `rg -il -e "<regex>" src --glob '*.njk' --glob '*.md' | wc -l`.
Pattern for the "files" column: the same without the two `--glob` flags.

**Note on `\|`:** in the Regex column, `\|` is Markdown table escaping for a
plain `|`. In `rg` write a plain `|` (for example `rg -il -e "hudi|lakehouse"`),
or the command silently matches the literal text and returns a false zero.

| Tag  | Regex                                               | Pages | Files |
| ---- | --------------------------------------------------- | ----- | ----- |
| C1   | `tombstone`                                         | 18    | 24    |
| C2a  | `backfill`                                          | 12    | 13    |
| C2b  | `SQL Server`                                        | 12    | 18    |
| C3   | `outbox`                                            | 8     | 16    |
| C4   | `replication slot`                                  | 11    | 13    |
| C5   | `testing`                                           | 10    | 16    |
| C6   | `integration test\|contract test`                   | 2     | 2     |
| C7   | `contract`                                          | 7     | 10    |
| C8   | `data contract`                                     | 2     | 2     |
| C11  | `GDPR` (the extra file is `src/data/assistant.yml`) | 3     | 4     |
| C12  | `iceberg\|delta lake\|hudi\|lakehouse`              | 1     | 1     |
| C13  | `cost`                                              | 17    | 26    |
| C14a | `Elasticsearch\|OpenSearch`                         | 1     | 1     |
| C14b | `Debezium Server\|embedded engine`                  | 1     | 1     |

Zero-hit and single-hit claims, with exact commands:

- C9: `rg -n -i "max_slot_wal_keep_size|wal_keep_size" src docs --glob '!docs/content-gap-plan-2026-10.md'`
  returns `max_slot_wal_keep_size` once (`src/_data/glossary.mjs:63`, inside the
  `log-retention` entry) and `wal_keep_size` in `src/_data/glossary.mjs:61`,
  `src/case-study/index.njk:564`, `src/troubleshooting/index.njk:115`,
  `src/intro/index.njk:182` and `src/quickstart/quickstart-postgres/index.njk:32`.
  Earlier drafts of this plan said "0 times" and "unmentioned"; that was wrong
  because the first search was limited to templates and skipped the data file.
- C10: `rg -il "kip-618|exactly.once.support|kip-98" src docs --glob '!docs/content-gap-plan-2026-10.md' | wc -l`
  returns 0.
- Series entries: `rg -c "^\s*key:" src/_data/series.mjs` returns 26.
- Assistant: `rg -i -e "<term>" src/data/assistant.yml | wc -l` per term (section 4),
  and `grep -c "^  - id:" src/data/assistant.yml` returns 23.

### Interactive coverage (for demo ideas in section 6)

`playground/assets/shared-scenarios.js` defines these scenario ids (verified):
`crud-basic`, `omnichannel-orders`, `real-time-payments`, `outbox-relay`,
`iot-telemetry`, `retention-erasure`, `schema-evolution`,
`orders-items-transactions`, `snapshot-replay`, `burst-updates`,
`snapshot-to-stream`. The URL format for opening a named scenario from a lesson
is not established in this plan; P16-3 owns it.

## 3. What readers search for, and what the top pages say

**Reading guide.** "SERP sampled" means I have an actual result list from the
scrape described in section 1. "SERP not obtained" means the scrape returned
unrelated results, so the third column lists the authoritative pages a
searcher would most plausibly reach and what they contain, and the fourth
column is inference. Queries in the first column are my phrasings of the query
families in the brief; **none is a measured visitor query.**

| Query family                                                | What I obtained                                                                                                                                                                                                                                                               | What the pages cover (verified)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Angle the site can own (inferred)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "what is change data capture"                               | **SERP sampled.** Top results: Microsoft Learn (SQL Server CDC), Databricks, GeeksforGeeks, Wikipedia, IBM, DataCamp, Google Cloud. A longer query that started with "CDC" returned the Centers for Disease Control for the same engine.                                      | Of the 6 I could fetch (Databricks, GeeksforGeeks, Wikipedia, IBM, Google Cloud, Microsoft Learn; DataCamp returned 403), **none contains the phrase "at-least-once"**. The Google Cloud page says recovery from the last LSN guarantees each change is captured "exactly once without data loss or duplication".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Explainers stop at "tails the log". The delivery contract (duplicates after a crash, order by log position, delete markers) is the missing second half. Spell out "change data capture" in titles; the bare acronym collides with cdc.gov.                                                                                                                                                                                                                                                                                                                                      |
| "change data capture sql server"                            | **SERP sampled.** Microsoft Learn (two pages), SQLShack, sqldba.blog, Tutorial Gateway, Streamkap, DEV Community.                                                                                                                                                             | Setup and enable/disable guides. A Streamkap guide says its platform delivers "with exactly-once semantics" and the page has no mention of duplicates or at-least-once.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | SQL Server results are native-CDC how-tos. The Debezium-style log-position story for SQL Server is not what these pages teach. Candidate for batch 2.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| "debezium alternatives", "debezium vs fivetran/airbyte/DMS" | **SERP sampled for "debezium alternatives" only, low confidence:** all results were Debezium's own site, GitHub, docs, an AWS blog, Baeldung and one explainer, which suggests the engine dropped "alternatives". The vs-queries returned the same list or generic AWS pages. | AWS blog and explainers are Debezium-on-Aurora and architecture descriptions. Of the Debezium pages, the FAQ and connector docs state at-least-once behaviour.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | The site already has `/compare/` and `/tooling/`. The unclaimed angle is a comparison by **delivery contract** (what each tool does on retry, how it orders, how it signals deletes), not by feature table. This is P16-13 territory, not a module.                                                                                                                                                                                                                                                                                                                             |
| CDC to Iceberg / Delta / Hudi / lakehouse                   | **SERP not obtained.**                                                                                                                                                                                                                                                        | Iceberg Flink-writes doc has an UPSERT mode that requires equality fields (and includes partition source columns). The Iceberg spec defines equality delete files and sequence numbers. Delta's change data feed documents `_change_type` (`insert`, `update_preimage`, `update_postimage`, `delete`) and `_commit_version`. Hudi's record-merger doc has three merge modes (`COMMIT_TIME_ORDERING`, `EVENT_TIME_ORDERING`, `CUSTOM`) and **defaults to commit-time ordering when no ordering field is configured**. Debezium Server's own Iceberg sink has an upsert mode whose dedupe column defaults to `__source_ts_ns` (`debezium.sink.iceberg.upsert-dedup-column`; the record with the highest value is kept), which is timestamp-based deduplication in a first-party sink.                                                                                                                                                                                                                                                                                     | Each format has its own "which row wins" knob, and the default in at least one is arrival order. That is the site's `ts_ms`-versus-log-position lesson, one level down. No page I fetched connects the formats to the log position of the source.                                                                                                                                                                                                                                                                                                                               |
| Snowflake / BigQuery / Databricks CDC ingestion             | **SERP not obtained** (head queries returned the vendor home pages).                                                                                                                                                                                                          | BigQuery CDC doc: requires declared primary keys, `_CHANGE_TYPE` is `UPSERT` or `DELETE`, an optional `_CHANGE_SEQUENCE_NUMBER` supplies the ordering and **ties fall back to BigQuery ingestion time**, `max_staleness` trades freshness for cost, and failed CDC operations can leave data you meant to delete. Databricks AUTO CDC takes `KEYS`, `SEQUENCE BY` and `APPLY AS DELETE WHEN`; its documented multi-column example sequences by a timestamp column and an ID column to break ties. Snowflake streams track changes from an offset.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Three vendors, three names for the same three things: key, sequence, delete marker. A cross-vendor "map your log position to the target's sequence column" page is unclaimed in what I fetched.                                                                                                                                                                                                                                                                                                                                                                                 |
| dbt + CDC                                                   | **SERP not obtained.**                                                                                                                                                                                                                                                        | dbt incremental docs: `unique_key` plus a `merge` strategy. dbt snapshots have a `hard_deletes` setting (`ignore`, `invalidate`, `new_record`). The incremental doc does not discuss event ordering and uses the word "duplicate" four times; the snapshots doc does not mention duplicates.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Show where a `unique_key` merge is idempotent and where it is not (two source rows for one key in one batch). Overlaps `/materialization/`; best as a section, so batch 2.                                                                                                                                                                                                                                                                                                                                                                                                      |
| "debezium exactly once", "is CDC exactly once"              | **SERP not obtained.**                                                                                                                                                                                                                                                        | Debezium's "Exactly-once delivery" page opens by saying Debezium provides an at-least-once guarantee and no internal deduplication layer, then documents an **opt-in mode for Kafka Connect** (`exactly.once.support=required`, built on KIP-618 and KIP-98), documented from Debezium 3.3 onward (the docs page exists for 3.3 to 3.7 and returns 404 for 3.0, 3.2, 2.7 and 1.9; the underlying Kafka Connect support is KIP-618, which predates it). The same page's "Known issues and considerations" section says it is unclear whether the implementation is fully correct, notes that no comprehensive study of recent Kafka transaction and exactly-once correctness exists, points to Jepsen reports on Redpanda and Bufstream and to three open Apache Kafka issues (KAFKA-17734, KAFKA-17754, KAFKA-17582), and says known problems in the Kafka transaction protocol may affect Kafka Connect's guarantee. KIP-618's motivation says exactly-once for sinks has been easier because of unique-key constraints, while source connectors lacked an equivalent. | The claim to test is scope: Kafka Connect source to Kafka topic is one hop. Source database to Kafka to sink is three. Two high-ranking pages (Google Cloud, Streamkap) state exactly-once without that scope. The site's thesis survives, but the wording needs to be scoped: one hop has an opt-in mode that Debezium itself hedges, and nothing reaches an external sink without a deduplicating sink.                                                                                                                                                                       |
| Outbox pattern                                              | **SERP not obtained.**                                                                                                                                                                                                                                                        | Debezium Outbox Event Router docs (an `id` column to remove duplicate messages), the Debezium outbox blog post (6,606 words), and microservices.io's pattern page.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | All three pages already warn about duplicates: microservices.io says the relay may publish a message more than once (for example a crash after publishing and before recording it) so consumers must be idempotent, the Debezium blog says its pipeline is "at least once" and dedupes by event id, and the router docs say the `id` can be used to remove duplicate messages. What I did not find in them is dedupe tied to the log position, or what replay after an offset reset does to the dedupe table (inference from three pages, not a survey). Candidate for batch 2. |
| Postgres replication slot / WAL growing                     | **SERP not obtained.**                                                                                                                                                                                                                                                        | Debezium PostgreSQL docs have a "WAL disk space consumption" section built around `confirmed_flush_lsn` and `restart_lsn`, and a heartbeat remedy for tables with few changes. The PostgreSQL docs define `max_slot_wal_keep_size` (default `-1`: slots may retain unlimited WAL).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | The connector docs are 38,720 words; the failure mode is one section. A short runbook tying "slot position" to "what the sink has durably applied" is a thesis fit and a likely high-intent query. Intent is inferred, not measured.                                                                                                                                                                                                                                                                                                                                            |
| Kafka Connect errors, DLQ                                   | **SERP not obtained.**                                                                                                                                                                                                                                                        | Confluent's "Kafka Connect Deep Dive: Error Handling and Dead Letter Queues" (5,327 words) exists and is the obvious general reference. It contains no mention of CDC.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Covered on-site by `/dlq-triage/` and `/troubleshooting/`. Not a gap.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Schema contracts, registry                                  | **SERP not obtained.**                                                                                                                                                                                                                                                        | Confluent's schema-evolution and data-contracts pages exist (7,870 and 10,320 words) and neither mentions CDC (0 matches for "change data capture" or "CDC").                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `/schema-evolution/` has CDC wrinkles. A contract page for **database-originated** change events (DDL you do not control) is a thin angle; batch 2.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| CDC testing, observability                                  | **SERP not obtained.** No authoritative page for testing was fetched.                                                                                                                                                                                                         | Debezium's monitoring page is 1,336 words. For testing I have only the site's own state (section 2).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Unverified whether anyone ranks for pipeline testing. The site thesis gives it natural test cases (duplicate delivery, reordering, replay), which is a product reason, not a search reason.                                                                                                                                                                                                                                                                                                                                                                                     |
| GDPR delete / erasure with CDC                              | **SERP not obtained.**                                                                                                                                                                                                                                                        | Article 17 of the GDPR (unofficial reproduction at gdpr-info.eu) requires erasure "without undue delay" in listed circumstances. Delta says data files are deleted only when `VACUUM` runs and that time travel defaults to 30 days unless changed. Iceberg lists snapshot expiry as recommended maintenance. BigQuery warns failed CDC operations can retain data meant to be deleted.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | The site has erasure for the log (`/security/`). The unclaimed part is **what survives in the target**: snapshots, time travel and backups. Article 17(3) also lists exceptions (for example a legal obligation to keep the data), and backups and retention copies are separate stores. Not legal advice; the page must say so.                                                                                                                                                                                                                                                |
| Cost of CDC                                                 | **SERP not obtained.**                                                                                                                                                                                                                                                        | BigQuery's doc links cost to `max_staleness` and to reservations. No cost-model source was gathered.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Unverified. Cost pages age quickly (prices). Not now.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Search-index sync (Elasticsearch, OpenSearch)               | **SERP not obtained**, no authoritative page fetched.                                                                                                                                                                                                                         | None gathered.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Unverified. Candidate only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

### What the sample supports, in one paragraph

Of the 10 head-term explainers and setup guides I could fetch (the six
"what is CDC" pages above, plus a Debezium-architecture explainer, an AWS blog
post, Streamkap and SQLShack), **one contains the phrase "at-least-once"** (the
architecture explainer, 2 occurrences) and **three make an exactly-once
statement**: Google Cloud and Streamkap state it without scoping, and the
architecture explainer says Debezium is at-least-once and end-to-end
exactly-once needs extra design. That is a sample of 10 pages from one engine on
one day. It supports "the delivery contract is under-explained in head-term
content" as a hypothesis, not as a finding about the web.

## 4. Signals from the assistant

Verified from `src/data/assistant.yml`: 23 intents (`grep -c "^  - id:" src/data/assistant.yml`),
229 triggers (`node -e` with js-yaml: sum of `triggers.length`, re-run after the merge). Counting lines in the file (triggers and answer
text) that contain a term, with `rg -i -e "<term>" src/data/assistant.yml | wc -l`,
re-run 2026-10-09:

| Term (case-insensitive)                                                    | Lines in `assistant.yml` |
| -------------------------------------------------------------------------- | ------------------------ |
| backfill, replication slot (`slot`), Iceberg, Delta, Hudi, lakehouse       | 0 each                   |
| BigQuery, Snowflake, dbt, DLQ, dead letter, heartbeat, GTID, Elasticsearch | 0 each                   |
| contract                                                                   | 0                        |
| cost, test                                                                 | 2 each                   |

So a visitor typing any of those terms cannot get a topic-specific answer from
the assistant today; the first matches only if the question also contains a
trigger from another intent. The SEO audit (P16-1, section 5) found that 19 of
43 content pages are the link target of no intent and that its 136 "unanswered"
queries were **agent-authored probes, not visitor questions**. I did not re-run
them. The real unanswered-question list does not exist yet; see section 8 for
how to build it from the feedback table.

## 5. Gaps grouped into clusters

Priority combines: (a) is the topic missing or thin on the site (verified),
(b) does the thesis give a distinctive answer (inferred from sources), (c) is
there a plausible searcher intent (inferred; no volume claimed). Each cluster
names its batch.

| Cluster                                         | Gap                                                                                                                                                                                                                                                 | Why it is ours                                                                                                      | Priority | Batch   |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------- | ------- |
| **A. Landing CDC in warehouses and lakehouses** | No page maps the log position and delete marker to each target's ordering and delete controls (BigQuery, Databricks, Hudi, Iceberg, Delta, Snowflake).                                                                                              | The thesis is a position-based ordering rule; targets default to arrival order in places (Hudi, BigQuery ties).     | High     | 1 (M1)  |
| **B. "Is CDC exactly-once?"**                   | Debezium 3.3 and later document an opt-in exactly-once mode for Kafka Connect sources (with a hedge of their own); the site is silent. Head-term pages overclaim.                                                                                   | The site's whole thesis; needs scoping per hop, with the hedge.                                                     | High     | 1 (M2)  |
| **C. Postgres slots and WAL growth**            | Eleven pages say "replication slot" (C4); no runbook. `max_slot_wal_keep_size` is named only in one glossary entry (C9).                                                                                                                            | A slot is a position held on the source; releasing it is an at-least-once decision.                                 | High     | 1 (M3)  |
| **D. Deletes that stay deleted**                | Erasure covered for the log; not for target retention (time travel, snapshots, VACUUM, compaction, backups).                                                                                                                                        | Delete markers are a thesis item; a delete is only real once it is applied and expired everywhere.                  | High     | 1 (M4)  |
| **E. Testing a CDC pipeline**                   | `/tests/` tests the lab stack, not your pipeline.                                                                                                                                                                                                   | Duplicate delivery, reorder and replay are exactly the cases the thesis says will happen; tests make that concrete. | Medium   | 1 (M5)  |
| F. Backfill and re-snapshot as a task           | Word used on 12 pages (C2a); no owner.                                                                                                                                                                                                              | Re-snapshot after slot loss or schema drift ties to C and `/snapshotting/`.                                         | Medium   | 2       |
| G. Contracts for database-originated events     | "data contract" appears in 2 pages (C8) and "contract" in any sense in 7 (C7); no owner.                                                                                                                                                            | DDL you do not control is the CDC-specific part.                                                                    | Medium   | 2       |
| H. Outbox, router and relay                     | Covered inside `/exactly-once/`. Public sources already say the relay is at-least-once and consumers must dedupe by event id, so the gap is depth (what key and position the dedupe uses, and replay after an offset reset), not the basic warning. | Relay at-least-once and dedupe-by-id are on-thesis.                                                                 | Medium   | 2       |
| I. Engine specifics beyond Postgres and Oracle  | SQL Server and MySQL (GTID) have a quickstart each.                                                                                                                                                                                                 | Head-term SQL Server results are native-CDC how-tos, not log-position content.                                      | Medium   | 2       |
| J. Non-Kafka paths and search sync              | Debezium Server and embedded engine (1 file, C14b), Elasticsearch or OpenSearch sync (1 file, C14a).                                                                                                                                                | Debezium Server's Zerobus sink section tells consumers to dedupe, for example by source LSN, which is the thesis.   | Low      | 2       |
| K. Cost modelling                               | No model.                                                                                                                                                                                                                                           | Prices age; no source gathered.                                                                                     | Low      | Not now |

## 6. First batch: five modules

Format follows the Phase 12 items (outcome, thesis hold, scope) and the Phase 13
fields (accept, verify, size, role, needs). Search queries are **inferred and
unmeasured**. Slugs are proposals.

**Accept criteria common to all five** (not repeated below): a `series.mjs`
entry and the `index.11tydata.cjs` per `docs/adding-modules.md`; front matter
with `title` (one brand suffix, at most 60 characters before it), a distinct
`description` of 120 to 155 characters, `datePublished`, `dateModified`; all
internal links use `| url`; at least 3 content links in from existing lessons
and at least 3 out; each new glossary term added with an anchor (P16-14 style);
an assistant intent added to `src/data/assistant.yml` with at least 5 triggers
and the pins updated in `tests/unit/modules/assistant-knowledge-base.test.js`;
no statement that ordering uses `ts_ms` or an offset, none that exactly-once
holds across systems, and none that a delete is complete before the
target has applied it; every external claim carries a URL in a "Further
resources" list; **no CSS** (route anything visual to `css-refactor`).
**Verify for all:** `npm run verify-all`, `npm run smoke:core`.

### M1 · Which row wins: ordering and deletes in your target (cluster A)

- **Outcome:** a reader landing CDC in BigQuery, Databricks, Snowflake, Hudi,
  Iceberg or Delta can name, for their target, the column that carries the source log
  position, the key declaration, and the delete marker, and can say what
  happens if they leave the default.
- **Question it answers:** "My CDC events arrive out of order or twice. What
  does my warehouse or lakehouse do with them, and what do I have to set?"
- **Thesis hold:** at-least-once in, idempotent out; the ordering column must be
  the source log position (LSN, SCN, binlog coordinate), never `ts_ms`, event
  arrival or commit time on the target. One table per target: key declaration,
  sequence setting, delete marker, default tie-break, what a replayed batch does.
  Must say plainly where the default is arrival or ingestion order.
- **Defaults and examples (verified in the vendors' own docs):** Hudi
  falls back to commit-time ordering when no ordering field is set; BigQuery
  breaks `_CHANGE_SEQUENCE_NUMBER` ties by ingestion time; Debezium Server's
  Iceberg sink deduplicates upserts on `__source_ts_ns`
  (`debezium.sink.iceberg.upsert-dedup-column`, highest value kept), a
  timestamp-based rule in a first-party sink; and Databricks' multi-column
  sequencing example uses a timestamp and an ID to break ties. The page says
  what each is good for and why the source log position is the safer ordering
  key where the source provides one.
- **Scope fence:** ordering, keys and delete markers only. Compaction, small
  files and table maintenance are batch 2.
- **Accept (in addition to the common list):** covers at least BigQuery
  (`_CHANGE_TYPE`, `_CHANGE_SEQUENCE_NUMBER`), Databricks (`KEYS`,
  `SEQUENCE BY`, `APPLY AS DELETE WHEN`), Snowflake (streams as an
  offset-based change feed over a landed table, and the MERGE that lands the
  CDC rows; the scout confirms the stream metadata column names at drafting
  time, since this plan checked only the page's offset description), Hudi
  (ordering field and merge modes), Iceberg (upsert with equality fields) and
  Delta (`MERGE`, change data feed as a **source** of changes, not a
  substitute for the log); cluster A and this list name the same six targets;
  each target row cites its documentation page; a worked replay (the same batch applied twice, and two
  events for one key swapped) with the resulting row for each target, checked by
  reading the vendor docs, not by running vendor services; the page states which
  behaviours were not tested by the author.
- **Target search queries (inferred):** "bigquery cdc ordering
  _CHANGE_SEQUENCE_NUMBER", "databricks auto cdc sequence by", "hudi
  ordering field cdc", "iceberg upsert equality fields cdc", "debezium to
  lakehouse duplicates".
- **Internal links in:** `/materialization/`, `/exactly-once/`,
  `/partitioning/` (tie-break section), `/use-cases/` (lakehouse lines),
  `/glossary/`. **Out:** `/event-envelope/`, `/merge-cookbook/`,
  `/cloud-labs/snowflake-cdc/`, M4.
- **Demo idea:** link to `/playground/` with scenario `orders-items-transactions`
  or `burst-updates`: reorder two events for one key and compare "apply in
  arrival order" with "apply by log position". No change to `playground/`.
- **Prerequisite reading:** `/event-envelope/`, `/materialization/`,
  `/partitioning/`. **Size:** M; split by target if drafts exceed ~2,500 words.
  **Role:** `scout` (re-verify each vendor page and quote the setting names),
  `implementer`, `reviewer` (SME check of every vendor claim).

### M2 · Is CDC exactly-once? One hop, three hops

- **Outcome:** a reader can look at a sentence like "delivers with exactly-once
  semantics" and ask the five questions that scope it: which hop, which
  producer, which sink, what happens on failover, and what dedupes.
- **Question it answers:** "Debezium says at-least-once but my vendor says
  exactly-once. Which is right?"
- **Thesis hold:** Debezium documents delivery as at-least-once and says it has
  no internal deduplication layer. From Debezium 3.3 onward it also documents an
  **opt-in** Kafka Connect mode for the connector-to-topic hop, and that page
  itself hedges: its "Known issues and considerations" section says it is
  unclear whether the implementation is fully correct and that known problems in
  the Kafka transaction protocol may affect it. The page must not say that hop
  "is" exactly-once without that qualification. **Delivery from the source
  database through to an external sink is not exactly-once** without a sink that
  dedupes by key and position. The page must update, not contradict, the
  existing wording on `/exactly-once/` and `/errata/`, and the author must flag
  every sentence on those pages that says "never exactly-once" for a scoped
  rewrite (reported to the conductor, not edited here).
- **Accept:** a hop diagram or table (database to connector, connector to
  topic, topic to sink, sink to its own store) with the guarantee at each hop
  and the mechanism, citing Debezium's exactly-once page, KIP-618 and KIP-98;
  the Debezium page's known-issues section is paraphrased and linked (read in
  full for this plan on 2026-10-09: no comprehensive correctness study exists;
  Jepsen reports on Redpanda and Bufstream raise concerns, mostly for
  Bufstream; KAFKA-17734, KAFKA-17754 and KAFKA-17582 are listed as open;
  Connect's guarantee depends on Kafka transactions, so those issues may apply),
  together with its prerequisites (distributed mode, Kafka Connect 3.3.0 or
  higher, `exactly.once.source.support=enabled` on every worker,
  `exactly.once.support=required` and `transaction.boundary=poll` on the
  connector) and the connectors it lists (MariaDB, MongoDB, MySQL, Oracle,
  PostgreSQL, SQL Server); the page names the Debezium version it was checked
  against and says the
  feature is documented from 3.3 onward (the Kafka Connect support itself comes
  from KIP-618); a short "claim checker" list; an
  explicit list of vendor phrases and the question each one needs; no vendor is
  named as wrong unless a fetched page supports it (the two pages found so far,
  Google Cloud's explainer and Streamkap's SQL Server guide, are cited as
  _examples of unscoped wording_, not accused).
- **Target search queries (inferred):** "debezium exactly once",
  "is change data capture exactly once", "kafka connect exactly once source
  connector", "cdc duplicates at least once".
- **Internal links in:** `/exactly-once/`, `/errata/`, `/event-envelope/`,
  `/tooling/`, `/compare/`, assistant intent `exactly_once`. **Out:**
  `/materialization/`, `/ops-offsets/`, M1.
- **Demo idea:** `/playground/` scenario `outbox-relay` plus a crash-and-restart
  step: show the duplicate arriving, then the sink dropping it by key and
  position.
- **Prerequisite reading:** `/exactly-once/`, `/errata/`, `/ops-offsets/`.
  **Size:** M. **Role:** `scout` (re-read the Debezium EOS page and KIP-618 in
  full, confirm the Kafka issue statuses and the version range), `implementer`, `reviewer`. **Needs:** the
  conductor decides whether this is a new module or a section on
  `/exactly-once/`; the brief should say which before work starts.

### M3 · Postgres replication slots and WAL growth: the runbook

- **Outcome:** an operator seeing disk fill on a Postgres primary can tell
  whether a CDC slot is the cause, what each choice (fix the consumer, drop the
  slot, cap retention) costs, and what the pipeline must do afterwards.
- **Question it answers:** "My Postgres disk is filling and I use Debezium.
  What do I check, and is it safe to drop the slot?"
- **Thesis hold:** a slot holds a position; the connector acknowledges that
  position only after it has the event, so recovery is at-least-once. Dropping
  or invalidating a slot loses the position, and the only correct recovery is a
  re-snapshot into an idempotent sink. Heartbeats move the position for
  quiet tables; they do not make delivery exactly-once.
- **Accept:** shows the checks (`pg_replication_slots`: `active`,
  `restart_lsn`, `confirmed_flush_lsn`) with the retained-WAL query; explains
  `max_slot_wal_keep_size` and what a limit trades (disk for a lost slot), with
  the PostgreSQL docs cited; explains the heartbeat remedy and the publication
  requirement from the Debezium docs; ends in a decision table: lagging
  consumer, dead consumer, abandoned slot, invalidated slot, each with the
  recovery path and a link to `/snapshotting/` and `/reconciliation-surgery/`.
  Version differences stated or the page names the version it was checked
  against.
- **Target search queries (inferred):** "debezium postgres replication slot
  growing wal", "postgres replication slot disk full debezium",
  "max_slot_wal_keep_size debezium", "debezium heartbeat postgres".
- **Internal links in:** `/troubleshooting/`, `/quickstarts/quickstart-postgres/`,
  `/cloud-labs/snowflake-cdc/`, `/cloud-labs/fivetran/`, `/observability/`,
  `/snapshotting/`. **Out:** `/ops-offsets/`, `/snapshotting/`,
  `/reconciliation-surgery/`, `/connector-builder/`.
- **Demo idea:** `/playground/` scenario `snapshot-to-stream` or `snapshot-replay`
  for the "slot lost, re-snapshot, converge" sequence; a small table of
  retained WAL against a stalled consumer can be an in-page widget later (CSS
  would be routed to `css-refactor`).
- **Prerequisite reading:** `/troubleshooting/`, `/ops-offsets/`,
  `/snapshotting/`. **Size:** M. **Role:** `scout` (check the Debezium and
  PostgreSQL sections against the current stable docs), `implementer`,
  `reviewer`.

### M4 · Deletes that stay deleted: tombstones, compaction and time travel

- **Outcome:** a reader can trace one deleted row from the source through the
  topic, the DLQ, the warehouse or lakehouse, snapshots and backups, and list
  where a copy can still exist and which setting governs it.
- **Question it answers:** "A user asked us to delete their data. Is it gone
  after the DELETE event reached the warehouse?"
- **Thesis hold:** a delete is an event with a position, applied by an
  idempotent sink; applying it twice is harmless and applying it before an
  older insert for the same key is a bug (the position rule again). The page
  extends `/security/` and must not restate its three strategies.
- **Accept:** a trace table (source row, change event, tombstone and
  `delete.retention.ms` on a compacted topic, DLQ copy, target row, target
  history such as Delta `VACUUM` and time travel, Iceberg snapshot expiry,
  BigQuery's failed-operation warning, backups) with the control and the
  documentation URL for each; one worked example of delete-then-late-insert;
  a section on GDPR Article 17(3), which lists exceptions to the right to
  erasure (for example a legal obligation to retain), and on backups and
  retention copies, which are separate stores with their own schedules and are
  not removed by a DELETE event; `delete.retention.ms` and the other Kafka
  settings are confirmed against the Kafka documentation at drafting time (not
  fetched for this plan); a plain "this is not legal advice" line; GDPR
  Article 17 linked at drafting
  time to the official EUR-Lex text (the unofficial reproduction was fetched
  for this plan, the official text was not).
- **Target search queries (inferred):** "gdpr delete kafka debezium",
  "delete from delta lake gdpr vacuum", "tombstone kafka compaction delete
  retention", "cdc right to be forgotten".
- **Internal links in:** `/security/`, `/event-envelope/` (tombstones),
  `/materialization/`, `/use-cases/`, `/case-study/`, M1. **Out:** `/security/`,
  `/dlq-triage/`, `/materialization/`.
- **Demo idea:** `/playground/` scenario `retention-erasure` (exists, verified in
  `shared-scenarios.js`); the lesson names what the scenario shows and what it
  deliberately does not (storage-level retention).
- **Prerequisite reading:** `/security/`, `/event-envelope/`,
  `/materialization/`. **Size:** M. **Role:** `scout`, `implementer`,
  `reviewer`. **Needs:** the maintainer's go-ahead on legal wording, since the
  page touches a regulation; this plan does not provide it.

### M5 · Testing a CDC pipeline: contract, duplicate and replay tests

- **Outcome:** a reader can write three test families for their own pipeline
  and say what each proves: envelope contract tests, duplicate and reorder
  injection against the sink, and replay-from-offset convergence.
- **Question it answers:** "How do I test a CDC pipeline so I know it survives
  duplicates, restarts and schema changes?"
- **Thesis hold:** the tests assert the contract (at-least-once in, convergent
  state out), not "no duplicates". The convergence test is: apply the same
  change log twice, and in a permuted order that preserves per-key log position,
  and compare final table state.
- **Accept:** a runnable example (SQL or a small script, in the style of the
  existing `/merge-cookbook/` samples) for each family, with expected output
  shown; the page states that `/tests/` checks the lab stack and these tests
  check **your** pipeline, and links the two; a fixture of change events
  (create, update, delete, duplicate, out-of-order) the reader can copy; the
  examples are executed by the implementer and the command and result recorded
  in the PR, not just written.
- **Target search queries (inferred):** "test debezium pipeline",
  "cdc idempotency test", "test kafka connect sink duplicates",
  "change data capture testing strategy".
- **Internal links in:** `/tests/`, `/observability/`, `/merge-cookbook/`,
  `/materialization/`, `/lab-kafka-debezium/`. **Out:** `/event-envelope/`,
  `/exactly-once/`, `/reconciliation-surgery/`, `/debezium-decoder/`.
- **Demo idea:** `/playground/` scenarios `crud-basic` and `snapshot-replay`: a
  "replay the same log twice" step that ends in an equality check. Could be
  proposed to the playground owner under P16-3; this module only links.
- **Prerequisite reading:** `/materialization/`, `/exactly-once/`, `/tests/`.
  **Size:** M. **Role:** `implementer` (examples, run them), `reviewer`.

### Order and dependencies

M2 first (it can change wording M1, M3 and M4 depend on), then M1, M3, M4, M5 in
any order. Each ships as its own PR. Because P16-6, P16-7, P16-8 and P16-14 touch
the same templates, glossary and series data, start M1 after P16-14 lands or
re-base before opening the PR.

## 7. Next batch and "not now"

### Next batch candidates (cluster, reason)

- **Backfill and re-snapshot as a task** (F): the word is on 12 pages; M3 and M1
  create the need.
- **Contracts for database-originated events** (G): build on `/schema-evolution/`.
- **Outbox router and relay** (H): public sources already warn about duplicates
  and tell consumers to dedupe by event id; the batch-2 module would add
  dedupe tied to position and replay after an offset reset.
- **SQL Server and MySQL specifics** (I): the SQL Server SERP sample is
  setup-oriented.
- **dbt `unique_key` merges and snapshots against CDC history** (cluster A
  extension): as a section of `/materialization/`.
- **Lakehouse maintenance for CDC tables** (A extension): compaction, equality
  deletes, snapshot expiry. Held back from M1 for size.
- **Debezium Server and the embedded engine** (J): Debezium Server's Zerobus sink
  section tells consumers to dedupe, for example by source LSN.

### Not now

| Topic                                              | Reason                                                                                                                             |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Cost modelling for self-hosted vs managed          | No cost source was gathered; prices age; a model without measured numbers would be invented. Revisit with a reviewed price source. |
| Search-index sync                                  | No authoritative page fetched; one page of site coverage; wait for feedback or Search Console data.                                |
| A vendor-by-vendor shootout                        | Pulls the site away from its contract-first stance; P16-13 already scopes `/tooling/` versus `/compare/`.                          |
| Streaming engines (Flink, Spark) deep dives        | Flink CDC and Spark are broad topics; cover them through targets in M1 first and see what visitors ask.                            |
| "CDC in Snowflake/Databricks" per-vendor tutorials | Cloud labs exist; vendor UIs change; M1 covers the portable part.                                                                  |
| Anything that needs search-volume ranking          | There is no data to rank with. Do not rank topics against each other on volume until P16-12 has run for 28 days.                   |

## 8. Re-run this plan when

- The `assistant_feedback` table has **at least 30 rows** (an arbitrary but
  workable floor, chosen for this plan, not derived from a statistic). Procedure,
  maintainer step: read the table in the Supabase dashboard, export the 👎 rows
  and the questions whose `intent_id` is `null` or the fallback, group by the
  clusters above, and update section 4 and the priorities.
- Search Console has 28 days of data (P16-12): replace each "inferred" query
  with a measured one and delete the ones that never appear.
- Debezium, Kafka or any cited vendor page changes the claim a module relies on
  (M2 especially; the Debezium page is versioned, is documented from 3.3 onward (the page exists for 3.3 to 3.7 only), and I read the 3.7 build).
- A module in the first batch ships, so its cluster can be re-scored.

Questions for the maintainer (not answered here): whether M2 should be a module
or a section; who signs off the legal wording in M4; whether the 30-row floor is
acceptable.

## 9. Sources (accessed 2026-10-09)

SERP sample (Bing HTML, unpersonalised): queries "what is change data capture",
"change data capture sql server", "debezium alternatives".

Debezium: `https://debezium.io/documentation/reference/stable/configuration/eos.html`;
`https://debezium.io/documentation/reference/stable/connectors/postgresql.html`;
`https://debezium.io/documentation/reference/stable/operations/debezium-server.html`;
`https://debezium.io/documentation/reference/stable/transformations/outbox-event-router.html`;
`https://debezium.io/documentation/faq/`;
`https://debezium.io/blog/2019/02/19/reliable-microservices-data-exchange-with-the-outbox-pattern/`.

Kafka: `https://cwiki.apache.org/confluence/display/KAFKA/KIP-618%3A+Exactly-Once+Support+for+Source+Connectors`.
Confluent: `https://www.confluent.io/blog/kafka-connect-deep-dive-error-handling-dead-letter-queues/`;
`https://docs.confluent.io/platform/current/schema-registry/fundamentals/schema-evolution.html`;
`https://docs.confluent.io/platform/current/schema-registry/fundamentals/data-contracts.html`.

Targets: `https://docs.cloud.google.com/bigquery/docs/change-data-capture`;
`https://docs.databricks.com/aws/en/ldp/cdc`;
`https://hudi.apache.org/docs/record_merger/`;
`https://iceberg.apache.org/docs/latest/flink-writes/`;
`https://iceberg.apache.org/spec/`;
`https://iceberg.apache.org/docs/latest/maintenance/`;
`https://docs.delta.io/delta-change-data-feed/`;
`https://docs.delta.io/delta-update/`; `https://docs.delta.io/delta-batch/`;
`https://docs.snowflake.com/en/user-guide/streams-intro`;
`https://docs.getdbt.com/docs/build/incremental-models`;
`https://docs.getdbt.com/docs/build/snapshots`.

Postgres: `https://www.postgresql.org/docs/current/runtime-config-replication.html`;
`https://www.postgresql.org/docs/current/warm-standby.html`.

Pattern and regulation: `https://microservices.io/patterns/data/transactional-outbox.html`;
`https://gdpr-info.eu/art-17-gdpr/` (unofficial reproduction).

Head-term pages checked for delivery-contract wording:
`https://www.databricks.com/blog/what-is-change-data-capture`;
`https://www.geeksforgeeks.org/system-design/change-data-capture-cdc/`;
`https://en.wikipedia.org/wiki/Change_data_capture`;
`https://www.ibm.com/think/topics/change-data-capture`;
`https://cloud.google.com/discover/what-is-change-data-capture`;
`https://learn.microsoft.com/en-us/sql/relational-databases/track-changes/about-change-data-capture-sql-server?view=sql-server-ver17`;
`https://mljourney.com/debezium-architecture-explained-for-data-engineers/`;
`https://aws.amazon.com/blogs/database/implementing-real-time-change-data-capture-with-debezium-for-amazon-aurora-postgresql-and-amazon-rds-for-postgresql/`;
`https://streamkap.com/resources-and-guides/sql-server-cdc-setup-guide`;
`https://www.sqlshack.com/change-data-capture-for-auditing-sql-server/`.
DataCamp and Baeldung returned 403 to a plain request and are not used as
evidence.

Repo files read: `src/_data/series.mjs`, `src/data/assistant.yml`,
`playground/assets/shared-scenarios.js`, `docs/seo-audit-2026-10.md`,
`docs/IMPLEMENTATION-PLAN.md` (Phases 12, 13, 16), `docs/adding-modules.md`,
`docs/SETUP.md`.

## 10. What I did not do

- No feedback-table read (no access) and no use of the SEO audit's 136
  synthetic queries as demand.
- No search-volume, difficulty or ranking figure.
- No SERP for 12 of the 15 rows in the section 3 table (scrape quality, section 1). The
  "what pages cover" column for those is from the authoritative pages, which a
  searcher might or might not see first.
- No run of any vendor product; M1 and M2 rely on reading documentation.
- Did not read the PostgreSQL slot-invalidation behaviour across versions, the
  official GDPR text, Kafka's `delete.retention.ms` documentation, or the
  Snowflake stream metadata columns. Each is flagged in the module that needs
  it. (The Debezium exactly-once page's known-issues section was read in full
  after review; see M2.)
- No edits to `docs/IMPLEMENTATION-PLAN.md`, `CHANGELOG.md` or any `src/` file.
  The conductor may turn section 6 into plan items (using the next free
  Phase 16 IDs) when the maintainer approves.
