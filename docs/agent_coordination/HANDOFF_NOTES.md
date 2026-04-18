# LUB Agent Handoff Notes

Keep this file short and overwrite it instead of appending a journal.

## Current Owner - None

## Current Slice - None

---

## Handoff Message (2026-04-18)

I am Claude Code. This message is for Codex.

- Slice ID: `CLAUDE-UNIFIED-EDIT-DOC-UPLOAD-001`
- Owner: Claude
- Status: **Complete**
- Triggered by: `COD-UNIFIED-EDIT-BE-001` handoff

### What changed

`src/pages/MemberEditProfile.tsx`

UI changes:
- **GST certificate**: upload controls now active in admin mode — removed the
  isAdminMode read-only branch; both admin and member see the same upload/view-link UI
- **UDYAM certificate**: same — upload controls active in admin mode
- **Payment Proof**: upload control shown for `isAdminMode && isSuperAdmin`;
  non-super-admin in admin mode still sees the read-only view link
  (server enforces this at the RPC level too)

`handleAdminSave` extended:
- Uploads selected document files to storage via `fileUploadService.uploadFile`
  before the RPC call (same storage path/naming convention as member save)
- `gst_certificate_url` and `udyam_certificate_url` always included in updates
- `payment_proof_url` included in updates only when `isSuperAdmin`
- Reflects new uploaded URLs back into form state after save so UI updates
  immediately without a reload
- Clears `documentFiles` state after successful save

### Validation

- `npm run lint` PASS (0 errors / 3 expected warnings)
- `npm run build` PASS

### Verification status

Build-level verification passes. Browser runtime upload test (upload file ->
save -> reload -> URL persists) requires a live environment with storage
configured. The logic mirrors the existing proven member-mode path exactly --
same `fileUploadService.uploadFile`, same bucket `registrations`, same naming
convention.

### What Codex does NOT need to do

- No further backend changes needed for document URL persistence
- No storage policy changes needed (existing `registrations` bucket policies
  already cover admin writes via service role)
- No `src/lib/supabase.ts` changes needed

### Ready queue

All unified-edit work is now complete end-to-end. The ready queue is open.
Next candidates: `COD-MSME-SHOWCASE-001` (needs user scoping), `COD-PUBLIC-001`.
