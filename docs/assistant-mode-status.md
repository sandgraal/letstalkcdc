# Lightweight Assistant Mode Status

This document records the current implementation details for the "Lightweight Assistant Mode" feature that was requested in the prior automation instructions, and highlights remaining follow-up work.

## Implemented items

- **Knowledge base** – `src/data/assistant.yml` was added with six intents covering CDC basics, lag handling, snapshot strategy, offset management, agent sizing, and schema changes. Each intent defines trigger phrases, an answer, and related documentation links. 【F:src/data/assistant.yml†L1-L48】
- **Client bundle assets** – Front-end helper files were introduced: `src/js/appwrite-config.js` (Appwrite SDK bootstrap) and `src/js/assistant.js` (UI logic) together with the styling in `src/css/assistant.css`. The assistant module loads the YAML-derived JSON, matches intents, renders the answer card, and captures feedback with an Appwrite write-through plus local-storage fallback that now replays queued entries when connectivity returns. 【F:src/js/appwrite-config.js†L1-L45】【F:src/js/assistant.js†L1-L156】【F:src/css/assistant.css†L1-L36】
- **Runtime Appwrite wiring** – The Eleventy data cascade now surfaces the assistant feedback collection ID so the base layout exposes `window.COL_ASSISTANT_ID`, and the Appwrite bootstrap respects the runtime configuration before attempting a CDN import. Missing configuration keeps the assistant in offline mode. 【F:src/_data/appwrite.cjs†L1-L16】【F:src/_includes/layouts/base.njk†L154-L177】【F:src/js/appwrite-config.js†L1-L45】
- **Layout wiring** – The base layout includes the floating action button, response panel, stylesheet, and module script near the end of the document so the assistant UI appears on all pages. 【F:src/_includes/layouts/base.njk†L169-L176】
- **Eleventy build output** – `eleventy.config.cjs` gained a lightweight parser that converts `src/data/assistant.yml` to `_site/data/assistant.json` after each build, ensuring the front-end fetch call resolves even without Eleventy’s automatic YAML-to-JSON promotion. 【F:eleventy.config.cjs†L1-L141】
- **Appwrite schema + setup guide** – The exported infrastructure manifest now declares an `assistant_feedback` collection with schema matching the front-end payloads, and a companion runbook explains how to import it into Appwrite along with the required permissions. 【F:appwrite.collections.json†L1-L118】【F:docs/assistant-feedback-setup.md†L1-L89】
- **Contributor guidance** – `AI-CONTRIBUTING.md` now documents how to extend the assistant knowledge base responsibly, including linting expectations and review checkpoints. 【F:AI-CONTRIBUTING.md†L1-L226】
- **QA coverage** – The smoke test inspects the generated assistant JSON file and verifies that the homepage ships the trigger button and module script, catching regressions in future builds. 【F:scripts/smoke.mjs†L1-L152】

## Manual steps remaining

1. **Provision and permit the Appwrite collection** – Follow the instructions in `docs/assistant-feedback-setup.md` to import the new schema (or create it manually), grant public create access, and capture an API key or anonymous session strategy if stricter permissions are required.
2. **Configure runtime environment** – Populate `APPWRITE_ENDPOINT`, `APPWRITE_PROJECT`, `APPWRITE_DB_ID`, and `COL_ASSISTANT_ID` in the deployment environment so the browser client can submit feedback. Without these values the assistant will remain in local-only mode.

Once these deployment tasks are complete the Lightweight Assistant Mode will be production ready.
