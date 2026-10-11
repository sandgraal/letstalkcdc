---
paths:
  - "playground/**"
---

<!-- Applies to: playground/** -->

# Playground rules

- `playground/` is a separate app with its **own** `package.json` and
  lockfile, TypeScript, vitest/jest configs and Playwright setup. Install and
  run inside it (`cd playground && npm ci`); the root `npm test` does not
  cover it. Prettier and root ESLint ignore it.
- The built bundles in `playground/assets/generated/` are **committed**. After
  changing `playground/src`, `web` or `sim`, rebuild (`npm run build` in
  `playground/`) and commit the output; `npm run check:bundles` and the
  `playground-generated-bundles` workflow fail when they disagree.
- Publishing is a plain copy: `scripts/publish-playground.sh` copies
  `playground/` into `_site/playground/` after `npm run build`, and
  `scripts/render-playground-html.mjs` fills the `__SITE_URL__` placeholders
  in `index.html`. Never hand-edit `_site/playground/`.
- Scenarios are data (`playground/scenarios/`, `assets/shared-scenarios.js`);
  `npm run lint:scenarios` checks them. Seed rows have one source of truth.
- CI: `playground-preflight.yml` (build, bundle check, scenario lint, sim and
  e2e tests, harness), `playground-generated-bundles.yml`,
  `playground-harness-nightly.yml`; the main `ci.yml` e2e job also publishes
  and audits the playground for contrast.
- The playground teaches the same thesis as the site (`.claude/rules/content.md`).
  It writes to Supabase tables `events` and `scenarios`, which belong to the
  playground, not to the site: do not change their schema from here.
- Docs inside `playground/` (`README.md`, `docs/`) are its own; keep their
  links and wording accurate when you touch them.
