# Session 63 - Form Builder Re-add Restore Fix

## Summary

Completed a backend-safe fix for the Form Builder bug where deleting a field and adding the same field again failed with:

`duplicate key value violates unique constraint "idx_form_config_v2_fields_form_field_key"`

Root cause was soft-delete behavior (`is_deleted=true`) combined with a unique index on `(form_id, field_key)` while the create RPC always inserted a new row.

Fix implemented by restoring the existing soft-deleted row in the same form instead of inserting a duplicate row.

Also completed and stabilized the in-progress Add Existing Field type-override wiring in the Form Builder UI.

## Files Changed

- `supabase/migrations/20260406102000_fix_form_builder_readd_soft_deleted_fields.sql`
- `src/pages/AdminFormBuilderV2.tsx`
- `docs/agent_coordination/TASK_BOARD.md`
- `docs/agent_coordination/HANDOFF_NOTES.md`
- `docs/CURRENT_STATE.md`

## Validation Status

- `npm run lint`: PASS (0 errors, 3 expected warnings)
- `npm run build`: PASS
- `npm run test:e2e:phase1:local`: PASS (3 passed / 12 skipped)
- `npm run db:migrations:audit`: PASS
- `npm run db:migration:apply:single -- --version=20260406102000`: PASS

## Remaining Risks

- Form Builder currently allows field type override at add-time; product may later decide to lock type to canonical template.
- Field-library data is still derived from legacy + V2 live sources (not yet a dedicated canonical library table).
- Backlog local-only migrations intentionally remain unapplied; continue single-version safe migration flow.

## Next Recommended Stream

- Add governed canonical Field Library management (template CRUD + controlled assignment to forms), then optionally remove type override in per-form add flow.
