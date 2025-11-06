# Setup Guide — Let's Talk CDC

Complete setup guide for local development and deployment of the Let's Talk CDC educational platform.

## Quick Start

```bash
# Clone and install
git clone https://github.com/sandgraal/letstalkcdc.git
cd letstalkcdc
npm install

# Build and run locally
npm run build
npm run dev
# Visit http://localhost:8080
```

## Core Features & Optional Services

The site is built with **progressive enhancement** — core features work immediately, with optional services adding enhanced functionality:

| Feature                               | Status      | Setup Required                        |
| ------------------------------------- | ----------- | ------------------------------------- |
| **Static site** (educational content) | ✅ Ready    | None — works out of the box           |
| **Local progress tracking**           | ✅ Ready    | None — uses browser localStorage      |
| **AI Toolkit tracing**                | ⚠️ Optional | AI Toolkit + start dev server         |
| **Appwrite (cloud sync + auth)**      | ⚠️ Optional | Appwrite project + environment config |
| **Lightweight assistant**             | ⚠️ Optional | Appwrite collection setup             |

## Environment Configuration

### Copy Environment Template

```bash
cp .env.example .env
```

### Edit `.env` with Your Values

```bash
# Required for Appwrite features (all three must be set)
APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
APPWRITE_PROJECT=your_project_id_here
APPWRITE_DB_ID=main

# Optional: Required only for assistant feedback collection
COL_ASSISTANT_ID=assistant_feedback

# Server-side only (for optional backend helpers)
APPWRITE_API_KEY=your_secret_api_key_here

# Site configuration (for GitHub Pages deployment)
SITE_HOST=https://letstalkcdc.github.io
# ELEVENTY_PATH_PREFIX is auto-detected from GITHUB_REPOSITORY
# Only set manually if needed for custom deployments
# ELEVENTY_PATH_PREFIX=/letstalkcdc
```

---

## Feature Setup Guides

### 1. OpenTelemetry Tracing (Optional)

**Status**: ✅ **Implemented with tracing-lite.js** (no bundler required)

The site uses a **lightweight tracing implementation** (`src/assets/js/tracing-lite.js`) that works without bundling. It sends telemetry to AI Toolkit's OTLP collector.

#### What Gets Tracked

- **Page load performance** — Document load timing, resource loading
- **User interactions** — Clicks, form submissions, navigation
- **Learning progress** — Module completion, step tracking
- **Search queries** — Search usage and result counts
- **Code copy events** — When users copy code snippets
- **Core Web Vitals** — LCP, FID, CLS metrics

#### Prerequisites

1. **VS Code** with **AI Toolkit extension** installed
2. **AI Toolkit tracing viewer** enabled

#### Enable Tracing

1. Open **VS Code → View → AI Toolkit → Tracing**
2. Start dev server: `npm run dev`
3. Browse the site at http://localhost:8080
4. View traces in AI Toolkit panel

#### Documentation

- **Comprehensive guide**: [docs/TRACING.md](TRACING.md)
- **Quick start**: [docs/TRACING-QUICKSTART.md](TRACING-QUICKSTART.md)

#### Notes

- ✅ **No bundler required** — Uses fetch API directly
- ✅ **No external dependencies** at runtime
- ✅ **Works in all modern browsers**
- ⚠️ Requires AI Toolkit running for trace collection
- ⚠️ Localhost-only by default (can be configured for production)

---

### 2. Optional Appwrite Assistant Feedback

**Status**: ✅ **Code Complete** — Only needed if you want to sync assistant feedback to Appwrite.

Progress tracking now runs entirely in the browser with no authentication. Appwrite is purely optional for storing answers/feedback gathered through the assistant widget.

#### What you get

- ✅ Assistant feedback synced to Appwrite when credentials are present
- ✅ Graceful fallback to local storage if Appwrite details are missing
- 🚫 No user authentication or GitHub OAuth required

#### Prerequisites

- [Appwrite Cloud account](https://cloud.appwrite.io) (free) or self-hosted instance

#### Setup Steps

##### Step 1: Create Appwrite Project

1. Log in to [Appwrite Cloud](https://cloud.appwrite.io)
2. Click "Create Project"
3. Name it "CDC Playground" (or your preference)
4. **Note your Project ID** (required for `.env`)

##### Step 2: Set Up Database

1. In your Appwrite project, go to **Databases**
2. Click "Create Database"
3. Name it `main`
4. Click the database to open it
5. Click "**Import Collections**"
6. Upload `appwrite.collections.json`
7. Confirm the `assistant_feedback` collection exists (the progress and events collections are no longer required).

##### Step 3: Configure Environment Variables

Edit your `.env` file:

```bash
# Required for Appwrite features (all three must be set)
APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
APPWRITE_PROJECT=YOUR_PROJECT_ID_FROM_STEP_1
APPWRITE_DB_ID=main

# Optional: Required only for assistant feedback collection
COL_ASSISTANT_ID=assistant_feedback
```

> The assistant automatically stores feedback locally if `COL_ASSISTANT_ID` is missing. The three required fields (`APPWRITE_ENDPOINT`, `APPWRITE_PROJECT`, `APPWRITE_DB_ID`) must all be set for Appwrite features to work. You only need `APPWRITE_API_KEY` if a backend worker posts feedback on your behalf; the static site does not expose the key.

##### Step 4: Test Locally

```bash
# Test Appwrite connection (optional helper)
node test-appwrite.cjs

# Start dev server
npm run dev

# Visit http://localhost:8080/intro/
# Submit assistant feedback and check the Appwrite collection
```

#### Troubleshooting

- Ensure the `assistant_feedback` collection permissions allow anonymous document creation.
- Confirm network access to `APPWRITE_ENDPOINT` from the browser.
- Confirm CDN is accessible: https://cdn.jsdelivr.net/npm/appwrite@13.0.0

**Assistant feedback not syncing**

- Verify the `assistant_feedback` collection allows anonymous document creation.
- Confirm the Appwrite credentials in `.env` match your project IDs.
- Check browser console for Appwrite SDK warnings.

**Progress not persisting**

- Ensure `localStorage` is available (disable private browsing modes that block storage).
- Check for console warnings from `CDCProgress`.
- Clear `localStorage` to reset and try again.

#### Documentation

- **Detailed collection setup**: [docs/assistant-feedback-setup.md](assistant-feedback-setup.md)

---

### 3. Lightweight Assistant (Optional)

**Status**: ✅ **Implemented** — Requires Appwrite `assistant_feedback` collection

Provides an AI assistant with predefined answers to common CDC questions.

#### Features

- 🤖 Pattern-matched intents for common questions
- 💾 Feedback collection (👍/👎) stored in Appwrite
- 🔄 Offline fallback with queue replay
- 📊 Knowledge base defined in `src/data/assistant.yml`

#### Setup

1. **Complete Appwrite setup** (see section 2 above)
2. **Verify collection exists**: `assistant_feedback` should be created when you import `appwrite.collections.json`
3. **Test locally**: Click the floating assistant button (💬 icon)

#### Extending the Knowledge Base

Edit `src/data/assistant.yml` to add new intents:

```yaml
- id: your-intent-id
  triggers:
    - "your trigger phrase"
    - "alternative phrase"
  answer: "Your answer text here"
  links:
    - text: "Related Doc"
      href: "/path/to/doc/"
```

The site automatically converts YAML → JSON during build.

#### Documentation

- **Collection schema**: [docs/assistant-feedback-setup.md](assistant-feedback-setup.md)
- **Contributing guide**: [AI-CONTRIBUTING.md](../AI-CONTRIBUTING.md)

---

## Production Deployment

### GitHub Pages (Static Site)

The site deploys automatically to GitHub Pages via GitHub Actions.

#### Enable Deployment

1. Go to **Settings → Pages**
2. Select **GitHub Actions** as source
3. Configure repository variables (Settings → Secrets and variables → Actions → Variables):

   - `SITE_HOST`: `https://letstalkcdc.github.io` or your custom domain
   - `ELEVENTY_PATH_PREFIX`: `/letstalkcdc` (or blank for root deployment)

4. Push to `main` branch to trigger deployment

### No Serverless Function Required

Progress now stays entirely in the browser. You can remove any existing `migrateUser` deployments and skip the serverless setup steps that were previously needed for GitHub OAuth.

Refer to [docs/HOSTING.md](HOSTING.md) for an updated overview of the hosting architecture.

---

## Testing

### Local Development

```bash
# Build and serve
npm run dev

# Run quality checks
npm run smoke        # All tests (HTML, a11y, performance)
npm run smoke:core   # HTML validation + link checking
npm run smoke:a11y   # Accessibility tests (requires Chromium)
npm run smoke:perf   # Performance budget checks
```

### Appwrite Connection

```bash
# Test Appwrite connection and collection setup
node test-appwrite.cjs
```

Should output:

```
✓ Connected to Appwrite
✓ Database: main
✓ Collection: assistant_feedback
```

### Feature Testing Checklist

#### Local Progress (default)

- [ ] Visit `/intro/` page
- [ ] Interact with a checklist or completion button
- [ ] Refresh the page and confirm the toolbar still shows your progress
- [ ] Clear `localStorage` (`cdc-progress-store`) to reset

#### Assistant Feedback (optional)

- [ ] Trigger the assistant prompt
- [ ] Submit thumbs-up or thumbs-down feedback
- [ ] Confirm a new document appears in Appwrite → Database → `assistant_feedback`

#### Tracing

- [ ] AI Toolkit tracing panel shows spans
- [ ] `module.view` span appears when visiting a module
- [ ] `learning.progress` span appears when completing steps
- [ ] `search.query` span appears when searching

---

## Architecture Notes

### Progressive Enhancement

The site follows a **layered architecture**:

1. **Base Layer** — Static HTML/CSS, works without JavaScript
2. **Local Storage** — Progress tracking in browser (no backend)
3. **Cloud Sync** — Appwrite adds cross-device persistence (optional)
4. **Authentication** — GitHub OAuth for user accounts (optional)

### Security

- ✅ API keys never exposed to browser
- ✅ Collections have proper read/write permissions
- ✅ Anonymous users isolated to their own data
- ✅ CORS properly configured
- ✅ `.env` excluded from version control

### Performance

- ✅ Static site generation (fast load times)
- ✅ Lazy-loading of Appwrite SDK (only when needed)
- ✅ Debounced progress saves (400ms)
- ✅ Efficient pagination for dashboard
- ✅ Background sync doesn't block UI

---

## Getting Help

### Documentation Index

- **Setup** — This file
- **Hosting** — [docs/HOSTING.md](HOSTING.md)
- **Tracing** — [docs/TRACING.md](TRACING.md), [docs/TRACING-QUICKSTART.md](TRACING-QUICKSTART.md)
- **Adding modules** — [docs/adding-modules.md](adding-modules.md)
- **Assistant setup** — [docs/assistant-feedback-setup.md](assistant-feedback-setup.md)
- **Contributing** — [AI-CONTRIBUTING.md](../AI-CONTRIBUTING.md)
- **Architecture** — [.github/copilot-instructions.md](../.github/copilot-instructions.md)

### Common Issues

**Build fails**: Run `npm clean && npm install && npm run build`

**Port 8080 in use**: Kill the process or use `npx eleventy --serve --port=3000`

**Tracing not working**: Ensure AI Toolkit is running and tracing viewer is open

**Appwrite connection fails**: Run `node test-appwrite.cjs` to diagnose

**Progress not updating**: Ensure `localStorage` is enabled and not cleared automatically

---

## Next Steps

1. ✅ Complete basic setup (clone, install, run)
2. ⚠️ Optional: Configure Appwrite for assistant feedback sync
3. ⚠️ Optional: Enable tracing with AI Toolkit
4. ⚠️ Optional: Deploy to production (GitHub Pages)
5. 📖 Read [docs/adding-modules.md](adding-modules.md) to contribute content

---

**Last updated**: November 2025  
**Maintained by**: sandgraal/letstalkcdc  
**License**: See [LICENSE](../LICENSE)
