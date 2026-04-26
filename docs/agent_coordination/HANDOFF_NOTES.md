# LUB Agent Handoff Notes

Keep this file short and overwrite it instead of appending a journal.

## Current Owner - None

## Current Slice - None

---

## Handoff State (2026-04-26)

No active handoff. `CLAUDE-SMART-UPLOAD-GST-CANDIDATES-017` is closed.

### Closed Slice Summary
- Smart Upload now renders `Import Data` below the queued/uploaded document list.
- `extract-document` now returns optional `field_options`; GST extraction includes Trade/Legal company-name candidates and GST `full_name` fallback.
- Aadhaar remains higher priority for identity fields, so GST `full_name` only prefills when Aadhaar identity is absent.

### Runtime Deployed / Verified
- `supabase functions deploy extract-document` -> PASS.
- Live invoke with `C:\Users\Yogi\Downloads\AA370425004153O_RC07042025.pdf` -> PASS:
  - HTTP 200
  - `is_readable: true`
  - `detected_type: gst_certificate`
  - `extracted_fields.company_name: D S R CASHEWS` (Trade Name default)
  - `extracted_fields.full_name: DOKI SANKARA RAO HUF`
  - `field_options.company_name`: Trade + Legal options present

### Validation
- `npm run lint` -> PASS (`0 errors / 3 expected warnings`)
- `npm run build` -> PASS
- `npm run test:e2e:phase1:local` -> PASS (`3 passed / 12 skipped`)

### Remaining
None for this slice.

---

## Coordination Update (2026-04-26)

- Commit policy is now strict slice-manifest staging for both Codex and Claude:
  - Stage only files that belong to the active slice handoff/manifest.
  - Do not use `git add .` in this repository while the worktree is dirty.
  - Before commit, verify staged scope with `git diff --cached --name-only`.
  - Keep one commit per slice (or explicit docs-closeout companion commit).
