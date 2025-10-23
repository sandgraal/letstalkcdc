# Appwrite Login + Progress Persistence Integration

This adds persistent learning progress and authentication across devices to the CDC Playground.

## Setup

1. **Appwrite**
   - Create database `main`.
   - Import `appwrite.collections.json`.
   - Generate an API key with DB read/write.
   - Note your `APPWRITE_PROJECT`, `APPWRITE_ENDPOINT`, and key.

2. **Netlify**
   Add environment variables:


APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1

APPWRITE_PROJECT=YOUR_PROJECT_ID
APPWRITE_API_KEY=YOUR_API_KEY
APPWRITE_DB_ID=main
COL_PROGRESS_ID=progress
COL_EVENTS_ID=events


3. **Eleventy**
- Include `/scripts/progress.js` in all journey layouts.
- Inject `window.APPWRITE_*` vars at runtime.
- Call:
  ```js
  CDCProgress.onStepChange({ journeySlug, step, percent, state });
  ```
  whenever a user moves to a new step.

4. **Testing**
- Run locally with `netlify dev`.
- Confirm:
  - Anonymous session → creates progress doc.
  - OAuth login → runs migration via `migrateUser.js`.
  - Resume toast appears when returning to a journey.

5. **Deploy**
- Commit to `feature/appwrite-progress-login`.
- Push and verify deploy preview.
- Merge to `main` once verified.


Update package.json:

"dependencies": {
  "node-appwrite": "^13.0.0"
}


Ensure Eleventy wiring:

Journey templates import /scripts/progress.js.

Buttons call CDCProgress.signInWithOAuth("github") and CDCProgress.signOut().

The “Resume” toast works with CDCProgress.offerResume().

Validate deployment:

Test on local (netlify dev) and remote (preview).

Confirm both anonymous and authenticated users persist progress.

Definition of Done
✅ Appwrite collections created and imported.
✅ Environment variables configured in Netlify.
✅ Anonymous progress autosaves and syncs on login.
✅ OAuth login (GitHub) works end-to-end.
✅ Resume-progress toast visible.
✅ Tested and passing on Netlify preview.
✅ PR ready to merge into main.

📍Repo: sandgraal/Lets-Talk-CDC-Change-Feed-Playground
📍Branch: feature/appwrite-progress-login

You can now paste this entire block into Codex or a GitHub issue for it to execute the implementation steps automatically.
