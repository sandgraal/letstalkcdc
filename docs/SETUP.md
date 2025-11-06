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
# Required for Appwrite features (optional otherwise)
APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
APPWRITE_PROJECT=your_project_id_here
APPWRITE_DB_ID=main
COL_PROGRESS_ID=progress
COL_EVENTS_ID=events
COL_ASSISTANT_ID=assistant_feedback

# Server-side only (for serverless function)
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

### 2. Appwrite Progress Tracking & Authentication (Optional)

**Status**: ✅ **Code Complete** — Requires environment configuration

Enables cloud-based progress sync and GitHub OAuth authentication.

#### Features Enabled

- ✅ Anonymous sessions with cloud backup
- ✅ GitHub OAuth login
- ✅ Progress synced across devices
- ✅ User migration (anonymous → authenticated)
- ✅ Resume functionality
- ✅ Interactive dashboard
- ✅ Analytics events

#### Prerequisites

- [Appwrite Cloud account](https://cloud.appwrite.io) (free) or self-hosted instance
- GitHub OAuth App (for authentication)

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
6. Upload `appwrite.collections.json` from this repo
7. Confirm these collections are created:
   - `progress` — Tracks user journey completion
   - `events` — Logs user activity for analytics
   - `assistant_feedback` — (Optional) AI assistant feedback

**If import fails**, create collections manually using the schema in `appwrite.collections.json`.

##### Step 3: Generate API Key

1. In Appwrite Console, go to **Settings → API Keys**
2. Click "Create API Key"
3. Name: "Server Migration Function"
4. Scopes: Check **Database → Read** and **Database → Write**
5. **Copy the generated key** (you won't see it again!)

##### Step 4: Configure GitHub OAuth

1. Go to **GitHub Settings → Developer settings → OAuth Apps**
2. Click "New OAuth App"
3. Fill in:
   - Application name: `CDC Playground Local Dev`
   - Homepage URL: `http://localhost:8080`
   - Authorization callback URL: `http://localhost:8080/?auth=success`
4. Click "Register application"
5. **Note your Client ID**
6. Click "Generate a new client secret"
7. **Note your Client Secret**

8. In Appwrite Console, go to **Authentication → Providers → GitHub**
9. Enter your GitHub Client ID and Client Secret
10. Add these Success URLs:
    - `http://localhost:8080/?auth=success`
    - `http://localhost:8080/?auth=failed`
    - `https://letstalkcdc.github.io/?auth=success` (for production)
    - `https://letstalkcdc.github.io/?auth=failed`
11. Click "Update" and ensure GitHub provider is **enabled**

##### Step 5: Configure Environment Variables

Edit your `.env` file:

```bash
APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
APPWRITE_PROJECT=YOUR_PROJECT_ID_FROM_STEP_1
APPWRITE_DB_ID=main
COL_PROGRESS_ID=progress
COL_EVENTS_ID=events
COL_ASSISTANT_ID=assistant_feedback
APPWRITE_API_KEY=YOUR_API_KEY_FROM_STEP_3
```

##### Step 6: Test Locally

```bash
# Test Appwrite connection
node test-appwrite.cjs

# Should show:
# ✓ Database: main
# ✓ Collection: progress
# ✓ Collection: events
# ✓ Collection: assistant_feedback

# Start dev server
npm run dev

# Visit http://localhost:8080/intro/
# Check browser console for "CDCProgress" messages
# Test "Sign in with GitHub" button
```

#### Troubleshooting

**Appwrite SDK fails to load**

- Check browser console for network errors
- Verify environment variables are set
- Confirm CDN is accessible: https://cdn.jsdelivr.net/npm/appwrite@13.0.0

**OAuth redirect fails**

- Verify callback URLs are whitelisted in Appwrite Console
- Check GitHub OAuth app configuration
- Look for `?auth=failed` in URL after redirect

**Progress not persisting**

- Verify collections exist in Appwrite
- Check browser console for database permission errors
- Confirm API key has database read/write permissions

**Migration fails after login**

- Verify serverless function is deployed (see [HOSTING.md](HOSTING.md))
- Check function logs for errors
- Test function endpoint directly

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

### Serverless Function (Appwrite Migration)

The `migrateUser` serverless function handles anonymous-to-authenticated user migration. Since GitHub Pages only serves static content, you need a separate serverless provider.

#### Recommended Options

1. **Vercel** (recommended) — Free tier, simple setup
2. **Cloudflare Workers** — Generous free tier (100k requests/day)
3. **AWS Lambda** — Industry standard, flexible
4. **Netlify** — Existing configuration in repo

#### Quick Setup (Vercel)

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy function
vercel
# Follow prompts to link project

# Add environment variables in Vercel dashboard:
# - APPWRITE_ENDPOINT
# - APPWRITE_PROJECT
# - APPWRITE_API_KEY
# - APPWRITE_DB_ID
# - COL_PROGRESS_ID
# - COL_EVENTS_ID
```

Update `scripts/progress.js` (line ~750) with your Vercel function URL:

```javascript
const response = await fetch("/api/migrateUser", {
  /* ... */
});
```

#### Full Documentation

- **Hosting guide**: [docs/HOSTING.md](HOSTING.md)

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
✓ Collection: progress
✓ Collection: events
✓ Collection: assistant_feedback
```

### Feature Testing Checklist

#### Anonymous Session

- [ ] Visit `/intro/` page
- [ ] Progress persists in browser localStorage
- [ ] Check Appwrite Console → Database → progress collection
- [ ] Should see document with anonymous userId

#### OAuth Authentication

- [ ] Click "Sign in with GitHub"
- [ ] Authorize on GitHub
- [ ] Return to site with `?auth=success`
- [ ] Status changes to "Synced across devices"
- [ ] Anonymous progress migrated to authenticated user

#### Progress Persistence

- [ ] Make progress on a journey while authenticated
- [ ] Close browser completely
- [ ] Reopen site and sign in
- [ ] Progress is restored

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

**Progress not syncing**: Check browser console for Appwrite SDK errors

---

## Next Steps

1. ✅ Complete basic setup (clone, install, run)
2. ⚠️ Optional: Configure Appwrite for cloud sync
3. ⚠️ Optional: Enable tracing with AI Toolkit
4. ⚠️ Optional: Deploy to production (GitHub Pages + serverless function)
5. 📖 Read [docs/adding-modules.md](adding-modules.md) to contribute content

---

**Last updated**: November 2025  
**Maintained by**: sandgraal/letstalkcdc  
**License**: See [LICENSE](../LICENSE)
