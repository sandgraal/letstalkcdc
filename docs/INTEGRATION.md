# Progress Tracking Technical Details

> **Quick Start**: For general setup instructions, see [docs/SETUP.md](docs/SETUP.md). This document provides technical implementation details for developers working on the progress tracking system.

> **Update:** GitHub OAuth sign-in has been retired. Progress is now stored locally in the browser so journeys work without any authentication or external services.

## How progress works now

- The `CDCProgress` module persists journey state in `localStorage`.
- Each module page updates the tracker through `CDCProgress.onStepChange({ journeySlug, step, percent, state })`.
- The series toolbar reflects local progress and no longer renders sign-in or sign-out actions.
- The interactive dashboard unlocks automatically once the browser has recorded progress. Data never leaves the device.

### Files involved

| Path                                      | Purpose                                                                                |
| ----------------------------------------- | -------------------------------------------------------------------------------------- |
| `scripts/progress.js`                     | Provides the local-only `CDCProgress` implementation and drives the dashboard state.   |
| `src/assets/js/local-progress.js`         | Tracks module completion, visits, and badges in `localStorage`.                        |
| `src/assets/js/progress-ui.js`            | Updates visual indicators (global progress bar, completion badges, completion button). |
| `src/_includes/components/series-nav.njk` | Renders the journey toolbar without authentication controls.                           |
| `scripts/dashboard.js`                    | Renders charts using the locally cached dashboard data.                                |

## Optional: Supabase for assistant feedback

Supabase is optional and only used to store assistant feedback. If you provide the two build-time variables below, the browser sends queued 👍/👎 feedback to the `public.assistant_feedback` table with plain `fetch` (no SDK); otherwise everything stays local.

| Variable                   | Scope               | Notes                                                                                  |
| -------------------------- | ------------------- | -------------------------------------------------------------------------------------- |
| `SUPABASE_URL`             | Build time (public) | Project URL, exposed to the browser.                                                   |
| `SUPABASE_PUBLISHABLE_KEY` | Build time (public) | Publishable key (`sb_publishable_...`). Row-level security limits it to `INSERT` only. |

Never use a secret or service-role key here. If you skip these variables the assistant quietly falls back to local storage (`assistantFeedback`). See [SETUP.md](SETUP.md) for the table schema and setup steps.

## Testing checklist

- `npm run serve`
- Visit any journey page and interact with checklists or completion buttons.
- Reload the page and confirm:
  - The toolbar shows the saved percentage and “Progress saved locally.”
  - The interactive dashboard is visible with your local stats.
- Clear browser storage to reset the session (run `localStorage.removeItem('cdc-progress-store')` in the browser console).

## Deployment notes

- No serverless function or OAuth provider is required.
- GitHub Pages or any static host works out of the box.
- Ensure the bundled assets include `scripts/progress.js` for journey layouts (already wired in `base.njk`).

This document replaces the previous GitHub login integration guide. Older references to OAuth or the `migrateUser` function can be removed from downstream tooling.
