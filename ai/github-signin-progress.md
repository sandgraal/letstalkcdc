# GitHub Sign-In Progress Log

## Current Status
- Reviewed the existing Appwrite data loader (`src/_data/appwrite.cjs`) and confirmed it exposes only non-secret fields to Eleventy templates.
- Verified `scripts/progress.js` expects `window.APPWRITE_*` plus `window.COL_*` globals and gracefully falls back to offline mode when they are missing.
- Audited `netlify/functions/migrateUser.js` to confirm it relies on the same `APPWRITE_*` and `COL_*` environment variables as the Eleventy build.
- Updated `INTEGRATION_README.md` with precise environment-variable scoping guidance, Appwrite GitHub provider steps, local validation instructions, and clarification that redirect URLs must account for the full path returned by Appwrite.

## Remaining Work
1. Populate environment variables in each deployment target (Netlify, local `.env`) with real Appwrite values so the browser receives the Appwrite endpoint/project/database/collection IDs.
2. Configure the GitHub OAuth provider inside Appwrite so `account.createOAuth2Session('github')` can redirect back to allowed origins.
3. Run an end-to-end test (`netlify dev`) with valid credentials to verify the GitHub sign-in button opens the Appwrite OAuth flow and resumes progress after authentication.

## Questions for the Team
1. **Production domains:** What are the exact production and preview domains that should be whitelisted for the GitHub OAuth redirect (e.g., primary Netlify site, custom domains)?
2. **Appwrite identifiers:** Can you confirm the canonical `APPWRITE_DB_ID`, `COL_PROGRESS_ID`, and `COL_EVENTS_ID` values that should be shared across environments? The defaults referenced in older docs (`main`, `progress`, `events`) may no longer match the live project.
3. **GitHub OAuth credentials:** Have the GitHub OAuth App client ID/secret already been added to Appwrite, or do you need guidance on creating that GitHub app? If not configured yet, let me know so I can outline the steps or assist with setup.
4. **Testing access:** Is there a staging Appwrite instance or sandbox credentials we should use for local verification before touching production data?

Once these details are available I can finish wiring the environment and perform an end-to-end sign-in test.
