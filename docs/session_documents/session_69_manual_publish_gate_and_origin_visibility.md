# Session 69 - Manual Publish Gate And Origin Visibility

Date: 2026-04-09
Owner: Codex
Slice: COD-PUBLISH-001

## Summary
Implemented strict manual publish hardening so live form snapshots cannot be changed without explicit publish action, and added admin-visible publish-origin metadata:
- Live snapshot table writes are now blocked unless publish RPC sets an explicit publish context.
- Added `_with_session` publish-status read RPCs for builder/studio surfaces.
- Builder and Studio now show whether live state is from manual publish, legacy seeded bootstrap, or not yet published.
- Legacy individual form config pages were intentionally kept (UAT deferment decision).

## Files Changed
- `supabase/migrations/20260409133000_manual_publish_gate_and_origin_visibility.sql`
- `src/lib/supabase.ts`
- `src/pages/AdminFormBuilderV2.tsx`
- `src/pages/AdminFormStudio.tsx`
- `docs/agent_coordination/TASK_BOARD.md`
- `docs/agent_coordination/HANDOFF_NOTES.md`
- `docs/CURRENT_STATE.md`

## Validation Status
- Migration safety:
  - `npm run db:migrations:audit` executed before apply.
  - `npm run db:migration:apply:single -- --version=20260409133000` applied successfully.
- Functional guard verification:
  - direct SQL `UPDATE` attempt on `public.form_config_v2_live_fields` now fails with guard exception outside publish context.
- Build/lint/smoke:
  - `npm run lint` PASS (0 errors, 3 expected shadcn warnings)
  - `npm run build` PASS
  - `npm run test:e2e:phase1:local` PASS (3 passed / 12 skipped)

## Remaining Risks
- Existing seeded historical rows keep `live_published_by = NULL`; UI now marks these as `Legacy seeded` for transparency.
- Public runtime still intentionally reads live snapshot only; draft remains studio-only unless preview route/session contract is used.
- Legacy individual config pages are still accessible until UAT sign-off by product decision.

## Next Recommended Stream
1. COD-USR-001: investigate and fix admin user edit persistence, then align Edit User modal with active appearance styling.
2. After UAT sign-off on Builder/Studio: execute deferred removal slice for legacy individual form pages (`COD-FORM-DEPRECATE-001`).
