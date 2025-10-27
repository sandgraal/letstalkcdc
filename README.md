# Let’s Talk CDC — README

_A lightweight, open learning project for Change Data Capture (CDC) and streaming. Built with Eleventy as a static site (all HTML/CSS/JS generated at build time) so anyone can clone, run locally, and contribute._

Status: **beta** · Scope: **education + hands-on labs** · Stack: **HTML/CSS/JS + CSV/JSON content**

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
│   ├── resources/               # Downloadable helpers (connector configs, scripts) → `/downloads/`
│   ├── sitemap.11ty.cjs         # Dynamic sitemap generator
│   ├── search-index.11ty.cjs    # JSON feed used by local search
│   ├── index.njk                # Home page template
│   └── …                        # Content directories (quickstarts, labs, guides, etc.)
├── _site/                      # Generated site output (`npm run build`)
├── scripts/                    # Build helpers (CSS minification, etc.)
├── src/assets/js/app.js        # Client-side interactions shared sitewide
├── src/assets/css/styles.css   # Source stylesheet processed by PostCSS
├── eleventy.config.cjs         # Eleventy configuration
├── postcss.config.js           # PostCSS configuration
├── package.json                # Project metadata, scripts, tooling deps
├── package-lock.json
└── README.md
```

## Deploying to GitHub Pages

This repository includes a GitHub Actions workflow (`.github/workflows/deploy.yml`) that builds the Eleventy site and publishes it to GitHub Pages whenever `main` is updated.

1. Enable GitHub Pages for the repository and select **GitHub Actions** as the source.
2. Define the following repository variables (Settings → Secrets and variables → Actions → Variables) so the build knows where it is being hosted:
   - `SITE_HOST`: The fully-qualified domain where the site will be served (for example `https://letstalkcdc.github.io` or your custom domain). This controls canonical URLs and metadata.
   - `ELEVENTY_PATH_PREFIX`: Leave blank for a root-level deployment or set to `/<repository-name>` if the site is published under a project page path.
3. Push to `main` (or trigger the workflow manually) to build and deploy the `_site/` output.

The runtime JavaScript automatically honours the configured path prefix, so internal links continue to work when the site is hosted under a subdirectory.

<!-- AI-STATUS:START -->
Last AI agents run: 2025-10-27T04:07:29.333Z
<!-- AI-STATUS:END -->
