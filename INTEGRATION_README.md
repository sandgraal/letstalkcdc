# Appwrite Login + Progress Persistence Integration

This adds persistent learning progress and authentication across devices to the CDC Playground.

## Setup

1. **Appwrite**

   - Create database `main`.
   - Import `appwrite.collections.json`.
   - Generate an API key with DB read/write.
   - Note your `APPWRITE_PROJECT`, `APPWRITE_ENDPOINT`, and key.

2. **Netlify & Local Development**
   Define the Appwrite environment variables both in Netlify and in any local `.env` file used by `netlify dev`. Only the non-secret values are exposed to the browser—`APPWRITE_API_KEY` must remain server-side.

   | Variable | Scope | Notes |
   | --- | --- | --- |
   | `APPWRITE_ENDPOINT` | Client & Functions | Forwarded to the browser as `window.APPWRITE_ENDPOINT`. |
   | `APPWRITE_PROJECT` | Client & Functions | Forwarded to the browser as `window.APPWRITE_PROJECT`. |
   | `APPWRITE_DB_ID` | Client & Functions | Forwarded to the browser as `window.APPWRITE_DB_ID`. |
   | `COL_PROGRESS_ID` | Client & Functions | Forwarded to the browser as `window.COL_PROGRESS_ID`. |
   | `COL_EVENTS_ID` | Client & Functions | Forwarded to the browser as `window.COL_EVENTS_ID`. |
   | `APPWRITE_API_KEY` | **Functions only** | Consumed by Netlify functions; never render this in templates or client bundles. |

   Populate those variables with the IDs that match your Appwrite project. Netlify deploy contexts inherit the same keys, so set them in the “Site settings → Environment variables” UI or via `netlify env:set`.

3. **Eleventy**

- Include `/scripts/progress.js` in all journey layouts.
- Eleventy reads the Appwrite variables via `src/_data/appwrite.cjs` and injects the non-secret values as `window.APPWRITE_*` and `window.COL_*` globals. No additional build wiring is required.
- Call:
  ```js
  CDCProgress.onStepChange({ journeySlug, step, percent, state });
  ```
  whenever a user moves to a new step.

4. **GitHub OAuth provider in Appwrite**

   In the Appwrite Console → **Authentication → Providers → GitHub**:

   1. Supply the GitHub OAuth App Client ID and Client Secret.
   2. Add the following redirect URLs (adjust the domain to match production and previews):
      - `http://localhost:8888/?auth=success`
      - `http://localhost:8888/?auth=failed`
      - `https://<your-production-domain>/?auth=success`
      - `https://<your-production-domain>/?auth=failed`
      - Include any additional Netlify preview domains that should be allowed.
      - **Important:** the widget appends `?auth=…` to the *current page URL*, so Appwrite will receive the full path (e.g., `/journey/foo?auth=success`). Either whitelist every path your journeys use (Appwrite accepts wildcards like `https://<domain>/*`) or update the site code to redirect to a fixed callback path before initiating OAuth.
   3. Save and enable the provider.

   The progress widget constructs success/failure URLs by appending `?auth=success` or `?auth=failed` to the current page location, so each origin that serves the site must be explicitly whitelisted.

5. **Testing**

- Run locally with `netlify dev`.
- Confirm:
  - Anonymous session → creates progress doc.
  - OAuth login → runs migration via `migrateUser.js`.
  - Resume toast appears when returning to a journey.

  For local testing, create a `.env` file that mirrors the Netlify environment variables above. Start the dev server with `netlify dev` so that the serverless functions receive the same configuration.

6. **Deploy**

- Commit to `feature/appwrite-progress-login`.
- Push and verify deploy preview.
- Merge to `main` once verified.

Ensure Eleventy wiring:

Journey templates import /scripts/progress.js.

Netlify functions rely on the built-in Fetch API and no longer require the `node-appwrite` SDK dependency.

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
