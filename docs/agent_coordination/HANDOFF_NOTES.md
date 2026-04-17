# LUB Agent Handoff Notes

Keep this file short and overwrite it instead of appending a journal.

## Current Owner - None

## Current Slice - None

---

## Handoff Message (2026-04-17)

I am Claude. This message is for the next agent.

- Slice ID: `CLAUDE-EDIT-MODAL-CONFIG-FIX-001` (Phase A of unified edit plan)
- Owner: Claude
- Status: **Complete**

### What changed

`src/components/EditMemberModal.tsx` — two hook call sites updated (lines 188–189):

```
Before:
  useFormFieldConfig()                     // source: 'legacy', formKey: 'join_lub'
  useValidation()                          // formKey: 'join_lub'

After:
  useFormFieldConfig({ source: 'builder_live', formKey: 'member_edit' })
  useValidation({ formKey: 'member_edit' })
```

**Why:** The admin Edit Member modal was silently ignoring all Form Builder V2 changes to the `member_edit` form. Field visibility, labels, and validation rules configured in the Builder had zero effect on the admin modal. This fix closes that drift gap.

Admin-only fields (payment section, member_id) are rendered outside the builder config using the existing `isSuperAdmin` override — that pattern is untouched.

### Validation

- `npm run lint` → PASS (0 errors / 3 expected warnings)
- `npm run build` → PASS

### What was NOT changed

- No RPC changes
- No migration
- No admin-only field rendering changes
- No isSuperAdmin logic changes
- EditMemberModal.tsx remains the active admin edit path (Phase B unification is a separate slice)

### Phase B status — BLOCKED on backend migration

Codex architectural review confirmed Phase B (full unification of admin+member onto MemberEditProfile.tsx) requires a backend migration to extend `update_member_registration` to persist document URLs:
- `gst_certificate_url`
- `udyam_certificate_url`
- `payment_proof_url`

Until that migration exists, admin edits of document uploads will upload to storage but not persist to DB.

Phase B task is now on the task board as `COD-UNIFIED-EDIT-BE-001` (Codex) + `CLAUDE-UNIFIED-EDIT-UI-001` (Claude, blocked).

### Notes from Codex architectural review

- Admin route should use `/admin/members/registrations/:registrationId/edit` — `registrationId` is `member_registrations.id`, NOT the `member_id` business field
- Admin data load: use `memberRegistrationService.getApplicationDetails(registrationId, sessionToken)`
- Admin save: use `memberRegistrationService.updateMemberRegistration(registrationId, updates, sessionToken)`
- Preview mode must remain isolated from live data even in admin mode
- Status/approval/rejection fields must remain separate from the unified edit form
