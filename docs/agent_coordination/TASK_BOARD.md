# LUB Agent Task Board

Use this file as the strict shared queue between Codex and Claude Code.

Rules:
- One implementation slice has one owner.
- Claude owns UI-first slices by default.
- Codex owns backend/data/runtime slices by default.
- Do not start a new slice until `In Progress` is updated.
- Move a task to `Blocked` instead of improvising across ownership boundaries.
- Stage only scoped files for the active slice (`no git add .` in dirty worktrees).

## Ready

| ID | Title | Owner | Scope | Files / Domains | Dependency / Blocker |
|----|-------|-------|-------|-----------------|----------------------|
| COD-MSME-SHOWCASE-001 | MSME product showcase platform (free + member tiers) | Codex + Claude | Product display platform (not marketplace): product listings, inquiries, member-tier capabilities. | new DB tables, media storage, public listing/detail, inquiry flow, member dashboard, admin moderation | Product refinement needed before start. |
| COD-MSME-ISSUES-001 | MSME issue intake and AI categorization workflow | Codex | Member issue submission with uploads/extraction, AI classification, and admin review/reporting. | signup/onboarding, upload + OCR, issue workflow, AI settings, taxonomy, admin analytics | Product refinement needed for moderation/privacy model. |
| COD-PUBLIC-001 | Public News page completion | Codex | Replace placeholder `/news` route with real content/data source. | `src/pages/News.tsx` + content source | No finalized backend content source yet. |
| COD-MEMBERS-EXPORT-002 | Export UX follow-ups (low priority) | Codex | Optional export improvements after higher-priority work. | `src/pages/AdminRegistrations.tsx`, `src/lib/xlsxExport.ts` | Deferred by priority. |

## In Progress

| ID | Title | Owner | Scope | Files / Domains | Dependency / Blocker |
|----|-------|-------|-------|-----------------|----------------------|

## Blocked

| ID | Title | Owner | Scope | Files / Domains | Dependency / Blocker |
|----|-------|-------|-------|-----------------|----------------------|

## Completed Recently

| ID | Title | Owner | Scope | Files / Domains | Outcome |
|----|-------|-------|-------|-----------------|---------|
| COD-MEMBER-WELCOME-MESSAGE-AI-001 | AI welcome message generator for member registrations | Codex | Added a row-level `Generate Welcome Message` action in Member Registrations, a review/edit/copy popup, and a secured Supabase Edge Function that validates the custom session plus `members.view` before calling OpenAI via server-side AI runtime settings. | `src/pages/AdminRegistrations.tsx`, `supabase/functions/generate-member-welcome-message/index.ts` | Implemented locally on `feature/ux-sprint-1` (uncommitted, 2026-06-14). Validation: lint PASS (0 errors / 3 expected warnings), build PASS. Standalone Deno unavailable locally, so edge-function type checking was not run outside Supabase. |
| COD-MEMBER-GOOGLE-CONTACT-CSV-001 | Per-member Google Contacts CSV download | Codex | Added a row-level Member Registrations action that downloads a Google Contacts-compatible CSV for that registration using the provided 30-column template, preserving intentionally blank columns and mapping member/company/contact/address fields. | `src/pages/AdminRegistrations.tsx` | Implemented locally on `feature/ux-sprint-1` (uncommitted, 2026-06-14). Validation: lint PASS (0 errors / 3 expected warnings), build PASS. |
| COD-APPLICATION-REVIEW-REFERENCE-001 | Show reference name in admin application review | Codex | Moved `referred_by` into the expanded Personal Information section of the admin Application Review modal and PDF as `Reference Name`, removing the lower duplicate from Additional Information. The modal row is always visible and shows `Not provided` when blank. | `src/components/ViewApplicationModal.tsx` | Implemented locally on `feature/ux-sprint-1` (uncommitted, 2026-06-14). Validation: lint PASS (0 errors / 3 expected warnings), build PASS. |
| COD-COMMITTEE-EDIT-001 | Committee-level edit workflow | Codex | Added an Edit Committee action for member role assignments when the visible assignment list maps to one committee group; updates shared level/state/district/year/period fields across all matching assignments via a session-token secured RPC. | `src/pages/AdminDesignationsManagement.tsx`, `src/lib/supabase.ts`, `supabase/migrations/20260609114000_admin_update_member_lub_role_committee_group.sql` | Implemented locally on `feature/ux-sprint-1` (uncommitted, 2026-06-09). Validation: lint PASS (0 errors / 3 expected warnings), build PASS. Migration applied to linked DB; invalid-session RPC probe confirms function is visible. |
| COD-COMMITTEE-BUILDER-001 | Create Committee assignment workflow | Codex | Replaced one-role bulk member assignment with a committee builder: shared committee context, dynamic active-role rows, per-row role dropdown, smart member/alternate-contact search, duplicate role rows, and optional empty member rows while editing. | `src/pages/AdminDesignationsManagement.tsx`, `src/lib/supabase.ts` | Implemented locally on `feature/ux-sprint-1` (uncommitted, 2026-06-09). Validation: lint PASS (0 errors / 3 expected warnings), build PASS. Empty rows are ignored on submit because assignment rows require a member. |
| COD-EVENTS-UNPUBLISH-001 | Event unpublish status + profession defaults | Codex | Added a real `unpublished` event status for postponed events, event edit-form `Unpublish` action, admin list filter/metric/action handling, and new-event RSVP profession defaults requested by product. | `src/lib/supabase.ts`, `src/pages/AdminEventForm.tsx`, `src/pages/AdminEvents.tsx`, `supabase/migrations/20260609103000_events_unpublished_status.sql` | Implemented locally on `feature/ux-sprint-1` (uncommitted, 2026-06-09). Validation: lint PASS (0 errors / 3 expected warnings), build PASS. Migration applied to linked DB. |
| COD-UX-SPRINT-1-001 | UI/UX Sprint 1 accessibility and consistency pass | Claude (impl) + Codex (review) | Presentational and accessibility-only updates: toast semantics, status badge normalization, icon-button labels, nav/table aria attributes, and persistent invalid input affordance. No backend/auth/RPC/SQL/data-contract changes. | `src/components/Toast.tsx`, `src/components/dashboard/RecentActivityList.tsx`, `src/components/admin/AdminLayout.tsx`, `src/pages/MemberDashboard.tsx`, `src/components/MemberNav.tsx`, `src/pages/Directory.tsx`, `src/components/ui/input.tsx`, `src/pages/AdminReportsPayments.tsx`, `src/pages/admin/AdminUsers.tsx` | Complete on `feature/ux-sprint-1` (`6448fd9`, 2026-05-31). Validation: lint PASS, build PASS, phase1 readonly smoke PASS (3 passed / 12 skipped). Header/Footer brand colors intentionally unchanged per product decision. |
| COD-ACTIVITY-DETAIL-MEDIA-ORDER-001 | Move activity full description below media | Codex | Public activity detail order update so photos/videos appear before full description. | `src/pages/ActivityDetail.tsx` | Complete in `main` (`5cafe6f`, 2026-05-26). |
| COD-SEO-001 | Public-site SEO baseline | Codex | Added non-invasive crawl/indexing baseline and metadata surfaces. | `index.html`, `public/robots.txt`, `public/sitemap.xml`, `src/App.tsx` | Complete in `main` (`a8b428c`, 2026-05-24). |
| COD-REPORTS-PAYMENTS-001 | Admin Reports foundation + Payments report | Codex | Added secure payments-report RPC + permission seed/grants; built Admin Reports > Payments page with filters, sorting, actions menu, and read-only application view path; included PDF-export hardening and amount/error fixes. | `supabase/migrations/20260524103000_admin_reports_payments_with_session.sql`, `supabase/migrations/20260524143000_fix_payments_report_amount_parsing_and_error_surface.sql`, `src/pages/AdminReportsPayments.tsx`, `src/lib/supabase.ts`, `src/components/admin/AppSidebar.tsx`, `src/components/ViewApplicationModal.tsx`, `src/App.tsx` | Complete in `main` (`c1f7ff2`, 2026-05-24). |
| COD-AUTH-LOGIN-LOCKOUT-DURATION-095 | Reduce lockout duration to 3 minutes | Codex | Updated backend lockout duration and lock-message UX while preserving failed-attempt threshold. | `src/lib/customAuth.ts`, `supabase/migrations/20260522103000_reduce_login_lockout_to_3_minutes.sql` | Complete; migration applied to linked DB. |
