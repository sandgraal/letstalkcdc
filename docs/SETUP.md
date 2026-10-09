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

| Feature                               | Status        | Setup Required                   |
| ------------------------------------- | ------------- | -------------------------------- |
| **Static site** (educational content) | ✅ Ready      | None — works out of the box      |
| **Local progress tracking**           | ✅ Ready      | None — uses browser localStorage |
| **Client-side tracing**               | ❌ Removed    | See [TRACING.md](TRACING.md)     |
| **Supabase assistant feedback**       | ⚠️ Optional   | Supabase project + table setup   |
| **User authentication**               | ⚠️ Deprecated | Authentication has been removed  |
| **Cloud progress sync**               | ⚠️ Deprecated | Cloud sync has been removed      |

## Environment Configuration

### Copy Environment Template

```bash
cp .env.example .env
```

### Edit `.env` with Your Values

```bash
# Optional Supabase integration (assistant feedback only)
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key_here

# Site configuration (for GitHub Pages deployment)
SITE_HOST=https://letstalkcdc.github.io
# ELEVENTY_PATH_PREFIX is auto-detected from GITHUB_REPOSITORY
# Only set manually if needed for custom deployments
# ELEVENTY_PATH_PREFIX=/letstalkcdc
```

---

## Feature Setup Guides

### 1. Client-side tracing — removed

The previous `tracing-lite.js` implementation was removed in May 2026.
It POSTed to `http://localhost:4318/v1/traces` for every visitor — i.e.
to _their own_ localhost — and was always swallowed by the fetch
`catch`. See [TRACING.md](TRACING.md) for the removal context and the
recipe for re-introducing tracing properly if it's ever wanted.

There is nothing to set up here. `app.js` keeps a no-op
`educationTracer` so per-module call sites don't change.

---

### 2. Optional Assistant Feedback (Supabase)

**Status**: ✅ **Code Complete**. Only needed if you want to sync assistant feedback to a database.

Progress tracking runs entirely in the browser with no authentication. Supabase is purely optional for storing 👍/👎 feedback gathered through the assistant widget.

#### What you get

- ✅ Assistant feedback synced to Supabase when credentials are present
- ✅ Graceful fallback to local storage if Supabase details are missing
- 🚫 No user authentication or GitHub OAuth required

#### Setup Steps

1. Use the shared `letstalkcdc` Supabase project (or create your own). The `assistant_feedback` table is part of the migration documented in [`playground/docs/supabase-setup.md`](../playground/docs/supabase-setup.md); for a fresh project run:

   ```sql
   create table public.assistant_feedback (
     id uuid primary key default gen_random_uuid(),
     question text not null check (char_length(question) <= 2000),
     intent_id text check (char_length(intent_id) <= 200),
     helpful boolean not null,
     ts timestamptz not null default now()
   );
   alter table public.assistant_feedback enable row level security;
   create policy "anon can insert feedback" on public.assistant_feedback
     for insert to anon, authenticated with check (true);
   ```

   Anonymous visitors can only **insert**; reading feedback requires the dashboard or a service key.

2. Set the two public values in your `.env` (local) and as repository **variables** `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` (Settings → Secrets and variables → Actions → Variables) for the Pages deploy:

   ```bash
   SUPABASE_URL=https://<project-ref>.supabase.co
   SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```

   The publishable key is public by design (row-level security is the access control). Never use a `service_role`/secret key in the browser.

3. Test locally: `npm run dev`, open `http://localhost:8080/intro/`, submit assistant feedback, and check the `assistant_feedback` table.

Without these variables nothing is sent anywhere and feedback stays in `localStorage`.

---

### 3. Lightweight Assistant (Optional)

**Status**: ✅ **Implemented** — Requires the Supabase `assistant_feedback` table

Provides an AI assistant with predefined answers to common CDC questions.

#### Features

- 🤖 Pattern-matched intents for common questions
- 💾 Feedback collection (👍/👎) stored in Supabase
- 🔄 Offline fallback with queue replay
- 📊 Knowledge base defined in `src/data/assistant.yml`

#### Setup

1. **Complete Supabase setup** (see section 2 above)
2. **Verify the table exists**: `assistant_feedback` in your Supabase project
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

- **Collection schema**: See section 2 above for collection setup details
- **Contributing guide**: [CONTRIBUTING.md](./CONTRIBUTING.md)

---

### 4. Archived: User Authentication and Cloud Progress Sync

**Status**: ⚠️ **DEPRECATED** — Authentication and cloud sync have been removed

> **Note**: User authentication with email/password and cloud-synced progress were previously supported but have been removed from the codebase. Progress tracking now runs entirely in the browser using localStorage with no authentication required.

#### What Changed

- ❌ User signup and login removed
- ❌ Cloud-synced progress removed
- ❌ The old Appwrite `progress` and `events` collections are gone (the site no longer uses Appwrite)
- ✅ Progress tracking continues to work using browser localStorage only
- ✅ Assistant feedback (`assistant_feedback` table in Supabase) still supported

#### Historical Context

The authentication system previously allowed users to:

- Create accounts with email/password
- Sync module completion progress across devices
- Merge local and cloud progress on login

This functionality was removed to simplify the architecture and eliminate the need for user accounts. All progress tracking is now browser-based, which provides a better user experience without requiring login.

#### Migration Notes

If you have an existing deployment with user authentication:

- Existing users will automatically fall back to localStorage-based progress
- The old Appwrite project (including its `progress` and `events` collections) can be deleted
- No user data migration is needed (users will start fresh with localStorage)

For historical reference, the complete authentication setup documentation has been archived in [docs/archive/auth-setup.md](archive/auth-setup.md)

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

### Feature Testing Checklist

#### Local Progress (default)

- [ ] Visit `/intro/` page
- [ ] Interact with a checklist or completion button
- [ ] Refresh the page and confirm the toolbar still shows your progress
- [ ] Clear `localStorage` (`cdc-progress-store`) to reset

#### Assistant Feedback (optional)

- [ ] Trigger the assistant prompt
- [ ] Submit thumbs-up or thumbs-down feedback
- [ ] Confirm a new row appears in Supabase → Table Editor → `assistant_feedback`

---

## Architecture Notes

### Progressive Enhancement

The site follows a **layered architecture**:

1. **Base Layer** — Static HTML/CSS, works without JavaScript
2. **Local Storage** — Progress tracking in browser (no backend)
3. **Assistant Feedback** — Supabase collects 👍/👎 ratings on the
   AI assistant's responses (optional; site works without it)

A previous cloud-sync + GitHub-OAuth tier existed on top of this
stack but was removed; see "Archived: User Authentication and
Cloud Progress Sync" above.

### Security

- ✅ API keys never exposed to browser
- ✅ Row-level security: anonymous visitors can only insert feedback
- ✅ `.env` excluded from version control

### Performance

- ✅ Static site generation (fast load times)
- ✅ Lazy-loading of the Supabase SDK (only when needed)

---

## Getting Help

### Documentation Index

- **Setup** — This file
- **Hosting** — [docs/HOSTING.md](HOSTING.md)
- **Tracing (removed)** — [docs/TRACING.md](TRACING.md)
- **Adding modules** — [docs/adding-modules.md](adding-modules.md)
- **Contributing** — [CONTRIBUTING.md](./CONTRIBUTING.md)
- **Architecture** — [.github/copilot-instructions.md](../.github/copilot-instructions.md)
- **Archived docs** — [docs/archive/](archive/) (historical reference)

### Common Issues

**Build fails**: Run `npm clean && npm install && npm run build`

**Port 8080 in use**: Kill the process or use `npx eleventy --serve --port=3000`

**Feedback not syncing**: confirm `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` were set at build time and the `assistant_feedback` table has the insert policy

**Progress not updating**: Ensure `localStorage` is enabled and not cleared automatically

---

## Next Steps

1. ✅ Complete basic setup (clone, install, run)
2. ⚠️ Optional: Configure Supabase for assistant feedback sync
3. ⚠️ Optional: Deploy to production (GitHub Pages)
4. 📖 Read [docs/adding-modules.md](adding-modules.md) to contribute content

---

**Last updated**: November 2025  
**Maintained by**: sandgraal/letstalkcdc  
**License**: See [LICENSE](../LICENSE)
