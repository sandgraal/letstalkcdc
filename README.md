# Let's Talk CDC — README

_A lightweight, open learning project for Change Data Capture (CDC) and streaming. Built with Eleventy as a static site (all HTML/CSS/JS generated at build time) so anyone can clone, run locally, and contribute._

Status: **beta** · Scope: **education + hands-on labs** · Stack: **HTML/CSS/JS + CSV/JSON content**

🌐 **Live Site**: https://sandgraal.github.io/letstalkcdc/

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

For complete setup instructions including optional features (Appwrite progress tracking, OpenTelemetry tracing, AI assistant), see **[docs/SETUP.md](docs/SETUP.md)**.

### 🚀 CDC Sandbox for Hands-On Practice

Get started with CDC in minutes using our pre-configured Docker Compose sandbox:

```bash
# Start the complete CDC stack (Postgres, MySQL, Kafka, Debezium)
docker compose up -d

# Register a connector and start capturing changes
./sandbox/register-postgres-connector.sh

# View change events in Kafka UI
{% include "snippets/open-url.njk" with { url: "http://localhost:8080" } %}
```

**Includes:**
- ✅ Pre-loaded sample data (products, customers, orders)
- ✅ Postgres & MySQL configured for CDC
- ✅ Kafka, Zookeeper, Debezium Connect
- ✅ Kafka UI for visual message inspection

📖 **Full guide:** [docs/SANDBOX.md](docs/SANDBOX.md) | [Quick reference](sandbox/README.md)

### New Features ✨

Recent additions to the platform:

- 🐳 **Docker Compose CDC Sandbox** — Complete CDC environment with one command
- 🔐 **User authentication** — Create an account and log in to sync progress across devices
- ☁️ **Cloud progress sync** — Your learning progress automatically saved and synced via Appwrite
- 🔍 **Client-side search** — Press `/` to search all content instantly
- 📊 **Web Vitals monitoring** — Real-time LCP/FID/CLS tracking (add `?vitals=1`)
- 📦 **Print-ready exports** — Complete guide at `/downloads/cdc-complete-guide.html`
- 🧪 **Enhanced testing** — Comprehensive smoke tests validate all 20 modules
- 📈 **Build analytics** — Track site metrics with `npm run agent:analytics`
- 🚀 **Deployment verification** — Post-deploy checks with `npm run verify:deployment`

### Basic Deployment

1. Enable GitHub Pages for the repository and select **GitHub Actions** as the source
2. Configure repository variables (Settings → Secrets and variables → Actions → Variables):
   - `SITE_HOST`: Full domain where the site is served (e.g., `https://letstalkcdc.github.io` or your custom domain)
   - `ELEVENTY_PATH_PREFIX`: Leave blank for root deployment or set to `/<repository-name>` for project pages
3. Push to `main` or manually trigger the workflow to deploy

The site automatically rebuilds and deploys on every push to `main`.

### Optional Features

The site is built with progressive enhancement — core features work immediately:

| Feature                               | Status      | Documentation                      |
| ------------------------------------- | ----------- | ---------------------------------- |
| **Static site** (educational content) | ✅ Ready    | This README                        |
| **Local progress tracking**           | ✅ Ready    | None needed — uses browser storage |
| **User authentication**               | ✅ Ready    | [docs/auth-setup.md](docs/auth-setup.md) |
| **Cloud progress sync**               | ✅ Ready    | [docs/auth-setup.md](docs/auth-setup.md) |
| **OpenTelemetry tracing**             | ⚠️ Optional | [docs/TRACING.md](docs/TRACING.md) |
| **Appwrite assistant feedback**       | ⚠️ Optional | [docs/SETUP.md](docs/SETUP.md)     |
| **Lightweight AI assistant**          | ⚠️ Optional | [docs/SETUP.md](docs/SETUP.md)     |

### Serverless Function Hosting

- Progress is now stored locally in the browser—no serverless function is required for core site features.

- Detailed deployment instructions
- **Serverless function hosting options (Vercel, Cloudflare Workers, AWS Lambda, Netlify) are only needed for advanced integrations (e.g., Appwrite, feedback collection) or legacy features. Most users do not need to deploy a serverless function.**
- Environment variable configuration
- Custom domain setup
- Migration guides

For full hosting documentation and platform decision rationale, see **[docs/HOSTING.md](docs/HOSTING.md)**.

## Developer Commands

```bash
# Development
npm run dev              # Start dev server at http://localhost:8080
npm run build            # Build production site → _site/

# Testing & Quality
npm run smoke            # Run all tests (core + a11y + perf)
npm run smoke:core       # HTML validation + link checking
npm run smoke:a11y       # Accessibility tests (requires Chromium)
npm run smoke:perf       # Performance budget checks

# Agent Scripts
npm run agent:analytics  # Generate build analytics report
npm run agent:package    # Create print-ready export bundle

# Community Management
node scripts/seed-discussions.mjs  # Seed GitHub Discussions with starter threads

# Deployment
npm run verify:deployment # Verify production deployment
```

### Search Functionality

**Keyboard Shortcuts:**

- Press `/` — Open search modal
- `↑` `↓` — Navigate results
- `Enter` — Open selected result
- `Escape` — Close search

**Programmatic Usage:**

```javascript
// Search is auto-initialized
// Trigger via button: <button data-search-trigger>Search</button>
```

### Web Vitals Monitoring

**Enable in development:**

- Automatically shown on `localhost`
- Force show: Add `?vitals=1` to any URL

**Metrics tracked:**

- **LCP** (Largest Contentful Paint) — Target: < 2.5s
- **FID** (First Input Delay) — Target: < 100ms
- **CLS** (Cumulative Layout Shift) — Target: < 0.1

<!-- AI-STATUS:START -->
Last AI agents run: 2026-01-26T04:23:59.902Z
<!-- AI-STATUS:END -->
