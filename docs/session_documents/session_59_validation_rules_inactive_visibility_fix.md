# Session 59 - Validation Rules Inactive Visibility Fix

## Summary

Fixed the Validation Settings bug where toggled rules appeared to disappear.

Key result:
- Rules are not deleted when toggled inactive.
- Admin Validation Settings now loads active + inactive rules through a session-based RPC, so deactivated rules remain visible/manageable.

## Root Cause

The admin page previously read `validation_rules` via direct table select in the browser client.
RLS public read policy exposes only `is_active = true` rows, so inactive rules were hidden from the admin list after toggle.

## Evidence

DB checks before fix:
- `validation_rules` totals: `total=7, active=4, inactive=3`
- `name format` rule existed with `is_active=false`

## Files Changed

- `supabase/migrations/20260405233000_add_validation_rules_admin_read_rpc_with_session.sql`
- `src/lib/supabase.ts`
- `docs/agent_coordination/TASK_BOARD.md`
- `docs/agent_coordination/HANDOFF_NOTES.md`
- `docs/CURRENT_STATE.md`
- `docs/session_documents/session_59_validation_rules_inactive_visibility_fix.md`

## Migration Applied

- `20260405233000_add_validation_rules_admin_read_rpc_with_session.sql`
- Applied with safe single-migration command:
  - `npm run db:migration:apply:single -- --version=20260405233000`

## Validation Status

- `npm run lint`: PASS (0 errors, 3 expected warnings)
- `npm run build`: PASS
- `npm run test:e2e:phase1:local`: PASS (3 passed / 12 skipped)
- RPC verification: `get_validation_rules_with_session` returns both active and inactive rows.

## Remaining Risks

- UI still relies on category expansion state for discoverability; users may need category open to see deactivated rules.
- Larger form-architecture refactor (`COD-FORM-ARCH-001`) remains pending by product decision.

## Next Recommended Stream

1. Verify with admin user in UI: toggle a rule inactive and confirm it remains visible as `Inactive`.
2. Continue with `COD-FORM-ARCH-001` once approved.
