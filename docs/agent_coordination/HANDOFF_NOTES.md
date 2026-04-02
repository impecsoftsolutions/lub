# LUB Agent Handoff Notes

Keep this file short and overwrite it instead of appending a journal.

## Current Owner

- None - no active slice.

## Current Slice

- `CLAUDE-UI-002` - fully complete
- `COD-HC-001` - complete
- payment-settings follow-up - complete

## What Changed Last

**CLAUDE-UI-002 (Claude):**
- `src/hooks/useOrganisationProfile.ts` - new shared hook with module-level cache
- `src/components/Footer.tsx` - org name, email, website, and copyright year all come from org profile
- `src/pages/SignIn.tsx` - suspended-account message uses `profile.email_address`
- `src/pages/AdminStateManagement.tsx` - Manage Locations route fixed
- `src/pages/AdminProfileSettings.tsx` - website field added in the Contact section
- Lint: PASS. Build: PASS.

**COD-HC-001 (Codex):**
- `supabase/migrations/20260403110000_add_organization_website_to_profile.sql` added and applied
- `src/lib/supabase.ts` - `OrganizationProfile` now includes `organization_website?: string`
- `src/lib/emailService.ts` - removed hardcoded personal mobile fallback; fallback now uses org-profile contact number
- `supabase/functions/send-email/index.ts` - now requires `RESEND_FROM_ADDRESS`
- `tests/e2e/helpers/auth.ts` - smoke admin credentials now resolve from env vars or `lub-private/phase1-smoke-admin.json`
- `package.json` - removed embedded admin email/mobile from active smoke scripts
- Verification: `npm run lint`, `npm run build`, `npm run test:e2e:phase1:local` all pass

**Payment settings follow-up (Codex):**
- `supabase/migrations/20260403123000_create_storage_buckets_for_public_files_and_member_photos.sql` added to provision `public-files` and `member-photos` storage buckets with upload/read policies
- `supabase/migrations/20260403133000_add_delete_payment_settings_with_session.sql` added and applied
- `src/pages/AdminDashboard/PaymentSettings.tsx` now exposes a guarded Delete action inside edit mode
- Verification: `npm run lint` and `npm run build` pass

## Needs Review From The Other Agent

- No active review request.

## Files In Play

- None currently checked out for an active slice.

## Needs From User / Environment (still pending)

- Set `RESEND_FROM_ADDRESS` in the Supabase edge-function environment
- Apply `supabase/migrations/20260403123000_create_storage_buckets_for_public_files_and_member_photos.sql` if QR/document uploads are still not working in the real environment

## Next Recommended Stream

- `COD-VAL-001` - Validation-consumption cleanup (Codex-owned, already in Ready queue)
