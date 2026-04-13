# Session 70 - Preview Access Gate And Unpublish Backend Contracts

Date: 2026-04-09
Owner: Codex
Slice: COD-FB23-BE-001

## Summary
Implemented backend contracts for FB23 preview/publish hardening:
- Added explicit unpublish workflow via `_with_session` RPC (`unpublish_form_builder_v2_with_session`).
- Extended live publish origin contracts to include `unpublished` when live snapshot rows are removed.
- Changed public Signup V2 runtime config read (`get_signup_form_configuration_v2`) to live-snapshot-only (no draft fallback).
- Added draft-preview error classification in client service contract (`no_session`, `access_denied`, `load_failed`) for Claude's preview gate UX implementation.

## Files Changed
- `supabase/migrations/20260409182000_preview_unpublish_hardening.sql`
- `src/lib/supabase.ts`
- `docs/agent_coordination/TASK_BOARD.md`
- `docs/agent_coordination/HANDOFF_NOTES.md`
- `docs/CURRENT_STATE.md`
- `docs/session_documents/session_70_preview_access_gate_and_unpublish_backend_contracts.md`

## Validation Status
- `npm run db:migrations:audit` PASS
- `npm run db:migration:apply:single -- --version=20260409182000` PASS
- `npm run lint` PASS (0 errors / 3 expected warnings)
- `npm run build` PASS
- `npm run test:e2e:phase1:local` PASS (3 passed / 12 skipped)
- Runtime probe PASS: public RPC `get_signup_form_configuration_v2` returned live rows (`signup_live_field_count=3`).

## Remaining Risks
- Preview URL hard-block UX is not complete until Claude applies frontend gate in `SignUpV2.tsx`.
- Unpublish controls and badge/UI state for `unpublished` are pending Claude UI slices.
- Legacy seeded forms remain intentionally live until admin explicitly unpublishes.

## Next Recommended Stream
- Claude UI completion:
  1. `CLAUDE-FB23-GATE-001` (preview-mode access hard block, no fallback)
  2. `CLAUDE-FB23-UNPUB-001` (studio unpublish controls + unpublished state surfacing)
  3. `CLAUDE-FB23-STATUS-001` (status initialization clarity)
