# LUB Web Portal - Current State

**Last updated:** 2026-06-14  
**Updated by:** Codex

---

## Project

- **Repo:** `C:\webprojects\lub`
- **Latest deep handover:** `docs/session_documents/session_78_smart_upload_batch_005.md`
- **Project guide:** `docs/lub_web_portal_project_guide_for_claude_code.md`

---

## Current Baseline

| Check | Status |
|-------|--------|
| Lint (`npm run lint`) | PASS on 2026-06-14 (0 errors, 3 expected shadcn warnings) |
| Build (`npm run build`) | PASS on 2026-06-14 |
| Phase 1 destructive smoke | Baseline remains **15 passed** |
| Phase 1 readonly smoke | Last known PASS (3 passed / 12 skipped) |

> Note: Phase 1 smoke was not run for COD-EVENTS-UNPUBLISH-001; this slice was verified with lint/build and a local route redirect smoke check.

---

## Active Stream

No active implementation slice.

---

## Recently Completed

### COD-MEMBER-WELCOME-MESSAGE-AI-001
- **Branch:** `feature/ux-sprint-1`
- **Commit:** Uncommitted local implementation (2026-06-14)
- **What shipped:** Added a `Generate Welcome Message` action in Admin Member Registrations. The action opens a popup, calls a new `generate-member-welcome-message` Supabase Edge Function, generates an AI-written WhatsApp welcome message from the selected member's registration fields, allows review/editing in a textarea, and copies the final message to clipboard. The edge function validates the custom admin session plus `members.view` permission and reads the OpenAI key from server-side `ai_runtime_settings`.
- **Files:** `src/pages/AdminRegistrations.tsx`, `supabase/functions/generate-member-welcome-message/index.ts`
- **Validation:** `npm run lint` PASS (0 errors / 3 expected warnings), `npm run build` PASS. Supabase CLI is installed; standalone `deno` is not available locally, so edge-function type checking was not run outside Supabase.

### COD-MEMBER-GOOGLE-CONTACT-CSV-001
- **Branch:** `feature/ux-sprint-1`
- **Commit:** Uncommitted local implementation (2026-06-14)
- **What shipped:** Added a row-level `Download Google Contact` action in Admin Member Registrations. The action generates a single-member Google Contacts CSV using the exact 30-column header order from the provided sample, intentionally preserves blank Google contact fields, and maps the convenience contact name, company, designation, birthday, notes, labels, email, phone, and address fields from the loaded registration row.
- **Files:** `src/pages/AdminRegistrations.tsx`
- **Validation:** `npm run lint` PASS (0 errors / 3 expected warnings), `npm run build` PASS.

### COD-APPLICATION-REVIEW-REFERENCE-001
- **Branch:** `feature/ux-sprint-1`
- **Commit:** Uncommitted local implementation (2026-06-14)
- **What shipped:** Moved the member registration `referred_by` value into the expanded Personal Information section of the admin Application Review modal as `Reference Name`, so admins can see it immediately. This row is always visible and shows `Not provided` when the stored value is blank. The PDF export places populated reference values in Personal Information and no longer duplicates them under Additional Information.
- **Files:** `src/components/ViewApplicationModal.tsx`
- **Validation:** `npm run lint` PASS (0 errors / 3 expected warnings), `npm run build` PASS.

### COD-COMMITTEE-EDIT-001
- **Branch:** `feature/ux-sprint-1`
- **Commit:** Uncommitted local implementation (2026-06-09)
- **What shipped:** Added committee-level editing for LUB member role assignments. When the current assignment list resolves to one committee group and member search is clear, admins can edit the shared level/state/district/year/period fields once and update all matching assignments together.
- **Files:** `src/pages/AdminDesignationsManagement.tsx`, `src/lib/supabase.ts`, `supabase/migrations/20260609114000_admin_update_member_lub_role_committee_group.sql`
- **Validation:** `npm run lint` PASS (0 errors / 3 expected warnings), `npm run build` PASS.
- **Deployment note:** Migration applied to linked DB on 2026-06-09; RPC probe now returns `Invalid session` for an invalid token, confirming PostgREST can find the function.

### COD-COMMITTEE-BUILDER-001
- **Branch:** `feature/ux-sprint-1`
- **Commit:** Uncommitted local implementation (2026-06-09)
- **What shipped:** Replaced the old one-role bulk assignment popup with a wide Create Committee modal. Committee context is set once (level/state/district/year/period), active LUB roles load as editable role rows, each row has a role dropdown and smart member/alternate-contact search, duplicate role rows are supported, and empty member rows are allowed while editing but ignored on submit.
- **Files:** `src/pages/AdminDesignationsManagement.tsx`, `src/lib/supabase.ts`
- **Validation:** `npm run lint` PASS (0 errors / 3 expected warnings), `npm run build` PASS.
- **Data note:** Current `member_lub_role_assignments` rows require a member. Empty positions are not persisted; saving vacant committee positions would require a separate committee planning table.

### COD-EVENTS-UNPUBLISH-001
- **Branch:** `feature/ux-sprint-1`
- **Commit:** Uncommitted local implementation (2026-06-09)
- **What shipped:** Added a distinct `unpublished` event status for postponed published events, exposed `Unpublish` on the event edit form, updated admin event list labels/filter/metrics/actions to handle unpublished events, and changed new-event RSVP profession defaults to Agriculture, Consultancy, Education, Manufacturing, Official, Trading, Services, Other.
- **Files:** `src/lib/supabase.ts`, `src/pages/AdminEventForm.tsx`, `src/pages/AdminEvents.tsx`, `supabase/migrations/20260609103000_events_unpublished_status.sql`
- **Validation:** `npm run lint` PASS (0 errors / 3 expected warnings), `npm run build` PASS. Browser route smoke redirected unauthenticated `/admin/content/events/new` to `/signin`, so admin form visual verification needs an authenticated session.
- **Deployment note:** Migration applied to linked DB on 2026-06-09.

### COD-UX-SPRINT-1-001
- **Branch:** `feature/ux-sprint-1`
- **Commit:** `6448fd9` (2026-05-31)
- **What shipped:** UI/accessibility Sprint 1 updates across 9 frontend files only (Toast aria-live/roles and dark-mode colors; status Badge normalization in RecentActivityList; icon-button labels; member nav `aria-current`; directory toggle/filter aria attributes; persistent `aria-invalid` input styling; table `aria-sort` + retry CTA in AdminReportsPayments; `aria-sort` in AdminUsers).
- **Validation:** lint PASS (0 errors / 3 expected warnings), build PASS, Phase 1 readonly smoke PASS (3 passed / 12 skipped).
- **Product note:** Header/Footer brand colors were intentionally kept fixed (original hardcoded blue/orange brand styling) after visual review; no theme-token swap.

## Recently Completed (Main Branch)

### COD-REPORTS-PAYMENTS-001
- **Commit:** `c1f7ff2` (2026-05-24)
- **What shipped:** Admin Reports section with Payments sub-module, secured `_with_session` report RPC, permission wiring, payments table filters/sorting/actions, and hardened application PDF export flow.
- **Files:** `src/pages/AdminReportsPayments.tsx`, `src/components/ViewApplicationModal.tsx`, `src/components/admin/AppSidebar.tsx`, `src/lib/supabase.ts`, `src/App.tsx`, migrations:
  - `supabase/migrations/20260524103000_admin_reports_payments_with_session.sql`
  - `supabase/migrations/20260524143000_fix_payments_report_amount_parsing_and_error_surface.sql`

### COD-SEO-001
- **Commit:** `a8b428c` (2026-05-24)
- **What shipped:** Non-invasive SEO baseline for crawlability and indexing.
- **Files:** `index.html`, `public/robots.txt`, `public/sitemap.xml`, `src/App.tsx`

### COD-ACTIVITY-DETAIL-MEDIA-ORDER-001
- **Commit:** `5cafe6f` (2026-05-26)
- **What shipped:** Public activity detail content order updated so media appears before full description.
- **Files:** `src/pages/ActivityDetail.tsx`

---

## In Progress / Dirty State

- No active code slice.
- Worktree has uncommitted COD-MEMBER-WELCOME-MESSAGE-AI-001, COD-MEMBER-GOOGLE-CONTACT-CSV-001, COD-APPLICATION-REVIEW-REFERENCE-001, COD-COMMITTEE-EDIT-001, COD-COMMITTEE-BUILDER-001, and COD-EVENTS-UNPUBLISH-001 files plus prior dirty UI/docs files and untracked local artifacts (`artifacts/`, `LUB_Users_Export.xlsx`, `supabase/.temp/`). Do not stage blindly.

---

## Deferred / Next Candidate Work

1. `COD-MSME-SHOWCASE-001`
2. `COD-MSME-ISSUES-001`
3. `COD-PUBLIC-001`
4. `COD-MEMBERS-EXPORT-002`

---

## References

- Task board: `docs/agent_coordination/TASK_BOARD.md`
- Handoff notes: `docs/agent_coordination/HANDOFF_NOTES.md`
- Ownership rules: `docs/agent_coordination/OWNERSHIP_RULES.md`
