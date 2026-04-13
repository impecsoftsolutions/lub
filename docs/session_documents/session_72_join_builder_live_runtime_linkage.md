# Session 72 - Join Builder Live Runtime Linkage

Date: 2026-04-09  
Owner: Codex  
Slice: COD-JOIN-FORM-002

## Summary
- Linked Join runtime to Form Builder published live schema (`join_lub`) instead of relying only on legacy `form_field_configurations`.
- Added a new public live-read RPC for Join:
  - `get_join_form_configuration_v2()`
- Added a live validation lookup RPC so Join validation can resolve active rules from Builder live snapshot:
  - `get_form_field_validation_rule_v2(p_form_key, p_field_key)`
- Updated frontend runtime wiring:
  - `Join.tsx` now reads visibility/required state from Builder live via hook options.
  - `useFormFieldConfig` now supports source-aware loading (`legacy` or `builder_live`) with legacy default preserved.
  - `validationService.validateByFieldName()` now prefers Builder live mapping for Join and safely falls back to legacy mapping when needed.

## Files Changed
- `supabase/migrations/20260410004500_add_join_form_builder_runtime_read_contract.sql`
- `src/lib/supabase.ts`
- `src/hooks/useFormFieldConfig.ts`
- `src/lib/validation.ts`
- `src/pages/Join.tsx`
- `docs/agent_coordination/TASK_BOARD.md`
- `docs/CURRENT_STATE.md`
- `docs/agent_coordination/HANDOFF_NOTES.md`
- `docs/session_documents/session_72_join_builder_live_runtime_linkage.md`

## Validation Status
- `npm run db:migrations:audit` PASS
- `npm run db:migration:apply:single -- --version=20260410004500` PASS
- Runtime RPC probes PASS:
  - `get_join_form_configuration_v2` returns 41 fields
  - `get_form_field_validation_rule_v2('join_lub','pin_code')` returns active rule mapping
- `npm run lint` PASS (0 errors / 3 expected warnings)
- `npm run build` PASS
- `npm run test:e2e:phase1:local` PASS (3 passed / 12 skipped)

## Remaining Risks
- Join page remains structurally legacy UI (static JSX layout) while config/validation reads now come from Builder live contracts.
- Preview parity for Join in Studio is still not enabled (currently preview button supports Signup and Sign-In).
- Legacy individual form configuration pages are still intentionally retained during UAT.

## Next Recommended Stream
1. Continue `COD-FORMS-PORTAL-001` with full cross-form verification (signup/signin/join live + publish/unpublish + validation mapping consistency).
2. Decide deprecation timing for legacy individual form config pages after UAT sign-off.
3. Then resume non-form ready queue (`COD-USR-001`, `COD-PUBLIC-001`).

