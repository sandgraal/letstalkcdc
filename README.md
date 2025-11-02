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

## Hosting and Deployment

This project is hosted on **GitHub Pages** with automatic deployment via GitHub Actions.

### Quick Start

1. Enable GitHub Pages for the repository and select **GitHub Actions** as the source
2. Configure repository variables (Settings → Secrets and variables → Actions → Variables):
   - `SITE_HOST`: Full domain where the site is served (e.g., `https://letstalkcdc.github.io` or your custom domain)
   - `ELEVENTY_PATH_PREFIX`: Leave blank for root deployment or set to `/<repository-name>` for project pages
3. Push to `main` or manually trigger the workflow to deploy

The site automatically rebuilds and deploys on every push to `main`.

### Serverless Function Hosting

The `migrateUser` serverless function (for Appwrite progress sync) requires separate hosting since GitHub Pages only serves static content. See [docs/HOSTING.md](docs/HOSTING.md) for:
- Detailed deployment instructions
- Serverless function hosting options (Vercel, Cloudflare Workers, AWS Lambda, Netlify)
- Environment variable configuration
- Custom domain setup
- Migration guides

For full hosting documentation and platform decision rationale, see **[docs/HOSTING.md](docs/HOSTING.md)**.

<!-- AI-STATUS:START -->
Last AI agents run: 2025-10-27T04:07:29.333Z
<!-- AI-STATUS:END -->
