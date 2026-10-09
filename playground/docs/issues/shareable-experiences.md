# Issue: Persistent scenarios & shareable experience enhancements

> **2026-10: partly superseded.** The Appwrite realtime item now runs on Supabase Realtime, not Appwrite. See [`../supabase-setup.md`](../supabase-setup.md). The other items are unchanged.

## Summary
Deliver the longer-term roadmap items around persistent scenarios, Appwrite realtime sync, and shareable links for comparator sessions.

## Motivation
These enhancements extend the playground beyond single-session demos, enabling teams to collaborate asynchronously and embed guided tours in documentation.

## Task Checklist
- [ ] Prototype realtime sync to broadcast scenario changes across clients. Realtime is now Supabase Realtime over the `events` table (see [`../supabase-setup.md`](../supabase-setup.md)); no Appwrite code remains.
- [ ] Design persistent scenario model (naming, access control) and implement CRUD flows in the simulator/comparator.
- [ ] Add deep-link/shareable URLs that encode scenario + flag state, with validation for stale links.
- [ ] Update UI affordances (save/share buttons, toasts) with accessibility considerations.
- [ ] Document new capabilities in README, docs/enablement materials, and support macros.
- [ ] Evaluate telemetry to measure adoption and gather feedback for follow-up iterations.

## Testing Notes
- Extend unit + E2E suites to cover save/share flows.
- Add integration smoke for realtime sync (multi-client simulation) if feasible.

## Related Resources
- `docs/next-steps.md`
- `src/features/scenarios.ts`
- `assets/app.js` (bootstrap + flag wiring)
