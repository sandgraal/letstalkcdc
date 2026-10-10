# Decisions log

Maintainer decisions for Let's Talk CDC, recorded 2026-10-09. One short
entry each: what was decided, why in one line, and where it stands. This
file is public; it records decisions, not motives beyond what is stated.

Status values: **Decided** (in force), **In progress**, **Not started**,
**Pending** (waiting on an input listed at the end).

---

## Purpose

- **Decision:** The site aims to be the best free learning resource on CDC.
  It also builds the author's professional credibility.
- **Why:** A free, accurate resource earns trust; trust is the point.
- **Status:** Decided.

## Audience

- **Decision:** All levels: newcomers, operators of pipelines, and
  architects.
- **Why:** CDC knowledge gaps exist at every stage, and one path per role
  serves them without splitting the site.
- **Status:** Decided.

## Success floor (6-12 months)

- **Decision:** 100 visitors a month and 5 GitHub stars. Leading
  indicators are tracked from a 28-day baseline (first snapshot due
  2026-11-06): indexed pages, search impressions, newsletter signups,
  assistant feedback rows.
- **Why:** A modest floor that is measurable and honest; leading indicators
  show movement before visitor counts do.
- **Status:** Decided; baseline snapshot due 2026-11-06.

## Spend

- **Decision:** No recurring cost. Free tiers only. No paid APIs.
- **Why:** The project must be able to run indefinitely at no recurring
  cost.
- **Status:** Decided.

## Brand

- **Decision:** "Let's Talk CDC" is the primary name. "CDC: The Missing
  Manual" is retained until a rename PR. "Missing Manual" is the name of an
  existing book series, so verify trademark before any book, PDF or new use.
- **Why:** Avoid building on a name that may belong to someone else.
- **Status:** Rename not started.

## Voice

- **Decision:** First-person practitioner voice is fine for experience
  stated in general terms. No named employers or clients. Illustrative
  scenarios are labelled illustrative.
- **Why:** Readers should be able to tell experience from example, and no
  third party should be identifiable.
- **Status:** Decided.

## Provenance

- **Decision:** Pages are drafted with AI assistance and say so. A page may
  say "reviewed by <maintainer>" only after the maintainer confirms; until
  then it is labelled AI-assisted only.
- **Why:** A review claim must be true when it is made.
- **Status:** Decided.

## Content direction

- **Decision:** Modules for backfills, testing, replication slots, outbox,
  contracts, SQL Server/MySQL, and non-Kafka paths are done. Next
  candidates: lakehouse table formats, CDC for AI (keeping vector stores
  and RAG indexes fresh), schema contracts, cost modelling, Flink CDC.
  Vendor-comparison content waits for the disclosure policy.
- **Why:** Cover the remaining gaps in order of reader value; comparisons
  need disclosure rules first.
- **Status:** Decided; vendor comparisons Pending (disclosure policy).

## Format

- **Decision:** A guided learning path (newcomer, operator, architect
  tracks) first. Then a 5-page "answer page" pilot, measured for 8 weeks
  before scaling.
- **Why:** Structure helps readers now; the pilot tests whether answer
  pages earn their upkeep before more are written.
- **Status:** Decided; not started.

## AI crawlers and licensing

- **Decision:** AI crawlers are allowed. Publish llms.txt and a Markdown
  copy per page. CC BY 4.0 attribution is required.
- **Why:** The goal is reach; attribution keeps the source visible.
- **Status:** Decided.

## Assistant

- **Decision:** Retrieval-only (find the right page; no generated answers)
  while there is no budget. A weekly gap report from `assistant_feedback`
  is read by the maintainer.
- **Why:** Generated answers need paid APIs; feedback rows show where
  content is missing.
- **Status:** Decided.

## Backend

- **Decision:** Allowed where it earns its keep, free tier only.
- **Why:** Static-first stays the default; a service must justify itself
  and fit the spend rule.
- **Status:** Decided.

## Hosting

- **Decision:** GitHub Pages until the domain is chosen (decision due
  2026-10-23), then Cloudflare Pages, verifying free-tier terms immediately
  before cut-over.
- **Why:** No recurring cost, and terms change, so check at the moment of
  the move.
- **Status:** Pending (domain name; decision due 2026-10-23).

## Spanish

- **Decision:** Pilot (intro, learning path, glossary) after content
  stabilises, with a drift check against the English.
- **Why:** Translating moving content creates stale copies; the drift check
  catches them.
- **Status:** Decided; not started.

## PDF/EPUB and offline/PWA

- **Decision:** Later. Not named "Missing Manual".
- **Why:** Lower priority than content, and the name needs trademark
  verification first.
- **Status:** Deferred.

## Quality

- **Decision:** WCAG 2.2 AA, stated in a public accessibility statement.
  Performance work may lazy-load or remove heavy features. Self-host
  Mermaid and Chart.js with SRI and a CSP.
- **Why:** Accessibility is a stated commitment; third-party CDNs add risk
  and weight.
- **Status:** Decided.

## Engineering

- **Decision:** The playground stays in this repo and is owned by the
  project. Dependabot runs grouped and weekly. Dependency majors go one per
  PR.
- **Why:** One repo keeps content and labs in step; small major-version PRs
  are easy to review and revert.
- **Status:** Decided; Dependabot configured in `.github/dependabot.yml`.

## AI development

- **Decision:** Sonnet 5.5 and Haiku 5.5 only. A stronger model only when
  absolutely needed, through one gated role (model not yet chosen).
  Autonomy is defined in [CONDUCTOR.md](CONDUCTOR.md). The repo is
  Claude-only (Copilot, Codex and ChatGPT are retired). Evals and lints are
  quality gates.
- **Why:** A small, enforced roster keeps cost and behaviour predictable;
  automated gates catch drift.
- **Status:** Decided; escalation model Pending.

## Legal

- **Decision:** Cover art is AI-generated and released by the maintainer.
  Add trademark disclaimers and a security contact (address pending).
- **Why:** State rights and ownership plainly; give reporters a way in.
- **Status:** Pending (public contact email).

## Maintainer time

- **Decision:** About one hour a week outward-facing, plus reading content.
  No deadline.
- **Why:** The pace must be sustainable.
- **Status:** Decided.

---

## Pending

- Model ID for the escalation role
- Public contact email
- Vendor-disclosure policy
- Domain name (decision due 2026-10-23)
