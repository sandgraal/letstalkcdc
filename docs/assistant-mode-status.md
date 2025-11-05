# Lightweight Assistant Mode Status

This document records the current implementation details for the "Lightweight Assistant Mode" feature that was requested in the prior automation instructions, and highlights remaining follow-up work.

## Implemented items

- **Knowledge base** – `src/data/assistant.yml` was added with six intents covering CDC basics, lag handling, snapshot strategy, offset management, agent sizing, and schema changes. Each intent defines trigger phrases, an answer, and related documentation links. 【F:src/data/assistant.yml†L1-L48】
- **Client bundle assets** – Front-end helper files were introduced: `src/js/appwrite-config.js` (Appwrite SDK bootstrap) and `src/js/assistant.js` (UI logic) together with the styling in `src/css/assistant.css`. The assistant module loads the YAML-derived JSON, matches intents, renders the answer card, and captures feedback with an Appwrite write-through plus local-storage fallback that now replays queued entries when connectivity returns. 【F:src/js/appwrite-config.js†L1-L45】【F:src/js/assistant.js†L1-L156】【F:src/css/assistant.css†L1-L36】
- **Runtime Appwrite wiring** – The Eleventy data cascade now surfaces the assistant feedback collection ID so the base layout exposes `window.COL_ASSISTANT_ID`, and the Appwrite bootstrap respects the runtime configuration before attempting a CDN import. Missing configuration keeps the assistant in offline mode. 【F:src/_data/appwrite.cjs†L1-L16】【F:src/_includes/layouts/base.njk†L154-L177】【F:src/js/appwrite-config.js†L1-L45】
- **Layout wiring** – The base layout includes the floating action button, response panel, stylesheet, and module script near the end of the document so the assistant UI appears on all pages. 【F:src/_includes/layouts/base.njk†L169-L176】
- **Eleventy build output** – `eleventy.config.cjs` gained a lightweight parser that converts `src/data/assistant.yml` to `_site/data/assistant.json` after each build, ensuring the front-end fetch call resolves even without Eleventy’s automatic YAML-to-JSON promotion. 【F:eleventy.config.cjs†L1-L141】

## Outstanding follow-ups

1. **Appwrite collection provisioning** – The repository does not include the infrastructure change that creates the `assistant_feedback` collection with the required attributes and permissions. Provisioning needs to be completed in Appwrite and documented (e.g., exported schema or setup instructions).
2. **Content governance** – If additional intents or editing guidelines are expected, extend the YAML file and add contributor documentation (e.g., in `AI-CONTRIBUTING.md`) so future updates stay consistent with the lightweight assistance charter.
3. **QA coverage** – No automated tests or CI checks were added for the assistant flow. Consider adding a Pa11y scenario or unit tests to ensure the button renders and that `assistant.json` is produced during builds.

Updating these items will bring the Lightweight Assistant Mode into a production-ready state.
