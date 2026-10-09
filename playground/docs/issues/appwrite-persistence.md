# Issue (closed, superseded): Appwrite-backed persistence for scenarios and telemetry

> **2026-10: closed as superseded.** Persistence shipped on Supabase, not Appwrite. See [`../supabase-setup.md`](../supabase-setup.md) for the tables, policies and share-link function. The task list below is history, not open work, and the Appwrite console steps in the 2026-06 update no longer apply. No Appwrite code remains in the playground.

> **Update (2026-06):** the client integration is repaired (#285) and the required collections/attributes/permissions are now documented in [`../supabase-setup.md`](../supabase-setup.md). That covers the "document required schemas" item; the open work is the `scenarios` serialization change (Option A/B in that doc) so snapshots persist, plus configuring the collections in the Appwrite console.

## Summary
Implement persistent storage powered by Appwrite so that simulator scenarios, configuration, and comparator telemetry survive page reloads and can be shared across sessions.

## Motivation
The playground currently relies on in-memory helpers, preventing users from saving progress or collecting long-lived metrics. Shipping persistence unblocks roadmap items such as shared scenarios and reliable telemetry review.

## Task Checklist
- [ ] Evaluate Appwrite collections for storing scenarios, presets, and session telemetry; document required schemas.
- [ ] Add client configuration + environment wiring (local `.env`, production secrets) with clear onboarding docs.
- [ ] Implement persistence adapters in the simulator/comparator to read/write scenarios and telemetry through Appwrite.
- [ ] Update feature flags or guards to expose persistence-backed flows behind a controllable rollout flag.
- [ ] Extend unit/integration coverage to cover persistence adapters and fallback behaviour when Appwrite is unavailable.
- [ ] Refresh docs (README, `docs/next-steps.md`, onboarding) with persistence setup and troubleshooting guidance.

## Testing Notes
- Run existing unit + e2e suites to ensure no regression (`npm run test:unit`, `npm run test:e2e`).
- Add targeted integration smoke that exercises save/load flows against a local Appwrite instance.

## Related Resources
- `src/features/scenarios.ts` (scenario gallery definitions)
- `src/engine/metricsStore.ts` (telemetry buffer)
- `docs/next-steps.md` (outstanding persistence note)
