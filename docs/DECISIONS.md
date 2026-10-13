# Decisions log

Maintainer decisions for Let's Talk CDC, recorded 2026-10-09 and, where
noted, 2026-10-11 and 2026-10-12. One short entry each: what was decided, why in one line, and where it stands. This
file is public; it records decisions, not motives beyond what is stated.

Basis values: **Decided** means the maintainer stated it. **Default** means
the assistant proposed it and the maintainer accepted the proposals
wholesale on 2026-10-09 ("go"); it was not separately stated.

Status values: **Decided** (in force), **In progress**, **Not started**,
**Pending** (waiting on an input listed at the end).

---

## Purpose

- **Decision:** The site aims to be the best free learning resource on CDC.
- **Why:** A free, accurate resource earns trust; trust is the point.
- **Basis:** Decided.
- **Status:** Decided.

## Audience

- **Decision:** All levels: newcomers, operators of pipelines, and
  architects.
- **Why:** CDC knowledge gaps exist at every stage, and one path per role
  serves them without splitting the site.
- **Basis:** Decided.
- **Status:** Decided.

## Success floor (6-12 months)

- **Decision:** 100 visitors a month and 5 GitHub stars. Leading
  indicators are tracked from a 28-day baseline (first snapshot due
  2026-11-06): indexed pages, search impressions, newsletter signups,
  assistant feedback rows.
- **Why:** A modest floor that is measurable and honest; leading indicators
  show movement before visitor counts do.
- **Basis:** Decided (the floor numbers). Default (the leading indicators and the baseline date).
- **Status:** Decided; baseline snapshot due 2026-11-06.

## Spend

- **Decision:** No recurring cost. Free tiers only. No paid APIs.
- **Why:** The project must be able to run indefinitely at no recurring
  cost.
- **Basis:** Decided.
- **Status:** Decided.

## Brand

- **Decision:** "Let's Talk CDC" is the primary name. "CDC: The Missing
  Manual" is retained until a rename PR. "Missing Manual" is the name of an
  existing book series, so verify trademark before any book, PDF or new use.
- **Why:** Avoid building on a name that may belong to someone else.
- **Basis:** Decided (the primary name). Default (keeping the old name until a rename PR, and the trademark check).
- **Status:** Rename not started.

## Voice

- **Decision:** First-person practitioner voice is fine for experience
  stated in general terms. No named employers or clients. Illustrative
  scenarios are labelled illustrative.
- **Why:** Readers should be able to tell experience from example, and no
  third party should be identifiable.
- **Basis:** Decided.
- **Status:** Decided.

## Provenance

- **Decision:** Pages are drafted with AI assistance and say so. A page may
  say "reviewed by <maintainer>" only after the maintainer confirms; until
  then it is labelled AI-assisted only.
- **Why:** A review claim must be true when it is made.
- **Basis:** Default.
- **Status:** Decided.

## Content direction

- **Decision:** Modules for backfills, testing, replication slots, outbox,
  contracts, SQL Server/MySQL, and non-Kafka paths are done. Next
  candidates: lakehouse table formats, CDC for AI (keeping vector stores
  and RAG indexes fresh), schema contracts, cost modelling, Flink CDC.
  Vendor-comparison content waits for the disclosure policy.
- **Why:** Cover the remaining gaps in order of reader value; comparisons
  need disclosure rules first.
- **Basis:** Default.
- **Status:** Decided; vendor comparisons Pending (disclosure policy).

## Format

- **Decision:** A guided learning path (newcomer, operator, architect
  tracks) first. Then a 5-page "answer page" pilot, measured for 8 weeks
  before scaling.
- **Why:** Structure helps readers now; the pilot tests whether answer
  pages earn their upkeep before more are written.
- **Basis:** Default.
- **Status:** Decided; not started.

## AI crawlers and licensing

- **Decision:** AI crawlers are allowed. Publish llms.txt and a Markdown
  copy per page. CC BY 4.0 attribution is required.
- **Why:** The goal is reach; attribution keeps the source visible.
- **Basis:** Decided.
- **Status:** Decided.

## Assistant

- **Decision:** Retrieval-only (find the right page; no generated answers)
  while there is no budget. A weekly gap report from `assistant_feedback`
  is read by the maintainer.
- **Why:** Generated answers need paid APIs; feedback rows show where
  content is missing.
- **Basis:** Decided (retrieval-only). Default (the weekly gap report).
- **Status:** Decided.

## Backend

- **Decision:** Allowed where it earns its keep, free tier only.
- **Why:** Static-first stays the default; a service must justify itself
  and fit the spend rule.
- **Basis:** Decided.
- **Status:** Decided.

## Hosting

- **Decision:** GitHub Pages until the domain is chosen (decision due
  2026-10-23), then Cloudflare Pages, verifying free-tier terms immediately
  before cut-over.
- **Why:** No recurring cost, and terms change, so check at the moment of
  the move.
- **Basis:** Default (the 2026-10-23 date; the maintainer said to revisit in a couple of weeks).
- **Status:** Pending (domain name; decision due 2026-10-23).

## Spanish

- **Decision:** Pilot (intro, learning path, glossary) after content
  stabilises, with a drift check against the English.
- **Why:** Translating moving content creates stale copies; the drift check
  catches them.
- **Basis:** Decided (Spanish is wanted if it is not too much work). Default (the pilot scope and the drift check).
- **Status:** Decided; not started.

## PDF/EPUB and offline/PWA

- **Decision:** Later. Not named "Missing Manual".
- **Why:** Lower priority than content, and the name needs trademark
  verification first.
- **Basis:** Decided (yes to both). Default (the timing and the naming).
- **Status:** Deferred.

## Quality

- **Decision:** WCAG 2.2 AA, stated in a public accessibility statement.
  Performance work may lazy-load or remove heavy features. Self-host
  Mermaid and Chart.js with SRI and a CSP.
- **Why:** Accessibility is a stated commitment; third-party CDNs add risk
  and weight.
- **Basis:** Decided.
- **Status:** Decided.

## Engineering

- **Decision:** The playground stays in this repo and is owned by the
  project. Dependabot runs grouped and weekly. Dependency majors go one per
  PR.
- **Why:** One repo keeps content and labs in step; small major-version PRs
  are easy to review and revert.
- **Basis:** Decided (the playground stays in this repo; Dependabot runs weekly). Default (grouping and one major per PR).
- **Status:** Decided; Dependabot configured in `.github/dependabot.yml`.

## AI development

- **Decision:** Sonnet 5.5 and Haiku 5.5 only. A stronger model only when
  absolutely needed, through one gated role (no model for now; see the
  2026-10-11 entry below).
  Autonomy is defined in [CONDUCTOR.md](CONDUCTOR.md). The repo is
  Claude-only (Copilot, Codex and ChatGPT are retired). Evals and lints are
  quality gates.
- **Why:** A small, enforced roster keeps cost and behaviour predictable;
  automated gates catch drift.
- **Basis:** Decided (a stronger model only when absolutely needed; Claude-only). Default (the rest).
- **Status:** Decided; the escalation role is not enabled (2026-10-11).

## Legal

- **Decision:** Cover art is AI-generated and released by the maintainer.
  Add trademark disclaimers and a security contact (address recorded
  2026-10-11, below).
- **Why:** State rights and ownership plainly; give reporters a way in.
- **Basis:** Decided (a security contact and trademark disclaimers). Default (the cover-art wording).
- **Status:** Decided; the contact address is recorded (2026-10-11); the
  `security.txt` and contact page are plan item P17-29.

## Maintainer time

- **Decision:** About one hour a week outward-facing, plus reading content.
  No deadline.
- **Why:** The pace must be sustainable.
- **Basis:** Default.
- **Status:** Decided.

---

## 2026-10-11 answers

### No stronger model for now (2026-10-11)

- **Decision:** No stronger model for now. The `sme-reviewer` role stays
  disabled. Fact-checking is the `technical-editor` role plus the
  maintainer's own reading.
- **Why:** The two permitted models are enough while content PRs also get a
  technical-editor pass and the maintainer's own read.
- **Status:** Decided. Reopen only if the maintainer supplies a model ID; the
  steps are in [TEAM-CHARTER.md](TEAM-CHARTER.md), "Escalation role".
- **Basis:** Decided.

### Public contact address (2026-10-11)

- **Decision:** The public address for security reports and contact is
  cennisc@gmail.com. The maintainer designated it as public.
- **Why:** Reporters need a way in, and `security.txt` needs a `Contact`.
- **Status:** Decided. Use it in `security.txt` and the contact page (P17-29).
  Under the project site the file can sit only below `/letstalkcdc/` until the
  domain move.
- **Basis:** Decided.

### Vendor-disclosure policy (2026-10-11)

- **Decision:** The maintainer is a current employee of a vendor that is
  featured in the Cloud labs. This will be disclosed on the About or
  methodology page and on that vendor's lab page. The wording is drafted for
  the maintainer's approval before anything is published. No vendor-comparison
  content until the disclosure is published. (The vendor is not named in this
  file.)
- **Why:** Readers should be able to weigh the content knowing the
  relationship, and the "no vendor sponsorship" line on the methodology page
  must stay true next to it.
- **Status:** Decided; the wording is pending the maintainer's approval
  (P17-30).
- **Basis:** Decided.

### Merge preference (2026-10-11)

- **Decision:** The team merges as much as it confidently can through the
  gate (`scripts/merge-pr.mjs`). When it is not confident, it stops and asks
  the maintainer in the chat. PRs on restricted paths are prepared by the team
  and handed to the maintainer to merge.
- **Why:** Routine PRs should not wait on the maintainer, and the gate
  refuses red, unreviewed and restricted PRs.
- **Status:** Decided.
- **Basis:** Decided.

### Content review (2026-10-11)

- **Decision:** The maintainer reads the pages the weekly digest flags. One
  outside practitioner will be invited to review the new CDC modules; the
  `growth-writer` role drafts the invitation and the maintainer sends it.
- **Why:** A page may say it was reviewed only after a human has read it
  (see Provenance), and an outside reader adds a second view.
- **Status:** Decided; the invitation is not yet drafted or sent.
- **Basis:** Decided.

### First two weeks (2026-10-11)

- **Decision:** Run autopsy part A and the no-regret track in parallel. The
  audience and SEO readout waits until after 2026-11-06.
- **Why:** Part A and the no-regret items need no audience data; the readout
  needs the 2026-11-06 snapshot.
- **Status:** Decided; see Phase 17 in
  [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md).
- **Basis:** Decided.

## 2026-10-12 answers

### Relax four merge and push guardrails (2026-10-12)

- **Decision:** After the maintainer wrote "lets reduce gates and hooks if we
  need to, ask me fior permissions you need", the assistant proposed four
  changes and the maintainer answered "i approve all". (1) The merge script's
  maintainer-only list drops the root `package.json`, `package-lock.json`,
  `.claude/commands/**` and `.claude/scripts/**` (the rest, including
  `.github/**`, `.claude/hooks/**`, settings, agents, the merge script and its
  tests, and every secrets path, stays). (2) A new flag
  `--maintainer-approved "<text>"` turns a gate 5 failure into a visible note
  and bypasses no other gate; it is an honour-system record, and the conductor
  passes it only after the maintainer's own chat message says to merge that
  PR. (3) A Dependabot lane: a patch or minor bump by `dependabot[bot]` that
  touches only the root `package.json` / `package-lock.json` skips gates 4 and
  4b; majors, pre-releases, unparseable versions, Actions bumps and extra
  files stay refused. (4) `guard-bash.mjs` allows a `git push` of a
  `claude/*` branch that touches `.github/`; every other push deny stays.
- **Why:** More PRs can be merged without a round trip; the changes are small
  and the remaining gates still hold. The cost, accepted: a workflow change on
  a pushed branch can run with secrets before the maintainer reads it.
- **Status:** Decided; shipped as P17-65. `guard-edit.mjs` is unchanged.
- **Basis:** Decided.

---

## Pending

- Domain name (decision due 2026-10-23)
- Approval of the vendor-disclosure wording (P17-30)
- Whether "Require branches to be up to date" is switched on for the
  required status checks (optional; off by default; P17-3)
