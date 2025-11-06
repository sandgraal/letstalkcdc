# Progress Tracking Overview

> **Update:** GitHub OAuth sign-in has been retired. Progress is now stored locally in the browser so journeys work without any authentication or external services.

## How progress works now

- The `CDCProgress` module persists journey state in `localStorage`.
- Each module page updates the tracker through `CDCProgress.onStepChange({ journeySlug, step, percent, state })`.
- The series toolbar reflects local progress and no longer renders sign-in or sign-out actions.
- The interactive dashboard unlocks automatically once the browser has recorded progress. Data never leaves the device.

### Files involved

| Path | Purpose |
| --- | --- |
| `scripts/progress.js` | Provides the local-only `CDCProgress` implementation and drives the dashboard state. |
| `src/assets/js/local-progress.js` | Tracks module completion, visits, and badges in `localStorage`. |
| `src/assets/js/progress-ui.js` | Updates visual indicators (global progress bar, completion badges, completion button). |
| `src/_includes/components/series-nav.njk` | Renders the journey toolbar without authentication controls. |
| `scripts/dashboard.js` | Renders charts using the locally cached dashboard data. |

## Optional: Appwrite for assistant feedback

Appwrite is now optional and only used to sync assistant feedback. If you provide credentials, the browser will send queued feedback to your Appwrite collection; otherwise everything stays local.

| Variable | Scope | Notes |
| --- | --- | --- |
| `APPWRITE_ENDPOINT` | Client & Functions | Exposed to the browser as `window.APPWRITE_ENDPOINT`. |
| `APPWRITE_PROJECT` | Client & Functions | Exposed to the browser as `window.APPWRITE_PROJECT`. |
| `APPWRITE_DB_ID` | Client & Functions | Exposed to the browser as `window.APPWRITE_DB_ID`. |
| `COL_ASSISTANT_ID` | Client & Functions | Exposed to the browser as `window.COL_ASSISTANT_ID`. |
| `APPWRITE_API_KEY` | **Functions only** | **SECRET**. Required only if you sync feedback through a backend worker. |

If you skip these variables the assistant quietly falls back to local storage.

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

This document replaces the previous Appwrite/GitHub login integration guide. Older references to OAuth or the `migrateUser` function can be removed from downstream tooling.
