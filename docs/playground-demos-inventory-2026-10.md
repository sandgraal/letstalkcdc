# Playground demos inventory and first labs — 2026-10 (P16-3)

Scope: which lessons should get a "try it" link into `/playground/`, which
named scenario each would use, where there is no suitable scenario, and a
proposal for the first three new labs. **Docs only.** Nothing under
`playground/`, `src/` or the plan was changed; any change under `playground/`
needs the playground code owner first (CODEOWNERS has one catch-all entry,
`* @sandgraal`; no separate playground owner is recorded).

Method, so you can weigh the claims:

- **Read** = I read the source (`playground/assets/shared-scenarios.js`,
  `assets/app.js`, `web/App.tsx`, `src/modes/*`, `src/domain/storage.ts`,
  `src/changefeed/model.ts`, `web/changefeed/*`, `index.html`) and the lesson
  templates in `src/`.
- **Replayed** = I ran the playground's own mode adapters
  (`src/modes/logBased|queryBased|triggerBased`) and its sink
  (`InMemoryTableStorage`) in Node against each scenario's `ops`, with the
  app's default lane settings (polling 500 ms, trigger 250 ms / 8 ms
  overhead, log 50 ms). This is **not** a browser run. It skips the React
  controller layer, so counts could differ at the margins.
- **Inferred** = reasoning from the above; labelled where it matters.
- **Unverified pairing** = the scenario exists and I read it, but I did not
  confirm in code or a replay that it shows what the prompt says.
- An independent review of the first version confirmed findings 4, 6 and 7, found finding 5 only partly true, and corrected several pairings; this version applies those corrections.
- Nothing here was run in a browser, and no anchor was checked in a built
  `_site/`; anchors were checked as `id="..."` in the lesson `.njk` sources
  at `origin/main` as merged on 2026-10-09 (review round 1 applied).

## 1. Summary

| #   | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Basis           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- |
| 1   | **No URL selects a named scenario.** The only scenario query parameter, `?scenario=`, is a _share id_ looked up in the Supabase `scenarios` table. A lesson can link to the page and a section, not to a scenario. (`/materialization/` is cited below only for the link convention; it does not link to the playground.)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Read            |
| 2   | 11 shared scenarios (Compare methods tab, plus a "Use template" gallery) and 6 separate demo scenarios (Drive one feed tab). **No lesson links to the playground today** (only the nav menu and `/privacy/` do).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Read            |
| 3   | The playground's sink is an unconditional upsert (merge on arrival); a delete removes the row with no marker; no scenario delivers an event twice; no sink guard exists. **None of the three thesis items readers get wrong can be demonstrated, only the "unguarded" half of one of them.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Read            |
| 4   | Docs and copy promise controls that are not in the source: **"Drop snapshot rows" and "Dedupe on PK"** (README, `playground/docs/*`, `highlight` text of `snapshot-replay` and `snapshot-to-stream`). `rg -i "dedupe on pk\|drop snapshot"` finds them only in docs, README, tests and copy. **Fixed in slice B:** the copy was removed everywhere (README, `playground/docs/*`, both `highlight` texts, tags, guidance, fixtures, regenerated bundles); a unit test greps for it.                                                                                                                                                                                                                                                                                                                                                                                             | Read            |
| 5   | **Ordering is timestamp-based in three places, and the sinks have no guard.** (a) The Compare tab's metric `orderingOk` (`web/App.tsx:961-965`) is true only if `ts_ms` never decreases, so a run that is correct by log position can read "Ordering: KO". (b) The Compare sink applies in bus FIFO order (offsets), **not** timestamp-sorted. (c) Drive-one-feed apply-on-commit sorts by `commitTs`, then `lsn` (`model.ts:216-217`). (d) Both sinks are unconditional upserts, and a delete removes the row with no marker (`storage.ts:148-163`). The lane "N ordering" chip is a different check (expected vs arrival index, `sim/analysis/diff.ts:156-179`), not `ts_ms`. **Fixed in #384 for (a) and (c):** `orderingOk` now checks per-key log position (`tx.lsn`), apply-on-commit orders by `lsn`, and `ts_ms` feeds only the Lag metric. (b) and (d) are unchanged. | Read            |
| 6   | The Drive-one-feed "dropped events" counter (`broker.dropped`) is initialised to 0 and never incremented, so "Event Drops & Faults" can never show a drop count even though events are dropped. **Fixed in #384:** `pollBroker` now increments it, and the demo drops an event (see section 3.2).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Read            |
| 7   | Seed `rows` are not loaded into the Compare lanes (`startSnapshot([])`), so a scenario that deletes or updates a seed-only row produces an event with no prior state (e.g. `snapshot-replay` deleting `LED-101` yields a delete event with no key; replay: lane emits it, sink ignores it). **Slice B decision: documented, not changed.** 9 of 11 scenarios have a `rows` entry with the same table and key as an `insert` op (rows is a final-state preview), so loading `rows` would be a duplicate-key insert; loading seed data would also change snapshot events per adapter. See the comment at the top of `shared-scenarios.js`.                                                                                                                                                                                                                                       | Replayed        |
| 8   | `snapshot-replay` does **not** model a stale snapshot row. Its v1 "re-insert" of `LED-100` (`shared-scenarios.js:546-551`) is an ordinary source insert at `t=190`, so it has a later log position than the v2 update, and a position guard would correctly apply it. The log sink goes 12,750 -> 12,500 -> 12,980 because the source wrote those values in that order. It does not demonstrate the snapshotting lesson's point. **Relabelled in slice B** (id unchanged): the scenario is now "Re-insert after Update" and says it does not model redelivery.                                                                                                                                                                                                                                                                                                                 | Replayed + Read |
| 9   | Three new labs (section 6) share one missing primitive: **redeliver an earlier log record with its original position**, plus a per-lane **sink guard mode**. Build it once, and each lab is then scenario data.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Inferred        |

## 2. How a reader reaches a scenario today

Published path: `scripts/publish-playground.sh` copies `playground/index.html`
and `playground/assets/` to `_site/playground/`, so the page is
`https://sandgraal.github.io/letstalkcdc/playground/`. In a template, use
`{{ '/playground/' | url }}` (the `base.njk` nav already does); append a fragment after the filter, the convention `materialization/index.njk` uses for `{{ '/partitioning/' | url }}#recon` (that file has no playground link; only `base.njk` and `privacy/index.njk` do):
`{{ '/playground/' | url }}#simulator`. (Read.)

Fragments that exist in `playground/index.html` (Read): `#templateTitle`
(scenario gallery heading), `#playground` (workspace), `#simulator`
(interactive simulator, both tabs). Tabs and scenario choice are **not**
addressable.

What I searched for and did **not** find (Read): every use of `location`,
`URLSearchParams`, `hash` and `history` in `assets/*.js`, `web/**`, `src/**`
and the inline scripts in `index.html`. The only parameters read are:

| Parameter               | Effect                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `?scenario=<id>`        | **Share id**, resolved by `rpc("get_scenario")` against Supabase (`app.js:850`, `:1968`). Suppresses onboarding. A named id such as `crud-basic` finds no stored row, so the status reads "Shared scenario not found." (`app.js:1971-1974`, Read; not executed, and it assumes the RPC returns no row rather than an error). "Unable to load shared scenario" is the RPC-error path only (`app.js:2037`). |
| `?resetOnboarding`      | Clears the onboarding flag.                                                                                                                                                                                                                                                                                                                                                                               |
| `?flag=` / `?flags=a,b` | Feature flags (`assets/feature-flags.js`).                                                                                                                                                                                                                                                                                                                                                                |

How a reader launches a scenario by hand (Read):

1. **Compare methods tab** (scenarios from `shared-scenarios.js`): open
   `#simulator`, choose the **Compare methods** tab, pick the scenario in the
   dropdown (or a "scenario recommender" button), press **Start**. The choice
   persists in `localStorage` key `cdc_comparator_prefs_v1`. This is where the
   scenario `ops` actually run.
2. **Scenario gallery** ("Use template", `#templateTitle`): loads the scenario's
   `schema` and seed `rows` into the workspace table. **It does not run the
   `ops`**: every scenario has `events: []`, and `ops` are used only for the
   "Preview" list and "Download JSON". (Read: `applyScenarioTemplate`, grep of
   `.ops`.)
3. **Drive one feed tab** (default tab): six buttons from
   `web/changefeed/DemoScenarios.ts`, section 3.2.

Programmatic hooks that already exist (Read; a future link loader could use
them): `window.dispatchEvent(new CustomEvent("cdc:apply-scenario-template",
{ detail: { id } }))` loads a template into the workspace. There is no
equivalent for the Compare tab; the scenario id comes from `localStorage`.

**Proposed link form** (needs the playground owner; not live): add a
namespaced parameter, `?try=<scenario-id>`, that selects the tab and scenario
and does nothing else, so the final links are
`{{ '/playground/' | url }}?try=crud-basic#simulator`. It must not reuse
`?scenario=` (share ids). Changing `web/App.tsx` means rebuilding the
committed bundles in `playground/assets/generated/`, which the
`playground-generated-bundles` workflow guards. **Until then**, every link
below works as plain `{{ '/playground/' | url }}#simulator`, and the reader
prompt names the scenario to pick.

## 3. Scenario inventory

### 3.1 The 11 shared scenarios (`playground/assets/shared-scenarios.js`)

`ops` = source operations replayed in the Compare tab; seed rows are not
loaded into the lanes (finding 7). Lane columns are events each lane emitted
in a replay at default settings (Replayed). `D` = delete events.

| id                          | Title                       | Difficulty   | Ops (deletes) | Polling / Trigger / Log events | What it actually shows (Replayed unless noted)                                                                                                                                                                                                                                                                   | Copy that overstates                                                                                                                                                                             |
| --------------------------- | --------------------------- | ------------ | ------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `crud-basic`                | CRUD Basic                  | beginner     | 3 (1)         | 1 / 3 / 3                      | Insert, update, delete of one row. Log and trigger report all three; polling reports one event (the delete happened before the next poll, and soft deletes are off). Sink ends empty.                                                                                                                            | none                                                                                                                                                                                             |
| `omnichannel-orders`        | Omnichannel Orders          | intermediate | 5 (1)         | 2 / 5 / 5                      | Status transitions on one order plus a child table; polling collapses the transitions; the child-table delete is only in log/trigger.                                                                                                                                                                            | none                                                                                                                                                                                             |
| `real-time-payments`        | Real-time Payments          | intermediate | 6 (1)         | 1 / 6 / 6                      | Payment lifecycle with a risk-review row that is created, approved and deleted. Polling sees one event.                                                                                                                                                                                                          | "Demonstrating idempotent updates": nothing is replayed or repeated                                                                                                                              |
| `outbox-relay`              | Outbox Relay                | advanced     | 8 (1)         | 3 / 8 / 8                      | Order updates alongside `outbox_events` rows with stable ids (`EVT-221-1..3`); the first outbox row is later deleted. Log sink ends with 2 outbox rows.                                                                                                                                                          | "ordering + dedupe safety": no relay, no duplicate, no dedupe                                                                                                                                    |
| `iot-telemetry`             | IoT Telemetry               | intermediate | 4 (1)         | 1 / 4 / 4                      | Append-style readings, one flagged, the oldest hard-deleted. Keys embed a timestamp (`DEV-5@10`).                                                                                                                                                                                                                | "soft-delete vs. log consistency and clock controls": the delete is a hard delete; no clock control is used                                                                                      |
| `retention-erasure`         | Retention & Erasure         | advanced     | 13 (3)        | 5 / 13 / 13                    | Masking updates then a hard delete for `C-300`; `C-301` is "erased" by update with no delete. Earlier events for `C-300` stay in the event list after its delete. The `t=90` update does carry `email: null`, but the original address never appears in any event, because seed rows are not loaded (finding 7). | "drop snapshot and dedupe controls" (finding 4)                                                                                                                                                  |
| `schema-evolution`          | Schema Evolution            | intermediate | 4 (0)         | 2 / 4 / 4                      | Inserts and updates only. The schema change comes from the **Schema walkthrough** (add/drop column mid-run), which both the log and query adapters turn into a schema-change event (Read: `applySchemaChange`; the log emits it at once, polling queues it to the next poll).                                    | none                                                                                                                                                                                             |
| `orders-items-transactions` | Orders + Items Transactions | advanced     | 4 (0)         | 4 / 4 / 4                      | One 3-row transaction (`TX-720`: order + 2 items), then an update. Use the **Apply on commit** toggle.                                                                                                                                                                                                           | none                                                                                                                                                                                             |
| `snapshot-replay`           | Re-insert after Update      | advanced     | 5 (1)         | 2 / 5 / 5                      | `LED-100` update to v2, then an insert of the v1 values at `t=190` (a later source write, not a stale snapshot row), then v3. Log sink goes 12,750 -> 12,500 -> 12,980. Delete of seed-only `LED-101` emits a keyless delete.                                                                                    | none after slice B (was: "Drop-snapshot and dedupe controls", which did not exist)                                                                                                               |
| `burst-updates`             | Burst Updates               | intermediate | 5 (0)         | 1 / 5 / 5                      | Five changes to one key (`W-1`) within 220 ms. Log shows all five in order; polling shows the last.                                                                                                                                                                                                              | none                                                                                                                                                                                             |
| `snapshot-to-stream`        | Account Changes             | advanced     | 5 (1)         | 2 / 5 / 5                      | Updates, an insert and a delete across three accounts, each row carrying a rising `last_change_id` (`chg-095` ... `chg-107`). No snapshot phase and no handoff is modelled (finding 7).                                                                                                                          | already fixed on main before P16-27 (renamed "Account Changes"; the description says there is no snapshot phase and no handoff); P16-27 changed no copy; the dedupe claim was removed in slice B |

Facts across all 11 (Read, plus a script over `ops`): no scenario has an
operation on a key after that key's delete; none has a non-monotonic `t`; no
scenario repeats an event. The only repeated key is `LED-100` in
`snapshot-replay`. `playground/src/data/scenarios.json` (7 older entries) is
not loaded by the app; the only reference is a stale passthrough at
`playground/.eleventy.js:3` (found with `rg -uu`; a plain `rg` skips dotfiles).

### 3.2 The 6 Drive-one-feed demos (`web/changefeed/DemoScenarios.ts`)

A separate reducer (`src/changefeed/model.ts`): source -> 3 broker partitions
-> consumer. Read only; these were not replayed.

| id                        | Title                   | What it does                                      | Note                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------- | ----------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `multi-table-transaction` | Multi-Table Transaction | apply-on-commit, place an order (order + 3 items) | Transaction atomicity                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `schema-drift-demo`       | Schema Evolution        | drift on, insert 2 customers, update one          | New column `priority_flag` flows to the consumer                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `commit-lag-demo`         | Commit Lag & Drift      | commit drift on, inserts, update, order           | Drift inserts events at the head of a partition queue. **Do not link from `/partitioning/#ordering`**: it looks like within-partition reordering, which the lesson says Kafka does not do.                                                                                                                                                                                                                                                                                                                  |
| `backlog-recovery`        | Backlog Recovery        | inject 12 events, throttle apply to 1 per tick    | The backlog counter falls as the throttled consumer drains. Since #384 the lag figure is above 0 and drains to 0: `injectBacklog` spaces the 12 commit timestamps 100 ms apart, and lag is latest commit minus last applied commit (Replayed in `changefeed-fixes.test.ts`; `deriveLag`).                                                                                                                                                                                                                   |
| `fault-injection`         | Event Drops & Faults    | 20% drop probability, 3 customers, an order       | Before #384 it dropped nothing: the button resets first, so the run produces `lsn` 1-6, and `shouldDrop` hashed `String(lsn)` (first drop at `lsn` 22). Since #384 `shouldDrop` uses a multiplicative hash, `lsn` 5 (an order item) drops, and `broker.dropped` increments. Under apply-on-commit the 3-event order transaction then stalls at 2 of 3 forever (no redelivery is modelled), while apply-as-polled does not stall; the banner says so. This demonstrates a stalled transaction, not recovery. |
| `apply-policy-compare`    | Apply Policies          | apply-as-polled, place an order                   | Partial transactions visible                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

## 4. Lesson map (all 26 entries of `src/_data/series.mjs`)

Link rule: today `{{ '/playground/' | url }}#simulator`; target
`{{ '/playground/' | url }}?try=<scenario>#simulator` once the owner adds
`?try=`. "Insert after" is an element id found in the lesson's `.njk`.
Fit: **Good** = replayed or read and it shows what the prompt claims;
**Partial** = shows a related effect, caveat given; **Unverified pairing**;
**None** = no suitable scenario.

| #   | Lesson                             | Insert after                              | Scenario                                | Reader prompt (one sentence)                                                                                                                                                                   | Fit                                                                                                                                           |
| --- | ---------------------------------- | ----------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `/intro/`                          | `#methods-comparison`                     | `crud-basic`                            | Run CRUD Basic with all three lanes and count events: log and trigger each see the insert, update and delete, polling sees one.                                                                | Good (Replayed)                                                                                                                               |
| 2   | `/event-envelope/`                 | `#anatomy-title`                          | `crud-basic`                            | In the log lane's event list, open the three events and find which ones have a `before` and which have no `after`.                                                                             | Good (Read: `buildRowEvent`)                                                                                                                  |
| 2b  | `/event-envelope/`                 | `#ordering-title`                         | `burst-updates`                         | Run Burst Updates and read the log lane: five changes to one key arrive in the order they were committed.                                                                                      | Good (Replayed). Do not point readers at the Compare "Ordering" metric (finding 5a); it misfires                                              |
| 2c  | `/event-envelope/`                 | `#delivery-title`                         | Lab 1 (new)                             | Replay the same change twice and watch what an unguarded sink does.                                                                                                                            | New lab                                                                                                                                       |
| 3   | `/materialization/`                | `#merge-title`                            | `burst-updates`                         | Five events, one key: a MERGE that keeps the latest per key leaves exactly the row the sink ends with (`status = ready`).                                                                      | Good (Replayed sink)                                                                                                                          |
| 3b  | `/materialization/`                | `#merge-title` (step 2, ordering)         | Lab 2 (new)                             | Two changes in the same millisecond: which one is newer depends on whether you sort by `ts_ms` or by log position.                                                                             | New lab                                                                                                                                       |
| 3c  | `/materialization/`                | `#merge-title` (step 4, delete markers)   | Lab 3 (new)                             | Delete a row, then deliver an older update late, with and without a delete marker.                                                                                                             | New lab                                                                                                                                       |
| 3d  | `/materialization/`                | `#late-arrivals-title`                    | Lab 2 (new)                             | As 3b.                                                                                                                                                                                         | New lab                                                                                                                                       |
| 4   | `/snapshotting/`                   | `#idempotent`                             | none suitable now; Lab 3 (new)          | (None.) `snapshot-replay`'s v1 "re-insert" is an ordinary later source insert, so it does not show a late snapshot row losing to a newer change.                                               | None: does not demonstrate the lesson's point                                                                                                 |
| 4b  | `/snapshotting/`                   | `#watermarks`                             | none                                    | (None.) `snapshot-to-stream` has no snapshot phase or watermark; the playground cannot show the low/high-watermark window.                                                                     | None                                                                                                                                          |
| 5   | `/exactly-once/`                   | `#idempotency`                            | Lab 1 (new)                             | Compare an append-only sink, a plain upsert and a guarded sink after a rewind replays the last three changes.                                                                                  | New lab. The page already has an inline crash/redeliver demo (`#demo`); the lab extends it with the stale-overwrite and guard cases           |
| 5b  | `/exactly-once/`                   | `#outbox`                                 | `outbox-relay`                          | Run Outbox Relay and compare `orders` with `outbox_events`: each business event has its own stable id, which is what a downstream sink would dedupe on.                                        | Partial: shows the ids, not any dedupe or relay                                                                                               |
| 6   | `/multi-tenancy/`                  | -                                         | none                                    | (None.) Isolation and topic math; no tenant concept in the playground.                                                                                                                         | None                                                                                                                                          |
| 7   | `/partitioning/`                   | `#recon` ("Making Sinks Bulletproof")     | Labs 1 and 2 (new)                      | See why the version guard needs a log-position column: replay an old change and compare sinks that do and do not check it.                                                                     | New lab                                                                                                                                       |
| 8   | `/schema-evolution/`               | `#cdc-notes`                              | `schema-evolution` + Schema walkthrough | Add a column mid-run and watch the schema-change event appear in the log lane at once and in the polling lane at its next poll; existing rows show `null` until updated.                       | Good (Read adapters; not replayed with the walkthrough)                                                                                       |
| 9   | `/ops-offsets/`                    | `#drills-title`                           | Lab 1 (new)                             | Rewind the consumer and replay the last changes; check the sink still ends correct and never goes backwards.                                                                                   | New lab                                                                                                                                       |
| 10  | `/observability/`                  | `#signals-title`                          | Drive-one-feed `backlog-recovery`       | Throttle the consumer and watch the backlog counter fall as it drains (since #384 the lag figure also starts above 0 and drains to 0).                                                         | Partial (Read; not run)                                                                                                                       |
| 11  | `/non-relational/`                 | -                                         | none                                    | (None.) No resume tokens, shard retention or per-node commitlog model.                                                                                                                         | None                                                                                                                                          |
| 12  | `/security/`                       | `#erasure-title`                          | `retention-erasure`                     | After the delete at t=150, scroll the log lane: the earlier events for `C-300` are still there, so deleting the row did not remove its history.                                                | Partial (Replayed): history stays; the `t=90` update carries `email: null`, but the original address never appears (seed rows are not loaded) |
| 13  | `/reconciliation-surgery/`         | `#when-reconciliation-title`              | none                                    | `fault-injection` now loses rows (since #384) and counts them in Dropped, but it models unrecoverable loss with no redelivery and stalls apply-on-commit; it is not a reconciliation exercise. | None                                                                                                                                          |
| 14  | `/use-cases/`                      | -                                         | none                                    | (None.) Survey page.                                                                                                                                                                           | None                                                                                                                                          |
| 15  | `/strategy/`                       | -                                         | none                                    | (None.)                                                                                                                                                                                        | None                                                                                                                                          |
| 16  | `/tooling/`                        | -                                         | none                                    | (None.) Vendor survey.                                                                                                                                                                         | None                                                                                                                                          |
| 17  | `/case-study/`                     | -                                         | none                                    | (None.)                                                                                                                                                                                        | None                                                                                                                                          |
| 18  | `/lab-kafka-debezium/`             | `#verify-sink`                            | Lab 1 (new), secondary link             | Reproduce the restart-and-replay result from the Docker lab without the Docker stack.                                                                                                          | New lab                                                                                                                                       |
| 19  | `/quickstarts/`                    | -                                         | none                                    | (None.) Setup instructions.                                                                                                                                                                    | None                                                                                                                                          |
| 20  | `/tests/`                          | -                                         | none                                    | (None.) Shell acceptance tests against a real stack.                                                                                                                                           | None                                                                                                                                          |
| 21  | `/troubleshooting/failure-drills/` | `#drill-4-title` (offset wipe and replay) | Lab 1 (new)                             | Predict the sink after the replay, then compare with the lab.                                                                                                                                  | New lab                                                                                                                                       |
| 21b | `/troubleshooting/failure-drills/` | `#drill-1-title` (backpressure)           | Drive-one-feed `backlog-recovery`       | As row 10 (backlog and lag).                                                                                                                                                                   | Partial                                                                                                                                       |
| 21c | `/troubleshooting/failure-drills/` | `#drill-3-title` (schema drift)           | `schema-evolution` + walkthrough        | As row 8.                                                                                                                                                                                      | Good (Read)                                                                                                                                   |
| 22  | `/cloud-labs/`                     | -                                         | none                                    | (None.) Vendor labs.                                                                                                                                                                           | None                                                                                                                                          |
| 23  | `/connector-builder/`              | -                                         | none                                    | (None.) Has its own tool.                                                                                                                                                                      | None                                                                                                                                          |
| 24  | `/dlq-triage/`                     | -                                         | none                                    | (None.) Has its own tool.                                                                                                                                                                      | None                                                                                                                                          |
| 25  | `/debezium-decoder/`               | -                                         | none                                    | (None.) Has its own tool.                                                                                                                                                                      | None                                                                                                                                          |
| 26  | `/errata/`                         | -                                         | none                                    | (None.) Corrections index.                                                                                                                                                                     | None                                                                                                                                          |

Counts (by lesson, 26 in total): 8 lessons get a link to an existing
scenario (`/intro/`, `/event-envelope/`, `/materialization/`,
`/exactly-once/`, `/schema-evolution/`, `/observability/`, `/security/`,
`/troubleshooting/failure-drills/`); 4 are served only by a new lab
(`/snapshotting/`, `/ops-offsets/`, `/partitioning/`, `/lab-kafka-debezium/`);
14 get no link. Of the 8, five are Good (intro, event-envelope,
materialization, schema-evolution, failure-drills drill 3) and three Partial
(exactly-once outbox, observability, security). There are no remaining
unverified pairings after the review corrections; the three that failed
review (snapshotting, reconciliation, observability lag) were downgraded or
dropped.

Also relevant but not in `series.mjs` (not assessed): `/merge-cookbook/`
("handling hard parts": replays after a crash; soft vs hard deletes) is the
natural place for Labs 1 and 3 as a second link.

## 5. Gaps

| Lesson claim readers get wrong                                      | Scenario that would be needed (event sequence -> expected observation)                                                                                                         | Covered by                     |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| Delivery is at-least-once, so the same change can arrive twice      | insert, update, update, then re-deliver the last two -> append sink has 5 rows for 3 changes; upsert ends right but shows the old value mid-replay; guarded sink skips 2       | Lab 1                          |
| Order by log position, not `ts_ms`                                  | two updates to one key with equal `ts_ms`, then a replay of the first with a later `ts_ms` -> a `ts_ms`-ordered sink ends on the wrong value; a position-ordered sink does not | Lab 2                          |
| A delete needs a marker, or a late older update brings the row back | insert, update, delete, then re-deliver the update -> physical-delete sink shows the row again; marker sink shows none and keeps a marker                                      | Lab 3                          |
| Watermark-based snapshot (`/snapshotting/#watermarks`)              | snapshot chunk read between a low and a high watermark with concurrent writes -> rows superseded in the window are dropped, the rest kept                                      | Later (not in the first three) |
| Exactly-once does not extend across systems                         | two hops, each at-least-once, with a crash between sink write and offset commit -> duplicate in the second hop unless the sink is idempotent                                   | Later; Lab 1 covers one hop    |
| Cassandra last-write-wins, MongoDB `updateLookup` newer state       | cell-level timestamps; event vs re-read state                                                                                                                                  | Later                          |
| Hard delete invisible to polling                                    | already covered by `crud-basic` (polling emits 1 of 3)                                                                                                                         | Exists                         |
| Backpressure / lag                                                  | `backlog-recovery` exists and shows backlog; its lag figure is always 0 (defect 6)                                                                                             | Partly exists                  |

## 6. The first three labs (Phase 12 style)

Each lab must hold the site thesis: delivery is **at-least-once**; correctness
comes from an **idempotent sink keyed on the primary key and ordered by log
position, not `ts_ms`**; deletes are kept as **markers**; end-to-end
exactly-once across systems is not achievable. All data is made up.

### 6.0 The shared building block (build once)

Today (Read) a scenario `op` is a _source_ operation, and the sink is an
unconditional merge. That cannot express "the source did not change but the
delivery repeated". Proposal, for the playground owner to accept or replace:

1. **A delivery-layer op** in the scenario format:
   `{ t: 400, op: "redeliver", ref: 1, ts_ms?: 340 }`, where `ref` is a
   0-based index into `ops` and the op means "the log lane delivers the record
   produced by `ops[ref]` again at time `t`", with its _original_ position and
   optionally a new `ts_ms`. Only the log lane honours it (polling has no log
   position; show "n/a" there). It touches the closed `SourceOp` union
   (`sim/core/types.ts`, `src/domain/types.ts`), `ScenarioRunner`, **and** the
   controller-backed engine wrapper and adapters the app actually uses
   (`web/App.tsx:674-740`, `createControllerEngineInstance` ->
   `adapter.applySource`), not only the sim engines.
2. **Preserve the original position through the bus.** A position already
   exists at the sink: `EventBus.publish` stamps a per-topic `offset`
   (`src/engine/eventBus.ts`) and `tx.lsn` is built from it
   (`web/App.tsx` ~654). But republishing a redelivered record would
   **re-stamp** that offset, making the replay look newest. The record needs an
   extra field (for example `sourcePosition`, copied from the WAL index and
   never overwritten) that the sink guard compares.
3. **A per-lane sink mode** in `InMemoryTableStorage.applyEvent`, selected by
   a small control: `upsert` (today's behaviour), `guarded` (apply only if
   `sourcePosition` is newer; skip and count otherwise) and `guarded+marker`
   (a delete stores a marker with its position instead of removing the row;
   readers see non-deleted rows). Two further modes exist **only as
   deliberate anti-patterns, labelled "naive" in the UI so no reader mistakes
   them for advice**: `append` (insert-only, one row per delivery) and
   `guarded-ts` (apply only if `ts_ms` is strictly newer).
4. A "skipped" counter and a "regressed" marker on the sink panel.

Zero-code fallback (data only): add scenarios that use the existing format.
This gives only the _unguarded_ half and conflates source and delivery (the
source adapter would also see the "replayed" op), so it is a stopgap, not a lab.

Alternative worth deciding first: build the same three labs as inline lesson
widgets like `src/assets/js/pages/cdc-event-demo.js`. That avoids the
playground's database contact on load (section 7), needs no coordination
under `playground/`, and the pages `/exactly-once/` and `/partitioning/`
already host inline demos. The cost is a second implementation of the sink
logic.

### Lab 1 — Replay: unguarded vs guarded sink

- **Outcome:** the reader sees that a consumer restart redelivers changes, and
  that a plain upsert is correct only at the end, while a position guard is
  correct throughout.
- **Scenario** `replay-guard` (difficulty beginner): table `orders`
  (`id` pk, `status`, `total`). Ops: `t100` insert `ORD-1` (`created`, 40),
  `t200` update (`paid`), `t300` update (`shipped`), `t400` redeliver `ref 1`,
  `t410` redeliver `ref 2` (`ref` is a 0-based index into `ops`: 1 is the `paid` update, 2 the `shipped` update; together a rewind to before the `paid` change).
- **Accept:** (a) `append` (anti-pattern, labelled as such): after `t410` the sink has 5 rows for 3 changes;
  (b) `upsert`: final row `shipped`, but the sink showed `paid` between
  `t400` and `t410` (regressed marker lit); (c) `guarded`: final row
  `shipped`, no regression, "skipped: 2"; (d) the polling lane shows "n/a".
- **Built how:** scenario object in `shared-scenarios.js` using the
  6.0 `redeliver` op and sink modes.
- **Links from:** `/exactly-once/#idempotency`, `/event-envelope/#delivery-title`,
  `/ops-offsets/#drills-title`, `/troubleshooting/failure-drills/#drill-4-title`,
  `/partitioning/#recon`, `/lab-kafka-debezium/#verify-sink` (secondary),
  `/merge-cookbook/` (secondary).

### Lab 2 — Which change is newer: `ts_ms` or log position?

- **Outcome:** the reader sees that equal or replay-stamped `ts_ms` values
  pick the wrong winner, and log position does not.
- **Scenario** `ts-vs-position` (intermediate): table `orders`. Ops: `t100`
  insert `ORD-7` (`created`), `t205` update (`paid`), `t205` update
  (`refunded`) (same millisecond, later log position), `t340` redeliver
  `ref 1` with `ts_ms: 340`.
- **Accept:** `guarded-ts` (anti-pattern, labelled as such; a strictly newer
  `ts_ms` is required) applies the first `205` write (`paid`),
  deterministically skips the second `205` write (`refunded`, not strictly
  newer), and then applies the replay stamped `340`: it ends on `paid`, which
  is wrong. `guarded` (position) ends on `refunded` and skips the replay. The
  Compare tab's "Ordering" metric must not be shown as the verdict here
  (finding 5a).
- **Open point:** the replay-with-a-later-`ts_ms` step rests on a sentence the
  site already makes, `src/snapshotting/index.njk:510` ("the envelope `ts_ms`
  is later on every replay"). I did **not** verify it against the Debezium
  documentation. Verify that sentence first (and mark it verified), or flag it
  as the claim to check; if it fails, keep only the same-millisecond tie.
- **Built how:** as Lab 1, plus `ts_ms` on the `redeliver` op and the
  `guarded-ts` mode.
- **Links from:** `/materialization/#merge-title` (step 2),
  `/materialization/#late-arrivals-title`, `/partitioning/#recon`,
  `/event-envelope/#ordering-title`.

### Lab 3 — Delete, then a late older update

- **Outcome:** the reader sees a deleted row come back, and sees a delete
  marker prevent it.
- **Scenario** `delete-then-late-update` (intermediate): table `orders`. Ops:
  `t100` insert `ORD-9` (`created`), `t200` update (`packed`), `t300` delete,
  `t400` redeliver `ref 1`.
- **Accept:** `upsert` + physical delete: one visible row (`packed`) after
  `t400` (resurrected); `guarded+marker`: zero visible rows, one marker with
  position 3, "skipped: 1". A note beside the control states the lesson's own
  caveat: physical removal is safe only when nothing can replay older events.
- **Built how:** as Lab 1, plus the `guarded+marker` mode.
- **Links from:** `/materialization/#merge-title` (step 4),
  `/snapshotting/#idempotent`, `/event-envelope/#ordering-title` (tombstone
  bullet), `/merge-cookbook/` ("soft deletes vs hard deletes").

Order of delivery: 6.0, Lab 1, Lab 3, Lab 2 (Lab 2 carries the open point).
Size: 6.0 is M (several files plus regenerated bundles); each lab after it is
S (one scenario object, one lesson link, one test).

## 7. Constraints

- **Shared server, 30 days.** The playground stores visitor-entered events and
  saved scenarios in a shared Supabase database and deletes them after 30 days
  (about 31 with the daily job); `/privacy/#playground` and the "Use made-up
  data only" notes in `playground/index.html` say so (Read).
- **What writes and what only reads (Read).** Writes go to `events` from the
  workspace Insert / Update / Delete / Emit snapshot / Autofill buttons
  (`publishEvent`) and to `scenarios` from Save / Share. **Loading a template,
  the Compare tab, the Drive-one-feed tab and the event-log Replay button
  write nothing** (the Compare/Drive code has no Supabase calls; telemetry has
  no network call). So a "try it" link should land on `#simulator` and the
  prompt should use only preloaded scenarios, never ask the reader to type
  data, and never point at "Save" or "Share".
- **Loading the page already contacts the database** (reachability probe and
  a realtime subscription) and loads Supabase from jsDelivr; the host sees the
  visitor's IP. `/privacy/` says this. Any lesson link should say it opens a
  separate tool that contacts a third-party database, and no link should be
  made automatic (no iframe, no prefetch).
- **Inbound stream (Inferred from `initBackend`).** The workspace appends
  other visitors' `events` to its own event log when they arrive. A learner who
  lands in the workspace, rather than the simulator, may see strangers'
  entries. Another reason to deep-link to `#simulator`.
- **Coordination.** Any `?try=`, `redeliver` op, sink mode or fix to findings
  4, 5, 6 and 7 is a change under `playground/` and needs the playground code
  owner first. `playground/docs/` wording is open to the conductor; code is
  not (plan decisions table).
- **Generated bundles.** `web/**` and `src/**` changes need the committed
  bundles in `playground/assets/generated/` rebuilt (CI guards it).
- **The playground is a separate site in tone.** Its README, docs and copy
  used to teach "dedupe on PK" as the answer while the lessons teach version
  guards on log position. Slice B removed that copy (finding 4); finding 5
  (a), (c) were fixed in #384, (b) and (d) remain.

## 8. Playground defects (to become plan items)

In priority order. All are Read unless stated. Items 1 (a, c), 3 and 6 were
fixed in #384 and items 2, 4, 5 (documented) and 7 in slice B (#393); the
notes below say which.

1. **Timestamp-first ordering** (thesis conflict): the Compare `orderingOk`
   metric (`web/App.tsx:961-965`) and the Drive-one-feed apply-on-commit sort
   by `commitTs` then `lsn` (`src/changefeed/model.ts:216-217`) teach the
   opposite of "order by log position". The sinks are also unconditional
   upserts, and a delete removes the row with no marker
   (`src/domain/storage.ts:148-163`).
2. **Documented controls that do not exist**: "Dedupe on PK" and "Drop
   snapshot rows" (README, `playground/docs/*`, the `highlight` text at
   `shared-scenarios.js:523` and `:603`, the generated bundles, the tests).
   **Fixed in slice B** by removing the copy (no control was built).
3. **`fault-injection` drops nothing, and `broker.dropped` is never
   incremented** (`model.ts:256`, the `continue` in `pollBroker`): the demo's
   button resets first and only reaches `lsn` 1-6, while the first dropped
   `lsn` at 20% is 22. Fixing the counter alone changes nothing.
4. **`snapshot-replay` models a duplicate-key insert as a new write**
   (`shared-scenarios.js:546-551`), so it cannot show a stale or replayed row
   losing. **Relabelled in slice B** as "Re-insert after Update" (id kept); a
   `redeliver` op is still the proposed lab work.
5. **Seed rows are not loaded into the Compare lanes** (`web/App.tsx:716`,
   `startSnapshot([])`), so deletes and updates of seed-only rows emit events
   with no prior state (a keyless delete for `LED-101`). 9 of 11 scenarios had
   a `rows` entry that duplicated an `insert` op's key, so loading `rows` would
   be a duplicate-key insert. **Fixed in P16-27:** `ops` is the single source
   of truth; the 9 duplicate `rows` entries were removed (a unit test fails on
   any that comes back) and `rows` now holds only rows `ops` never inserts
   (`retention-erasure`, `snapshot-to-stream`, `LED-101`). Loading those into
   the lanes (a `seed` field plus per-adapter snapshot handling) is still its
   own piece of work.
6. **`backlog-recovery` lag is always 0**: its 12 events share `commitTs` 100.
7. **Orphans**: `playground/src/data/scenarios.json` and the stale
   passthrough at `playground/.eleventy.js:3`. **Fixed in slice B:** both
   deleted, plus the unreferenced `assets/generated/ui-index.js` (a stale
   bundle that still carried the phantom-control copy).

## 9. Questions for the playground owner

1. Accept `?try=<scenario-id>` (tab + scenario only), or prefer another form?
2. Accept the 6.0 primitive (`redeliver` op, `position` on events, sink modes),
   or should the three labs be inline lesson widgets instead?
3. Fix, remove or implement the "Drop snapshot rows" / "Dedupe on PK" claims
   (finding 4, defect 2)? **Answered in slice B:** removed.
4. Is the `ts_ms`-based `orderingOk` and `commitTs`-first apply order intended
   (finding 5)? The lessons say position, not timestamp. **Answered in
   #384:** position.
5. Increment `broker.dropped` when `shouldDrop` fires (finding 6)? **Done in
   #384.**
6. Should seed rows be loaded into the Compare lanes (finding 7)? **Slice B:
   not yet; documented** (see defect 5).

## 10. Evidence and how to re-run

- Scenario facts: `playground/assets/shared-scenarios.js` (11 entries).
- Replay table in 3.1: the playground adapters and `InMemoryTableStorage`
  bundled with esbuild and run in Node 24 over each scenario's `ops`, ticking
  10 ms to 4 s, config as in the method note above. The script lives in a
  session scratch directory, not in the repo. A durable version would be a
  Vitest case beside `playground/src/test/unit/scenarios.test.ts`, which is a
  change under `playground/` and therefore for the owner.
- Anchors: `id="..."` in `src/<lesson>/index.njk` at `48a4ddb`; not checked in
  a built `_site/`.
