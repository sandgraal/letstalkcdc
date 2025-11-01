# Appwrite Login + Progress Persistence Integration

> **Hosting Note**: This project uses **GitHub Pages** for static site hosting and requires a separate serverless provider for the `migrateUser` function. See [docs/HOSTING.md](docs/HOSTING.md) for hosting platform details and setup instructions.

This adds persistent learning progress and authentication across devices to the CDC Playground.

## Setup

1. **Appwrite**

   - Create database `main`.
   - Import `appwrite.collections.json`.
   - Generate an API key with DB read/write.
   - Note your `APPWRITE_PROJECT`, `APPWRITE_ENDPOINT`, and key.

2. **Serverless Function Hosting & Local Development**
   
   The `migrateUser` serverless function needs to be hosted separately from the static site. Choose one of the following platforms:
   
   - **Vercel** (recommended): Deploy as API route (`api/migrateUser.js`)
   - **Cloudflare Workers**: Deploy as Worker function
   - **AWS Lambda**: Deploy with API Gateway
   - **Netlify**: Deploy using `netlify.toml` configuration (legacy option)
   
   See [docs/HOSTING.md](docs/HOSTING.md) for detailed setup instructions for each platform.

   Define the Appwrite environment variables in your chosen serverless platform and in any local `.env` file. Only the non-secret values are exposed to the browser—`APPWRITE_API_KEY` must remain server-side.

- **Keep your API key secret:** Never commit your `APPWRITE_API_KEY` to version control. Configure it via environment variables in your serverless platform or local `.env` file.
   | Variable | Scope | Notes |
   | --- | --- | --- |
   | `APPWRITE_ENDPOINT` | Client & Functions | Forwarded to the browser as `window.APPWRITE_ENDPOINT`. |
   | `APPWRITE_PROJECT` | Client & Functions | Forwarded to the browser as `window.APPWRITE_PROJECT`. |
   | `APPWRITE_DB_ID` | Client & Functions | Forwarded to the browser as `window.APPWRITE_DB_ID`. |
   | `COL_PROGRESS_ID` | Client & Functions | Forwarded to the browser as `window.COL_PROGRESS_ID`. |
   | `COL_EVENTS_ID` | Client & Functions | Forwarded to the browser as `window.COL_EVENTS_ID`. |
   | `APPWRITE_API_KEY` | **Functions only** | **SECRET** - Used by serverless function; never render this in templates or client bundles. |

   Populate those variables with the IDs that match your Appwrite project. Configure them in your chosen serverless platform's dashboard (e.g., Vercel environment variables, Cloudflare Workers secrets, AWS Lambda environment variables, or Netlify site settings).

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
   2. Add the following redirect URLs (adjust the domain to match production and local development):
      - `http://localhost:8080/?auth=success` (for Eleventy dev server)
      - `http://localhost:8080/?auth=failed`
      - `https://<your-production-domain>/?auth=success`
      - `https://<your-production-domain>/?auth=failed`
      - Include any additional preview/staging domains that should be allowed.
      - **Important:** the widget appends `?auth=…` to the *current page URL*, so Appwrite will receive the full path (e.g., `/journey/foo?auth=success`). Either whitelist every path your journeys use (Appwrite accepts wildcards like `https://<domain>/*`) or update the site code to redirect to a fixed callback path before initiating OAuth.
   3. Save and enable the provider.

   The progress widget constructs success/failure URLs by appending `?auth=success` or `?auth=failed` to the current page location, so each origin that serves the site must be explicitly whitelisted.

5. **Testing**

- Run locally with `npm run serve` (Eleventy dev server on port 8080).
- If testing serverless function locally, use your platform's local development tool (e.g., `vercel dev`, `netlify dev`, or `wrangler dev`).
- Confirm:
  - Anonymous session → creates progress doc.
  - OAuth login → runs migration via `migrateUser` serverless function.
  - Resume toast appears when returning to a journey.

  For local testing, create a `.env` file with the environment variables above. Start the dev server with `npm run serve` for the static site. For serverless function testing, use your platform's local development tool.

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

Test locally and on production.

Confirm both anonymous and authenticated users persist progress.

Definition of Done
✅ Appwrite collections created and imported.
✅ Environment variables configured in your serverless platform.
✅ Anonymous progress autosaves and syncs on login.
✅ OAuth login (GitHub) works end-to-end.
✅ Resume-progress toast visible.
✅ Tested and passing in production.
✅ PR ready to merge into main.

📍Repo: sandgraal/Lets-Talk-CDC-Change-Feed-Playground
📍Branch: feature/appwrite-progress-login

You can now paste this entire block into Codex or a GitHub issue for it to execute the implementation steps automatically.
