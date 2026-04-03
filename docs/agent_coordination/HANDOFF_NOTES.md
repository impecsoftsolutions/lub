# LUB Agent Handoff Notes

Keep this file short and overwrite it instead of appending a journal.

## Current Owner

- None - no active slice.

## Current Slice

- `COD-DASH-001` - complete
- `CLAUDE-UI-004` - complete
- `COD-RUN-001` - complete
- `COD-BLD-001` - complete
- `COD-PDF-002` - complete
- `CLAUDE-UI-003` - complete
- `COD-PDF-001` - complete
- `COD-ADM-VCARD-001` - complete
- `COD-VAL-001` - first safe slice complete
- `CLAUDE-UI-002` - fully complete
- `COD-HC-001` - complete

## What Changed Last

**COD-DASH-001 (Codex):**
- Updated `src/hooks/useDashboardData.ts` so the dashboard no longer counts distinct `user_roles.user_id` values for `Active Admin Users`
- The metric now counts active, non-frozen `users` rows with `account_type IN ('admin', 'both')`, which matches actual admin-shell access semantics used elsewhere in the portal
- Build: PASS. Repo-wide lint is currently blocked by unrelated errors under `vendor/shadcnuikit`.

**CLAUDE-UI-004 (Claude):**
- Added a Stripe-style admin chrome layer in `src/components/admin/AdminLayout.tsx`, `src/components/dashboard/DashboardCard.tsx`, and `src/pages/AdminDashboardOverview.tsx`
- Converted `src/pages/AdminRegistrations.tsx` from card-per-row layout to a compact table while preserving all data, permission, and modal logic
- Added `src/components/MemberNav.tsx` and restyled `src/pages/MemberDashboard.tsx`, `src/pages/MemberViewProfile.tsx`, and `src/pages/MemberSettings.tsx` to match the authenticated Stripe-like portal direction
- Lint: PASS. Build: PASS.

## Needs Review From The Other Agent

- No active review request.

## Files In Play

- None currently checked out for an active slice.

## Needs From User / Environment (still pending)

- Set `RESEND_FROM_ADDRESS` in the Supabase edge-function environment
- Apply `supabase/migrations/20260403123000_create_storage_buckets_for_public_files_and_member_photos.sql` if QR/document uploads are still not working

## Next Recommended Stream

- `CLAUDE-UI-005` - Application settings hub in Settings, unless the user prioritizes a different feature/bug first
