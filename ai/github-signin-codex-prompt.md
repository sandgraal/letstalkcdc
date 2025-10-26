# GitHub Sign-In Enablement Prompt

You are gpt-5-codex, an autonomous coding agent working in the `letstalkcdc` repository. Always work on a dedicated feature branch and push incremental commits when logical tasks are complete.

## Goal
Enable GitHub OAuth sign-in by wiring Appwrite credentials through the Eleventy build and confirming Appwrite is configured for the GitHub provider.

## Context
- The front-end component `CDCProgress` only initializes the Appwrite SDK when all `window.APPWRITE_*` globals are defined. Without them, the GitHub button shows "Offline progress only" and does nothing.
- Eleventy injects those globals from environment variables at build time. Missing variables leave the SDK uninitialized.
- The click handler invokes `account.createOAuth2Session('github', ...)`, delegating to Appwrite's GitHub OAuth configuration. Redirect URLs must match the deployed origin.

Reference files:
- `src/_data/appwrite.js`
- `src/js/progress/index.ts`
- `netlify/functions/` for any serverless requirements
- `INTEGRATION_README.md` for Appwrite setup steps.

## Directives
1. **Environment Wiring**
   - Confirm which `APPWRITE_*` variables are read during the Eleventy build and Netlify function execution.
   - Update configuration or documentation so the deployment defines:
     - `APPWRITE_ENDPOINT`
     - `APPWRITE_PROJECT`
     - `APPWRITE_DB_ID`
     - `COL_PROGRESS_ID`
     - `COL_EVENTS_ID`
     - `APPWRITE_API_KEY`
   - Ensure only the non-secret values above (`ENDPOINT`, `PROJECT`, `DB_ID`, `COL_*`) are emitted as `window.APPWRITE_*` globals for the browser.
   - Keep `APPWRITE_API_KEY` scoped to serverless functions (e.g., Netlify) and explicitly warn against exposing it in client-side bundles or globals.

2. **Netlify Functions**
   - Verify Netlify functions that depend on Appwrite use the same environment variables. Align naming if discrepancies exist.

3. **Appwrite Project Setup**
   - Document or script the necessary Appwrite configuration, including enabling the GitHub OAuth provider with redirect URLs for local development and production.
   - Capture any collection IDs or secrets required by the front-end or Netlify functions.

4. **Validation**
   - Add automated checks or documentation steps describing how to verify the button now launches the Appwrite GitHub OAuth flow (e.g., by running the site locally with populated `.env` values).

5. **Communication**
   - Stop only when you need user input, encounter a blocking external dependency (e.g., lacking real credentials), or when manual secrets provisioning is required.
   - Summarize progress and outstanding actions in commit messages and the final pull request description.

## Deliverables
- Code and configuration updates that ensure the front end receives Appwrite credentials at build time.
- Documentation updates that explain required environment variables, noting the API key must remain server-side, and Appwrite provider setup.
- Tests or manual verification notes demonstrating the GitHub button now triggers Appwrite OAuth when credentials are supplied.

