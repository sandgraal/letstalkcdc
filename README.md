# Let’s Talk CDC — README

_A lightweight, open learning project for Change Data Capture (CDC) and streaming. Built as a static site so anyone can clone, run locally, and contribute._

Status: **alpha** · Scope: **education + hands-on labs** · Stack: **HTML/CSS/JS + CSV/JSON content**

---

## Why this exists

- Make CDC approachable for beginners **without** dumbing it down for practitioners.
- Teach core concepts (snapshots, streaming, ordering, schema change, backfills) with **interactive** examples.
- Provide **vendor-agnostic** explanations first, then **practical mappings** to common stacks (Debezium, Kafka, Matillion CDC/Streaming, Snowflake/S3/GCS, etc.).

---

## Project structure

letstalkcdc/
├─ index.html                  # Landing page
├─ content/                    # Learning modules (md/html) and assets per topic
│  ├─ overview/
│  │  ├─ index.md
│  │  └─ media/
│  ├─ snapshotting-first-sync/
│  │  ├─ index.md              # “Snapshotting: The First Sync”
│  │  └─ media/
│  ├─ streaming-fundamentals/
│  ├─ schema-change/
│  ├─ ordering-replay-recovery/
│  └─ troubleshooting/
├─ data/                       # Small demo datasets (CSV/JSON)
│  ├─ tables/
│  └─ charts/
├─ assets/
│  ├─ css/
│  │  └─ theme.css             # Color tokens + utilities
│  ├─ js/
│  │  ├─ app.js                # Nav, TOC, light interactivity
│  │  ├─ charts.js             # Chart.js helpers (optional)
│  │  └─ vendors/              # e.g., Chart.js, treemap plugin (via CDN or vendored)
│  └─ img/
├─ scripts/                    # One-off helpers (link check, lint, CSV->JSON)
├─ .github/
│  └─ workflows/
│     └─ linkcheck.yml         # CI link checker (optional)
└─ README.md
