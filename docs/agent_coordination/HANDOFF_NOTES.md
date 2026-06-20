# LUB Agent Handoff Notes

Overwrite this file each session; do not append a running journal.

## Current Owner

No active implementation slice.

## Latest Closed Slices

### COD-AUTH-RESET-PGCRYPTO-SEARCH-PATH-002
- **Status:** Closed
- **Branch / Commit:** `feature/ux-sprint-1` / hotfix commit (2026-06-20)
- **Summary:** Fixed reset-link validation after the live Set Password page showed `Unable to validate reset link.` The RPC failed only for real-length reset tokens because `validate_member_password_token` called `digest(...)` while its search path only included `public`; this Supabase project exposes `pgcrypto` from `extensions`.
- **Validation:** Migration applied to the linked DB. A browser-callable RPC probe with a 64-character dummy token now returns normal JSON `{ success: false, error_code: "token_invalid" }` instead of PostgREST error `function digest(text, unknown) does not exist`.
- **Files:** `supabase/migrations/20260620113000_fix_password_auth_pgcrypto_search_path.sql`

### COD-AUTH-UNIVERSAL-PASSWORD-001
- **Status:** Closed
- **Branch / Commit:** `feature/ux-sprint-1` / `cdff1ef` (2026-06-20)
- **Summary:** Reintroduced password auth on top of the existing custom-session model. New signup users provide a fixed Password field outside the dynamic signup payload. Sign-in now uses one Email or Mobile Number field plus Password. Forgot/reset password pages are active. A new `request-password-reset` Edge Function creates server-side reset tokens and emails reset links through the existing Resend `send-email` function.
- **Backend details:** New migration adds `users.password_set_at`, backfills only bcrypt hashes (`$2%`), creates `member_password_tokens` with hashed tokens only, replaces `create_portal_user_with_session_v2` with a password-aware signature, adds `sign_in_with_password`, and adds token validation/completion RPCs. The login RPC short-circuits passwordless/placeholder hashes before calling `verify_password` and preserves locked/suspended/inactive/frozen/deactivated-member gates.
- **Validation:** lint PASS (0 errors / 3 expected warnings), build PASS, migration audit PASS. Migration `20260620103000` is applied to the linked DB and `request-password-reset` Edge Function is deployed.
- **Deployment note:** The migration keeps the existing 6-arg signup RPC and adds the password-aware overload, so currently deployed signup callers remain compatible while the new frontend can pass `p_password`.
- **Files:** `src/pages/SignIn.tsx`, `src/pages/SignUpV2.tsx`, `src/pages/ForgotPassword.tsx`, `src/pages/ResetPassword.tsx`, `src/lib/customAuth.ts`, `src/lib/memberAuth.ts`, `src/lib/passwordReset.ts`, `supabase/functions/request-password-reset/index.ts`, `supabase/migrations/20260620103000_universal_password_auth.sql`

### COD-MEMBER-WELCOME-MESSAGE-AI-001
- **Status:** Closed
- **Branch / Commit:** `feature/ux-sprint-1` / `d05e2a1` (2026-06-14)
- **Summary:** Admin Member Registrations now includes a `Generate Welcome Message` row action. It opens a popup, calls the new `generate-member-welcome-message` Supabase Edge Function, displays the AI-generated WhatsApp welcome note in an editable textarea, and provides a copy button. The edge function validates the custom admin session plus `members.view`, reads OpenAI configuration from server-side `ai_runtime_settings`, and returns only the generated plain-text message.
- **Validation:** lint PASS (0 errors / 3 expected warnings), build PASS. Supabase CLI is installed; standalone `deno` is unavailable locally, so edge-function type checking was not run outside Supabase.
- **Files:** `src/pages/AdminRegistrations.tsx`, `supabase/functions/generate-member-welcome-message/index.ts`

### COD-MEMBER-GOOGLE-CONTACT-CSV-001
- **Status:** Closed
- **Branch / Commit:** `feature/ux-sprint-1` / `d05e2a1` (2026-06-14)
- **Summary:** Admin Member Registrations now has a row-level `Download Google Contact` action. It generates a single-row Google Contacts CSV using the provided 30-column template, keeps intentionally blank contact fields blank, and maps contact display name, company, designation, birthday, notes, labels, email, mobile, and address fields from the registration row.
- **Validation:** lint PASS (0 errors / 3 expected warnings), build PASS.
- **Files:** `src/pages/AdminRegistrations.tsx`

### COD-APPLICATION-REVIEW-REFERENCE-001
- **Status:** Closed
- **Branch / Commit:** `feature/ux-sprint-1` / `0fc5801` (2026-06-20)
- **Summary:** Admin Application Review now shows the registration `referred_by` value in the expanded Personal Information section as `Reference Name`; the modal row is always visible and shows `Not provided` when blank. PDF export also places populated reference values in Personal Information and avoids a duplicate lower Additional Information entry.
- **Validation:** lint PASS (0 errors / 3 expected warnings), build PASS.
- **Files:** `src/components/ViewApplicationModal.tsx`

### COD-COMMITTEE-EDIT-001
- **Status:** Closed
- **Branch / Commit:** `feature/ux-sprint-1` / `0fc5801` (2026-06-20)
- **Summary:** Added committee-level editing to Designations Management. When the current member assignment list resolves to exactly one committee group and member search is clear, admins can update shared level/state/district/committee year/period fields for all matching assignments in one save.
- **Safety details:** The UI disables Edit Committee when the list contains multiple committee groups or when member search is active. The backend RPC matches the original group exactly, validates session + `organization.designations.manage`, validates year/location/date inputs, checks target conflicts, updates matching rows, and writes audit history.
- **Validation:** lint PASS (0 errors / 3 expected warnings), build PASS.
- **Deployment note:** Migration applied to linked DB on 2026-06-09. Invalid-session RPC probe returns `{ success: false, error: "Invalid session" }`, confirming PostgREST can find the function.
- **Files:** `src/pages/AdminDesignationsManagement.tsx`, `src/lib/supabase.ts`, `supabase/migrations/20260609114000_admin_update_member_lub_role_committee_group.sql`

### COD-COMMITTEE-BUILDER-001
- **Status:** Closed
- **Branch / Commit:** `feature/ux-sprint-1` / `0fc5801` (2026-06-20)
- **Summary:** Reworked LUB role bulk assignment into a Create Committee workflow with shared context, dynamic active-role rows, per-row role dropdown, smart member/alternate search, duplicate roles, and empty member rows while editing.
- **Validation:** lint PASS (0 errors / 3 expected warnings), build PASS.
- **Data note:** Empty member rows are ignored on submit because current assignment records require `member_id`; persistent vacant positions need a future committee planning table.
- **Files:** `src/pages/AdminDesignationsManagement.tsx`, `src/lib/supabase.ts`

### COD-EVENTS-UNPUBLISH-001
- **Status:** Closed
- **Branch / Commit:** `feature/ux-sprint-1` / `0fc5801` (2026-06-20)
- **Summary:** Added a distinct `unpublished` event status for postponed published events; updated admin event edit/list flows so published events can be unpublished and later published again; updated new-event RSVP profession defaults to Agriculture, Consultancy, Education, Manufacturing, Official, Trading, Services, Other.
- **Validation:** lint PASS (0 errors / 3 expected warnings), build PASS. Browser smoke reached `/signin` from unauthenticated `/admin/content/events/new`; authenticated visual verification still needed.
- **Deployment note:** Migration applied to linked DB on 2026-06-09.
- **Files:** `src/lib/supabase.ts`, `src/pages/AdminEventForm.tsx`, `src/pages/AdminEvents.tsx`, `supabase/migrations/20260609103000_events_unpublished_status.sql`

### COD-UX-SPRINT-1-001
- **Status:** Closed
- **Branch / Commit:** `feature/ux-sprint-1` / `6448fd9` (2026-05-31)
- **Summary:** Completed UI/accessibility Sprint 1 in 9 frontend files only (toast semantics, status badges, icon-labels, `aria-current`, directory toggle/filter aria states, persistent invalid input affordance, sortable-header `aria-sort`, and payments-report retry CTA).
- **Validation baseline preserved:** lint PASS (0 errors / 3 expected warnings), build PASS, Phase 1 readonly smoke PASS (3 passed / 12 skipped).
- **Product decision captured:** Header/Footer color tokenization attempt was reverted; original fixed brand colors remain intentional.
- **Files:** `src/components/Toast.tsx`, `src/components/dashboard/RecentActivityList.tsx`, `src/components/admin/AdminLayout.tsx`, `src/pages/MemberDashboard.tsx`, `src/components/MemberNav.tsx`, `src/pages/Directory.tsx`, `src/components/ui/input.tsx`, `src/pages/AdminReportsPayments.tsx`, `src/pages/admin/AdminUsers.tsx`

### COD-ACTIVITY-DETAIL-MEDIA-ORDER-001
- **Status:** Closed
- **Commit:** `5cafe6f` (2026-05-26)
- **Summary:** Public activity detail now shows photos/videos before full description.
- **Files:** `src/pages/ActivityDetail.tsx`

### COD-SEO-001
- **Status:** Closed
- **Commit:** `a8b428c` (2026-05-24)
- **Summary:** Added baseline SEO surface (`metadata`, `robots.txt`, `sitemap.xml`) without changing app flow.
- **Files:** `index.html`, `public/robots.txt`, `public/sitemap.xml`, `src/App.tsx`

### COD-REPORTS-PAYMENTS-001
- **Status:** Closed
- **Commit:** `c1f7ff2` (2026-05-24)
- **Summary:** Admin Reports > Payments shipped with secured RPC, permission wiring, filters/sorting/actions, and PDF-export hardening path.
- **Files:** `src/pages/AdminReportsPayments.tsx`, `src/lib/supabase.ts`, `src/components/admin/AppSidebar.tsx`, `src/App.tsx`, `src/components/ViewApplicationModal.tsx`, migrations:
  - `supabase/migrations/20260524103000_admin_reports_payments_with_session.sql`
  - `supabase/migrations/20260524143000_fix_payments_report_amount_parsing_and_error_surface.sql`

## Open Handoff

None.

## Next Queue

Track ready items only in `docs/agent_coordination/TASK_BOARD.md`:
- `COD-MSME-SHOWCASE-001`
- `COD-MSME-ISSUES-001`
- `COD-PUBLIC-001`
- `COD-MEMBERS-EXPORT-002`
