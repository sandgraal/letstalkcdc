# Let’s Talk CDC — README

_A lightweight, open learning project for Change Data Capture (CDC) and streaming. Built with Eleventy as a static site (all HTML/CSS/JS generated at build time) so anyone can clone, run locally, and contribute._

Status: **alpha** · Scope: **education + hands-on labs** · Stack: **HTML/CSS/JS + CSV/JSON content**

---

## Why this exists

- Make CDC approachable for beginners **without** dumbing it down for practitioners.
- Teach core concepts (snapshots, streaming, ordering, schema change, backfills) with **interactive** examples.
- Provide **vendor-agnostic** explanations first, then **practical mappings** to common stacks (Debezium, Kafka, Matillion CDC/Streaming, Snowflake/S3/GCS, etc.).

---

## Project structure

```text
letstalkcdc/
├── src/                        # Eleventy source files (layouts, data, content sections)
│   ├── _data/                   # Dataset files exposed to templates
│   ├── _includes/               # Layouts and shared partials
│   ├── assets/                  # CSS/JS copied straight through to the build
│   ├── index.njk                # Home page template
│   └── …                        # Content directories (quickstarts, labs, guides, etc.)
├── dist/                       # Generated site output (`npm run build`)
├── scripts/                    # Build helpers (CSS minification, etc.)
├── connectors/                 # Downloadable companion files for guides
├── src/assets/js/app.js        # Client-side interactions shared sitewide
├── src/assets/css/styles.css   # Source stylesheet processed by PostCSS
├── eleventy.config.cjs         # Eleventy configuration
├── postcss.config.js           # PostCSS configuration
├── package.json                # Project metadata, scripts, tooling deps
├── package-lock.json
└── README.md
```
