# Lightweight Assistant Mode Status

This document records the current implementation details for the "Lightweight Assistant Mode" feature that was requested in the prior automation instructions, and highlights remaining follow-up work.

## Implemented items

- **Knowledge base** – `src/data/assistant.yml` was added with six intents covering CDC basics, lag handling, snapshot strategy, offset management, agent sizing, and schema changes. Each intent defines trigger phrases, an answer, and related documentation links. 【F:src/data/assistant.yml†L1-L48】
- **Client bundle assets** – Front-end helper files were introduced: `src/js/appwrite-config.js` (Appwrite SDK bootstrap) and `src/js/assistant.js` (UI logic) together with the styling in `src/css/assistant.css`. The assistant module loads the YAML-derived JSON, matches intents, renders the answer card, and captures feedback with an Appwrite write-through plus local-storage fallback. 【F:src/js/appwrite-config.js†L1-L20】【F:src/js/assistant.js†L1-L83】【F:src/css/assistant.css†L1-L36】
- **Layout wiring** – The base layout includes the floating action button, response panel, stylesheet, and module script near the end of the document so the assistant UI appears on all pages. 【F:src/_includes/layouts/base.njk†L169-L176】
- **Eleventy build output** – `eleventy.config.cjs` gained a lightweight parser that converts `src/data/assistant.yml` to `_site/data/assistant.json` after each build, ensuring the front-end fetch call resolves even without Eleventy’s automatic YAML-to-JSON promotion. 【F:eleventy.config.cjs†L1-L141】

## Outstanding follow-ups

1. **Real Appwrite configuration** – `src/js/appwrite-config.js` still contains placeholder endpoint, project, database, and collection IDs plus a CDN-based dynamic import. These values must be replaced with environment-aware configuration and ideally gated behind Eleventy data so production builds receive real credentials while development stays in offline mode.
2. **Appwrite collection provisioning** – The repository does not include the infrastructure change that creates the `assistant_feedback` collection with the required attributes and permissions. Provisioning needs to be completed in Appwrite and documented (e.g., exported schema or setup instructions).
3. **Telemetry persistence review** – Because the current client script falls back to local storage when Appwrite is unavailable, you should add an export or sync path so saved feedback can be reported or replayed later. Documenting the manual retrieval process would keep the mode auditable.
4. **Content governance** – If additional intents or editing guidelines are expected, extend the YAML file and add contributor documentation (e.g., in `AI-CONTRIBUTING.md`) so future updates stay consistent with the lightweight assistance charter.
5. **QA coverage** – No automated tests or CI checks were added for the assistant flow. Consider adding a Pa11y scenario or unit tests to ensure the button renders and that `assistant.json` is produced during builds.

Updating these items will bring the Lightweight Assistant Mode into a production-ready state.
