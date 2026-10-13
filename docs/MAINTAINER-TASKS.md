# Maintainer tasks

Everything in this guide needs the maintainer: a login to an account the agent
team does not hold, a settings change only an admin can make, a decision, or a
step outside the repository. The agent team cannot do these and should not try.

Written 2026-10-09 against `origin/main` at `8e748fc`, and brought up to date on
2026-10-11 (P17-59), after the handoff kit merged. Where a claim could not be
checked from the repository, the task says **unverified**.

## Who merges what

Agents merge only through `scripts/merge-pr.mjs` (the charter's Tier 2, in
[`CONDUCTOR.md`](CONDUCTOR.md)). The script refuses a PR that is red, in conflict
or has changes requested; since 2026-10-13 a missing review record or a
maintainer-only path is a `WARN`, and only `--strict` refuses it. PRs on the
maintainer-only paths (`.github/**`, `.claude/**`
except `.claude/commands/` and `.claude/scripts/`, `CLAUDE.md`, the charter
documents, `docs/DECISIONS.md`, the playground's manifest and lockfile,
`supabase/**`, licence files) are prepared by the team and merged by you. Task 1
is that merge. Since 2026-10-12 the root `package.json` and `package-lock.json`
are off that list, a Dependabot patch or minor bump of them is merged without a
review record, and you can tell the conductor in chat to merge a restricted PR
(it records your words with `--maintainer-approved`; see
[`CONDUCTOR.md`](CONDUCTOR.md#merge-script-exceptions)). Settings, accounts,
secrets and decisions stay yours (Tier 3).

## How to use this guide

- Work top to bottom. The table gives the time, the date and what each task
  needs. Order matters where one task depends on another.
- Tick the `[ ]` in the table as you finish each task. Your copy is yours to
  tick. The agent team does not edit it directly: it prepares edits to this file
  as PRs that you merge (it is not on the merge gate's list, but it is your guide).
- The intended way to use it is a live session with an AI assistant in this
  repository. Ask the assistant to walk you through a task. It can run the `gh`
  and `npm` commands, read files and draft text. You do the clicks, the logins
  and the decisions. Ask it to show the exact command or click path before
  anything changes a setting.
- Only two items have fixed dates: the domain name (a target of 2026-10-23,
  recorded in `docs/DECISIONS.md` and `docs/TEAM-CHARTER.md`) and the snapshot
  (2026-11-06, from P16-12).

## The list

| #   | Task                                                                              | Why                                                                      | Time                            | When                                 | Needs                                   |
| --- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------- | ------------------------------------ | --------------------------------------- |
| 1   | [ ] Merge the restricted-path PRs the team prepares (now: P17-59)                 | The merge script refuses these paths, so only you can merge them         | 5 min each                      | Now, first                           | Merge rights; the open PR               |
| 2   | [x] Require CI checks on the `default` ruleset (P17-3)                            | Done 2026-10-13: seven checks required                                   | 10 min                          | Today, before the next merge batch   | Repository admin                        |
| 3   | [ ] Repository settings: description, topics, social preview, alerts, Discussions | Discoverability, security alerts, community threads                      | 15 min                          | This week                            | Repository admin                        |
| 4   | [ ] File the upstream Debezium docs issue (P15-39)                                | Debezium's docs name a setting PostgreSQL does not present as a slot cap | 10 min                          | When you are ready; the draft exists | A GitHub account                        |
| 5   | [ ] Confirm nothing runs `.codacy/cli.sh`, then remove it (P15-52)                | Removes a launcher that nothing is known to use                          | 5 min                           | This week                            | Codacy dashboard access                 |
| 6   | [ ] Choose the domain name and move the site (P15-13)                             | Canonicals, sitemap and search listings all follow the host              | Not estimated                   | Decide by 2026-10-23                 | Registrar, DNS, repository admin        |
| 7   | [ ] GoatCounter: keep the dashboard private, or change the privacy page first     | `/privacy/` says the maintainer reads the totals                         | 5 min                           | Before 2026-11-06                    | GoatCounter login                       |
| 8   | [ ] Supabase: run the three queries and paste the output                          | Feedback counts and retention jobs (P16-25)                              | 10 min                          | Before 2026-11-06; again at 30 rows  | Supabase dashboard with SQL access      |
| 9   | [ ] Snapshot day: Search Console and GoatCounter exports (P16-12, P16-25)         | The first dated baseline                                                 | 20 min                          | 2026-11-06                           | Search Console owner; GoatCounter login |
| 10  | [x] Answer the three charter questions (answered 2026-10-11)                      | The charter needs these answers                                          | Done                            | Done                                 | Recorded in `docs/DECISIONS.md`         |
| 11  | [ ] Weekly: read the digest and write one outward post                            | Keeps the team's view current and the site visible                       | About 15 min, plus about 1 hour | Weekly                               | A GitHub login to read the digest issue |
| 12  | [ ] Docker for the labs (P15-37, P15-46)                                          | Labs are not run in CI and pin older versions than the pages             | Not estimated                   | When you choose who runs them        | Someone with Docker, or a decision      |

## The tasks

### 1. Merge the restricted-path PRs the team prepares (now: P17-59)

**Why.** The merge script flags any PR that touches a maintainer-only path
(`scripts/merge-pr.mjs`, and the list in `docs/CONDUCTOR.md`): a `WARN` by
default, a refusal under `--strict`. The team prepares such PRs and stops. You read them and merge them. The post-merge sweep (P17-59,
shipped in the sweep PR) is one such PR; it edits `docs/CONDUCTOR.md`,
`docs/TEAM-CHARTER.md`, `docs/DECISIONS.md` and `.claude/rules/`.

**Steps**

1. Run `gh pr list --state open` and find the PR by its title.
2. Read the PR description and the **Files changed** tab. Check that the
   restricted paths changed are the ones the description says.
3. Check CI with `gh pr checks <number>` or the Checks tab. The ruleset blocks a
   red required check (task 2, done 2026-10-13); `lychee` and `lighthouse` are
   not required, so read those yourself.
4. On the PR page, choose **Squash and merge**, then confirm. Squash is the
   pattern on `main`: commit subjects end in `(#NNN)`.
5. Run `git switch main && git pull`.

**Done when:** the PR is on `main`. Repeat for any later restricted-path PR.

### 2. Require CI checks on the `default` ruleset (P17-3)

**Why.** The `default` ruleset (ID `16512225`) has the rules `deletion`,
`non_fast_forward`, `code_scanning`, `code_quality` and `pull_request`. Before
2026-10-13 it had no required status checks, so a red CI run did not block a
merge. Done 2026-10-13: it now requires the seven checks below, with "up to
date" off (`strict_required_status_checks_policy: false`); `lychee` and
`lighthouse` are deliberately not required. Four `unit-tests`
runs on `main` failed on 2026-10-09 (`docs/AUTOPSY-BRIEF.md` section 7). The merge
script checks the gate for agents; this makes GitHub enforce it for everyone.

**Steps**

1. Repository **Settings → Rules → Rulesets** → `default` → **Edit**.
2. **Add rule** → **Require status checks to pass**.
3. Add exactly these seven check names. They are job IDs from
   `.github/workflows/ci.yml`, which sets no `name:` on any job:
   - `build`
   - `lint`
   - `unit-tests`
   - `e2e-tests`
   - `a11y-tests`
   - `smoke-tests`
   - `security-audit`
4. **Require branches to be up to date before merging** is optional and off by
   default. Turning it on forces an **Update branch** and a full re-run after every
   other merge, which is slow when several PRs are queued.
5. Leave the **bypass list empty**.
6. Save changes.

**Do not require**

- `lychee` (the job in `.github/workflows/linkcheck.yml`). It checks external
  links, and a third-party 503 would block an unrelated PR. It stays a signal you
  read, not a gate.
- `lighthouse`. The runner can lose LCP or FCP (`NO_LCP`, `NO_FCP`; run
  37898380673), so a correct PR could be blocked by a flaky measurement.
- The `preflight` job (`.github/workflows/playground-preflight.yml`) and the
  `generated-bundle-check` job (`.github/workflows/playground-generated-bundles.yml`).
  Both run only when `playground/**` changes, so on any other PR they never report
  and the PR waits forever.

**Watch out**

- The check picker offers only names that have reported recently. If a name is
  missing, let one PR run first.
- The ruleset already has a CodeQL `code_scanning` rule. A PR can show
  **BLOCKED** with "code scanning cannot determine alerts". The rule is waiting
  for CodeQL's result on the PR head. Click **Update branch** on the PR and let the
  checks run again.
- Once a check is required, a PR on which it never runs is blocked. After
  saving, open an existing PR and confirm it can still merge.

**Verify.**

1. `gh api repos/sandgraal/letstalkcdc/rulesets/16512225` shows a
   `required_status_checks` rule with the seven names. Reading the ruleset needs
   only read access.
2. Open a throwaway PR from a new branch with one deliberately failing unit test.
   When `unit-tests` goes red, confirm the merge button is blocked. Close the PR
   without merging and delete the branch.

**Done when:** both checks above pass, and `docs/DECISIONS.md` records the
"up to date" choice (P17-3).

### 3. Repository settings: description, topics, social preview, alerts, Discussions

**Why.** Discoverability, security alerts and a place for readers to talk. The
current state of the Dependabot security-update toggle is **unverified** from
the repository.

**Steps**

1. **About** (the gear icon on the repository home page):
   - **Description**: the site's own description from `src/_data/site.mjs`,
     "Learn why Change Data Capture (CDC) projects fail and how to build
     scalable, reliable, and production-ready data pipelines.", or your own.
   - **Website**: `https://sandgraal.github.io/letstalkcdc/` (update after
     task 6).
   - **Topics**: `change-data-capture`, `cdc`, `debezium`, `kafka`,
     `data-engineering`, `postgres`, `eleventy`, `education`.
2. **Settings → General → Social preview → Edit → Upload an image**: choose
   `src/static/images/cdc-cover.jpg`. It is 1200 × 630 (checked 2026-10-09 with
   `sips`). Read "Open decisions" first: the cover's licence is not settled.
3. **Settings → Code security** (on some layouts, "Security & analysis"): check
   that **Dependabot alerts** and **Dependabot security updates** are on, and turn
   them on if not. The configuration file `.github/dependabot.yml` is already in
   the repository (added in #430: grouped weekly updates, one PR per major
   version), so nothing to add there. Expect Dependabot pull requests.
   Also, two leftover repository variables from the retired Copilot setup,
   `COPILOT_AGENT_FIREWALL_ENABLED` and
   `COPILOT_AGENT_FIREWALL_ALLOW_LIST_ADDITIONS`, can be deleted under
   **Settings → Secrets and variables → Actions → Variables**; nothing reads
   them.
4. **Settings → General → Features**: tick **Discussions**, then **Set up
   discussions**.
   - Categories: `docs/DISCUSSIONS_SEED.md` expects Show and Tell, a debugging
     category (a name containing "debug" or "war"), General and Q&A.
     `docs/COMMUNITY.md` also recommends Announcements and Use Cases.
   - Starter threads: run `export GITHUB_TOKEN="$(gh auth token)"`, then
     `npm run seed:discussions`. The script skips threads that already exist. It
     creates four pinned threads under the token owner's account. If it reports
     a permissions error, follow `docs/DISCUSSIONS_SEED.md` section 3 to create a
     token with the listed scopes. Do not paste a token into a command line or a
     chat.

**Done when:** About shows the description and topics; the social preview is the
cover; both Dependabot toggles are on; Discussions has its categories and the
starter threads.

### 4. File the upstream Debezium docs issue (P15-39)

**Why.** The Debezium PostgreSQL connector docs say `wal_keep_size` can "limit
the maximum WAL size of a replication slot". PostgreSQL documents
`max_slot_wal_keep_size` for that job. The site's `/postgres-replication-slots/`
page carries a note on the disagreement. You decided to file it. An agent drafts
the issue; you file it.

**Steps**

1. Open `docs/upstream-issue-wal-keep-size.md` and work through "Before filing":
   - Search for existing reports with
     `gh issue list -R debezium/dbz --search "wal_keep_size" --state all`, and
     search the DBZ Jira project by hand.
   - Open the PostgreSQL 18 replication configuration page and check that the
     quoted phrases match exactly.
   - Find the sentence in `documentation/modules/ROOT/pages/connectors/postgresql.adoc`
     in the Debezium repository. Quote the sentence, not the line number.
2. Open <https://github.com/debezium/dbz/issues>, choose **New issue**, and paste
   the title from the draft's "Title" section and the body from "Body" through
   "Sources". Leave out "Before filing" and the notes at the top of the draft.
3. The draft has an optional paragraph on lost slots. Keep it or drop it.
4. Submit. The issue is posted under your account.
5. Give the issue URL to the assistant. It records the URL on P15-39 and ticks the
   box in the same commit.

**Done when:** the issue URL is on P15-39 and the box is ticked.

### 5. Confirm nothing runs `.codacy/cli.sh`, then remove it (P15-52)

**Why.** `.codacy/cli.sh` sits beside `.codacy/codacy.yaml`. No file in this
repository calls it (`grep -rn "cli.sh" .github scripts package.json` prints
nothing at `8e748fc`). That does not prove that Codacy never runs it.

**Steps**

1. Open the Codacy dashboard for this repository. Check whether the repository is
   still connected, and whether any analysis or CLI run is set up for it. Note
   what you saw. Do not copy a token or key into the repository.
2. If nothing runs the launcher, tell the assistant. It removes
   `.codacy/cli.sh` in a pull request and runs the build check. You merge the PR.
3. If something does run it, stop. Whether to disable the integration or keep the
   file is your decision.
4. Nothing to decide about the Codacy agent instruction file: it was retired in
   #432. Only the dashboard check for `.codacy/cli.sh` remains for you.

**Done when:** the dashboard check is recorded on P15-52, and the file is removed
or the decision to keep it is recorded.

### 6. Choose the domain name and move the site (P15-13)

**Why.** The host is written down once, in `lib/site-host.mjs`. Canonicals, the
sitemap, Search Console and every `sandgraal.github.io` link follow it.
`docs/DOMAIN-MIGRATION.md` describes the move as a variable change once the
checklist is worked through.

**Timing.** The target is **2026-10-23** (`docs/DECISIONS.md`, "Hosting").
`docs/AUTOPSY-BRIEF.md` section 9 advises deciding before search history builds on the current host. The 28-day
snapshot (task 9) is measured on whichever host is live on 2026-11-06, and P16-12
says to re-verify after a move. Choose the order on purpose.

**Steps**

1. Decide the name and buy it from a registrar of your choice. The repository
   names none.
2. Tell the assistant the name and the shape. It drafts the PR for
   `lib/site-host.mjs` and the hand-edited references. It does not touch DNS or
   settings.
3. Follow `docs/DOMAIN-MIGRATION.md` in order:
   - Section 1: choose the shape (apex domain, subdomain or sub-directory).
   - Section 2: the path prefix must be `/`. A blank value means `/letstalkcdc/`,
     not the root.
   - Section 3: DNS records from GitHub's current custom-domain documentation. Do
     not use wildcard records.
   - Section 4: **Settings → Pages → Custom domain**, then **Enforce HTTPS** when
     it appears.
   - Section 5: **Settings → Secrets and variables → Actions → Variables**. Set
     `SITE_HOST` and `ELEVENTY_PATH_PREFIX` (to `/`), then run **Deploy site to
     GitHub Pages** from the Actions tab. Do sections 4 and 5 back to back.
4. After the deploy, work through "Checks afterwards" in the runbook. Run
   `curl -sI https://sandgraal.github.io/letstalkcdc/intro/` to see what the old
   URL does now.
5. Walk the "Hand-edited references checklist" with the assistant.
6. Search Console: add the new domain as a property and submit its sitemap. The
   runbook says "Change of address" probably does not apply to a path on
   `github.io`.
7. Supabase: check the project's URL configuration for the old origin.

**Done when:** the new domain serves the site over HTTPS, the checklist is ticked,
and P15-13 records the new host.

### 7. GoatCounter: keep the dashboard private, or change the privacy page first

**Why.** Letting the team read the totals without a login is tempting, but
`docs/SETUP.md` (GoatCounter, step 2) keeps the dashboard private because the
privacy page says the maintainer reads the totals. Public stats, or a shared
login, would need that wording changed first.

**Steps**

1. In GoatCounter's site settings, confirm **Collect individual pageviews** is
   off (`docs/SETUP.md`, step 2).
2. Choose one:
   - **Default, private:** the team gets a CSV on snapshot day (task 9). No repo
     change.
   - **Public or shared:** first change `/privacy/` and `docs/SETUP.md` in a PR
     that the assistant drafts, and merge it. Do not switch the dashboard to
     public on its own.
3. Test an export now. Look for an export option in the site settings; labels may
   differ from the docs. A test now means the snapshot is not the first try.

**Done when:** the choice is recorded and a test export has worked.

### 8. Supabase: run the three queries

**Why.** The browser key cannot read rows, so the repository cannot show live
feedback. P16-25 waits for 30 rows; the project's notes said 2 on 2026-10-09,
and that figure was not re-queried. The third query checks that the retention
jobs exist.

**Steps**

1. Open the Supabase dashboard for the project and its SQL editor. A role that
   can run SQL is enough; read-only is sufficient. The retention-jobs query also
   needs `pg_cron` access; if it errors, say so rather than skipping it.
2. Copy the three queries from `docs/AUTOPSY-BRIEF.md` section 5, "Reading the
   data":
   - **Feedback totals** on `public.assistant_feedback`.
   - **Questions to group**: the query filtered on `helpful = false or intent_id
is null`.
   - **Retention jobs**: `select jobname, schedule, active from cron.job order by jobname`. Expect
     `assistant-feedback-retention`, `playground-events-retention` and
     `playground-scenarios-retention`. If the list differs, the live database has
     drifted from `supabase/schema.sql`, which CI never applies.
3. Paste the totals and the job list into the session. Question text is typed by
   visitors. Give the assistant only what it needs to group the questions, and
   keep the text out of issues, PRs and the repository. Do not paste any key,
   password or connection string.
4. Team read access is a separate choice. `/privacy/` says the site's maintainer
   reads the records in the Supabase dashboard, and `docs/SETUP.md` says reading
   feedback is maintainer-only. Giving anyone else read access needs that wording
   changed first, as in task 7.

**Done when:** the totals and the job list are recorded on P16-25 or in the
snapshot note, and any drift is noted.

### 9. Snapshot day (2026-11-06): exports for P16-12 and P16-25

**Why.** P16-12 asks for a dated first snapshot of impressions, clicks and indexed
pages, 28 days after GoatCounter and Search Console began counting.

**Steps**

1. **Search Console** (the maintainer reports the property verified and the
   sitemap submitted, 2026-10-09). Open **Performance**. Set the date range to the
   28 days ending on the snapshot date; the assistant can give the exact dates.
   Search Console data can lag by a few days, so note the end date you used.
   - **Pages** tab: export.
   - **Queries** tab: export.
     Labels change. If you cannot find an export control, ask the assistant.
2. **Search Console → Indexing → Pages**: record the indexed count and the reasons
   for pages that are not indexed. Compare with the sitemap's URL count (57 live
   at 2026-10-09).
3. **GoatCounter**: export, as in task 7.
4. **Lighthouse for the ten key pages** (P16-12). The repository's runner,
   `npm run lighthouse`, audits five URLs, and the ten-page list is not written
   in the repository. Agree the list with the assistant first; the P13-5 recipe
   is the method.
5. Give the exports to the assistant. Keep the files out of the repository, since
   they contain search queries. The assistant writes the dated snapshot into P16-12
   and ticks the box only when the Lighthouse part is also done.

**Done when:** P16-12 has a dated snapshot and the ten-page Lighthouse record.
P16-25 stays open until the feedback threshold is met.

### 10. Answer the three charter questions (ANSWERED 2026-10-11)

**Answered.** The three questions were answered on 2026-10-11 and are recorded in
`docs/DECISIONS.md`. Nothing is left for you here except the follow-up in the
third answer.

1. **Stronger model for the escalation role:** none. The `sme-reviewer` role stays
   disabled. Fact-checking is the `technical-editor` role plus your own reading.
2. **Public contact for `security.txt`:** the address is recorded in
   `docs/DECISIONS.md`. P17-29 can now build `security.txt` and the contact page.
   The file can sit only under `/letstalkcdc/` until the domain move (task 6),
   because this project site does not own the host root.
3. **Vendor-disclosure policy:** decided; see `docs/DECISIONS.md`. The wording that
   goes on the About page and on the vendor's lab page is drafted for your approval
   before anything is published (P17-30). No vendor-comparison content until it is
   published. Check at that point whether the `/methodology/` sentence "no vendor
   sponsorship" still reads true next to the disclosure.

**Done when:** you have approved the disclosure wording (P17-30).

### 11. Weekly: the digest and one outward post

**Why.** Keeps the team's view current and the site visible.

**Digest (about 15 min).** The conductor produces the digest with the
`weekly-digest` skill (`.claude/skills/weekly-digest/SKILL.md`) and posts it as a
GitHub issue titled `Weekly digest YYYY-MM-DD`. Find it with
`gh issue list --search "Weekly digest"`. It lists merged PRs, open PRs, CI
health, the pages that need your human read, and the decisions that are due. It
is a public issue, so it holds aggregates only and never quotes visitor text. This
is not the retired handoff system; the digest is a status report, and the record
stays in the plan, the changelog and `git log`.

**Outward post (about 1 hour).** Pick a channel you already use. The repository
names none. `docs/COMMUNITY.md` covers the Discussions setup, moderation and the
"Metrics to Track" list. Link to one page, say what changed, and say what a
reader can do next.

**Done when:** you have read the digest and posted once this week, or noted why
not.

### 12. Docker for the labs (P15-37, P15-46)

**Why.** The labs (`compose.yaml`, `playground/harness/docker-compose.yml`, the
quickstarts and the lab pages) are not run in CI. `src/_data/toolVersions.mjs` shows the labs
pinning Debezium 2.7.4.Final and Confluent Platform 7.7.0, and P15-46 says the
pages teach 3.x. P15-37 says the
playground images use `node:20-alpine`.

**When.** The brief mentions a planned `labs-verify` workflow that would remove
the need for this task. Nothing in the repository refers to it, so this task
applies until it exists.

**Steps**

1. Decide between two options:
   - (a) Someone with Docker re-runs each lab against current versions. P15-46 is
     Size L and P15-37 is Size S, as the plan sizes them.
   - (b) Add "check your version" notes and leave the labs on 2.7
     (`docs/AUTOPSY-BRIEF.md` section 9, decision 5).
2. For (a), on a machine with Docker and a fresh clone, run `docker compose up -d`
   and `docker compose ps` as in `docs/SANDBOX.md`. Record the lab, the versions it
   ran and pass or fail, and give that to the assistant.

**Done when:** the decision is recorded and, for option (a), one run per lab is
noted on P15-46.

## Open decisions that are not tasks yet

These come from `docs/AUTOPSY-BRIEF.md` section 9 and section 8, and from the
repository itself. Each needs your answer before work on it starts.

- **Cover image licence.** `src/static/images/cdc-cover.jpg` is the only
  `og:image`. The brief reports, unconfirmed, that it is AI-generated and the
  maintainer's own. `LICENSE-CONTENT.md` puts `src/static/images/**` under CC BY
  4.0. Confirm the facts and decide whether the cover is carved out. Settle this
  before you upload it in task 3.
- **Playground owner.** `.github/CODEOWNERS` is `* @sandgraal`. No playground owner
  is recorded.
- **Second content reviewer.** Name a second human reviewer and say where review
  texts are kept. P15-48 records that the review text for PR #376 could not be
  retrieved.
- **Third-party scripts.** Mermaid and Chart.js are self-hosted with
  Subresource Integrity (P17-23). Only the Change Feed Playground's Supabase
  library still loads from `cdn.jsdelivr.net`; vendor it or accept the CDN
  dependency there.
- **Codacy instruction file.** Settled: the retired Codacy instruction file was
  removed in #432, so there is nothing to decide. What remains is the dashboard
  check for `.codacy/cli.sh` in task 5.

## What the team will never do without you

- **Repository variables and secrets** (Settings → Secrets and variables →
  Actions). On 2026-10-09 the variables the site uses were `SUPABASE_URL`,
  `SUPABASE_PUBLISHABLE_KEY`, `BUTTONDOWN_USERNAME` and `GOATCOUNTER_CODE`,
  plus two leftover Copilot variables (`COPILOT_AGENT_FIREWALL_*`);
  `SITE_HOST` and `ELEVENTY_PATH_PREFIX` were not set (task 6 sets them). The Fortify workflow reads `FOD_*` and
  `SSC_*` secrets, which may not be set (**unverified**). Values never go in the
  repository or in a chat.
- **Accounts and logins**: GoatCounter, Buttondown, Supabase, Search Console,
  Codacy, the domain registrar, and any new service. That includes inviting anyone
  to any of them.
- **GitHub settings**: rulesets, branch protection, Pages source and custom domain,
  Actions settings, Discussions, Dependabot, and collaborators.
- **Database changes**: applying `supabase/schema.sql`, or any migration, to the
  live Supabase project. The team can write the SQL; you run it. The same goes for
  any change to grants or policies.
- **The domain**: the name, the purchase, DNS and the Pages custom domain.
- **Anything on the maintainer-only path list** of `scripts/merge-pr.mjs`. The
  script flags those PRs (it refuses them under `--strict`); the team prepares them
  and you merge them (task 1).
- **Merging outside the gate.** The team merges only through
  `scripts/merge-pr.mjs`, and only when it is confident. When it is not, it stops
  and asks you in the chat.
- **Force-pushes and history rewrites** on `main`. The ruleset blocks
  non-fast-forward pushes.
- **Outward statements under your name**: upstream issues, public posts, vendor
  comparisons, and any change to privacy wording.
- **Phase 14 items** in `docs/IMPLEMENTATION-PLAN.md`. Phase 14 is the maintainer's
  decision register; the team does not start those items.
- **Facts only you can confirm**: the cover image's origin, the first real
  assistant vote, and the Search Console verification and sitemap submission.
  The repository cannot check these.

## How to start a live session

Open an AI assistant in this repository and say:

> Walk me through docs/MAINTAINER-TASKS.md starting at task N

Replace N with the first task you have not ticked. Tell the assistant what you have
already done. It should check each task's "Done when" line before it moves on.
