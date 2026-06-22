# LUB Web Portal - Current State

**Last updated:** 2026-06-21
**Updated by:** Claude Code

---

## Project

- **Repo:** `C:\webprojects\lub`
- **Latest deep handover:** `docs/session_documents/session_78_smart_upload_batch_005.md`
- **Project guide:** `docs/lub_web_portal_project_guide_for_claude_code.md`

---

## Current Baseline

| Check | Status |
|-------|--------|
| Lint (`npm run lint`) | PASS on 2026-06-21 (0 errors, 3 expected shadcn warnings) |
| Build (`npm run build`) | PASS on 2026-06-21 |
| Phase 1 destructive smoke | Baseline remains **15 passed** |
| Phase 1 readonly smoke | Last known PASS (3 passed / 12 skipped) |

---

## Active Stream

No active implementation slice.

---

## Recently Completed

### CLU-FREE-MEMBER-LABEL-001
- **Branch:** `main`
- **Commit:** Pending user instruction (do not commit/push without explicit request)
- **What shipped:** Display-only relabel of the `general_user` account type to product language. Admin/user-facing UI now shows "Free Member" (was "General User") and "Paid Member" (was "Member"). Backend enum value `general_user` is UNCHANGED — all logic checks (`account_type === 'general_user'`, etc.) remain intact.
- **New helper:** `src/lib/accountTypeLabel.ts` — `accountTypeLabel()` maps stored values to display labels (general_user → Free Member, member → Paid Member, both → Paid Member + Admin, admin → Admin). Display only.
- **Label changes:**
  - `src/pages/admin/AdminUsers.tsx` — account-type display: 'General User' → 'Free Member', 'Member' → 'Paid Member', 'Member + {roles}' → 'Paid Member + {roles}', 'Member + Admin' → 'Paid Member + Admin'; filter dropdown options 'General User' → 'Free Member', 'Member' → 'Paid Member'.
  - `src/components/admin/modals/BlockUserModal.tsx` — badge now uses `accountTypeLabel()` (Free Member / Paid Member / Paid Member + Admin / Admin).
  - `src/components/admin/modals/DeleteUserModal.tsx` — "Only general user accounts can be deleted" → "Only Free Member accounts…" (2 spots); raw enum display now uses `accountTypeLabel()`.
  - `src/pages/Directory.tsx` — public notice "hidden for general users" → "hidden for Free Members".
- **Business Showcase gates verified (no change needed):** Free Members cannot create listings (`create_showcase_listing_with_session` checks approved+active registration); photo-upload and AI-improve edge functions independently re-check approved status; public page shows approved listings only; admin moderation gated by `members.view`/`members.edit`. RLS deny-all on `showcase_listings`.
- **Backend:** No DB migration, no RPC change, no edge function change, no enum rename. Codex anon-key RPC probes confirmed the suspected grant blocker does NOT exist — member/admin showcase RPCs return normal `session_invalid` from the browser anon role.
- **No `membership_tier` / `membership_status` field added** — Free vs Paid remains derived from `account_type` + approved active registration.
- **Validation:** `npm run lint` PASS (0 errors / 3 expected shadcn warnings), `npm run build` PASS (2026-06-21).

### CLU-MEMBERSHIP-PLANS-SHOWCASE-001
- **Branch:** `main`
- **Commit:** Pending user instruction (do not commit/push without explicit request)
- **What shipped:**
  - Public `/membership-plans` page: hero, "Why LUB" cards, Free vs Paid plan cards (with copy guardrails — free card never mentions directory/showcase/committee), feature comparison table, `StateWiseFeePanel` embedded, bottom CTA section. SEO metadata added.
  - `StateWiseFeePanel` shared component: state selector, male/female/validity fee cards, QR code, bank details, CTA buttons. Used by both `/membership-plans` and `/payment`.
  - Public `/business-showcase` page: hero, search/state/category filters, approved listing grid with `ShowcaseCard`. SEO metadata added.
  - Member dashboard `/dashboard/showcase` (`MemberShowcaseListings`): auth guard, non-approved gate with upgrade prompt, listing CRUD (create/edit/save-draft/submit/delete-archive), photo upload, AI improve button, status badges.
  - Admin showcase moderation `/admin/content/showcase` (`AdminShowcaseModeration`): status filter tabs, search, detail modal, approve/reject/archive actions with admin note.
  - Admin membership plan settings `/admin/settings/membership-plans` (`AdminMembershipPlanSettings`): plan title/subtitle/description editor, feature comparison row editor (inline save per row), add-new-row form.
  - DB migration: `supabase/migrations/20260621100000_business_showcase.sql` — `showcase_listings`, `membership_plan_settings`, `membership_plan_features` tables, seed data, RLS deny-all on listings, 10 `_with_session` SECURITY DEFINER RPCs.
  - Edge functions: `supabase/functions/showcase-photo-upload/index.ts`, `supabase/functions/improve-showcase-listing/index.ts`.
  - `src/lib/supabase.ts`: added `showcaseService`, `membershipPlanService`, interfaces `ShowcaseListing`, `ShowcaseListingDraft`, `MembershipPlanSetting`, `MembershipPlanFeature`.
  - Navigation: "Membership Plans" added to top-level desktop nav + mobile nav in `Header.tsx`. "Showcase" tab added to `MemberNav.tsx` for approved members. Footer: Membership Plans + Business Showcase added to Quick Links. Admin sidebar: "Business Showcase" under Members section, "Membership Plans" under Settings section. AdminSettingsHub: Membership Plans card added.
  - Routes in `App.tsx`: `/membership-plans`, `/business-showcase`, `/dashboard/showcase`, `/admin/content/showcase`, `/admin/settings/membership-plans`.
- **Files (new):**
  - `supabase/migrations/20260621100000_business_showcase.sql`
  - `supabase/functions/showcase-photo-upload/index.ts`
  - `supabase/functions/improve-showcase-listing/index.ts`
  - `src/components/StateWiseFeePanel.tsx`
  - `src/pages/MembershipPlans.tsx`
  - `src/pages/BusinessShowcase.tsx`
  - `src/pages/MemberShowcaseListings.tsx`
  - `src/pages/AdminShowcaseModeration.tsx`
  - `src/pages/AdminMembershipPlanSettings.tsx`
- **Files (modified):**
  - `src/lib/supabase.ts`
  - `src/App.tsx`
  - `src/components/Header.tsx`
  - `src/components/Footer.tsx`
  - `src/components/MemberNav.tsx`
  - `src/components/admin/AppSidebar.tsx`
  - `src/pages/AdminSettingsHub.tsx`
- **Validation:** `npm run lint` PASS (0 errors / 3 expected shadcn warnings), `npm run build` PASS (2026-06-21).
- **Runtime deployment:** Codex applied migration `20260621100000_business_showcase.sql` to the linked Supabase DB on 2026-06-21, deployed edge functions `showcase-photo-upload` and `improve-showcase-listing`, created public Storage bucket `showcase-photos` with 5 MB image limit and JPEG/PNG/WebP MIME restrictions, and probed `get_public_showcase_listings` successfully (`200`, empty list expected before approved listings exist). `supabase functions list` shows both new functions ACTIVE. A follow-up migration audit could not complete because earlier failed direct `psql` attempts temporarily tripped the Supabase pooler auth circuit breaker; do not retry until the block clears.

### COD-MEMBER-CHANGE-PASSWORD-001
- **Branch:** `feature/ux-sprint-1`
- **Commit:** Pending local commit (2026-06-20)
- **What shipped:** Added a logged-in member Change Password flow under `/dashboard/settings` > Privacy & Security. The settings page now links to `/dashboard/change-password`, the change-password page collects current password, new password, and confirmation, and the service layer calls a new session-token secured RPC. The RPC validates the active custom session, rejects inactive/suspended users, verifies the current password, enforces minimum 6 characters, rejects passwordless/placeholder accounts with a Forgot Password instruction, hashes the new password server-side, and invalidates other active sessions while preserving the current session.
- **Files:** `src/pages/MemberSettings.tsx`, `src/pages/MemberChangePassword.tsx`, `src/lib/customAuth.ts`, `src/lib/memberAuth.ts`, `src/components/ChangePasswordModal.tsx`, `supabase/migrations/20260620123000_member_change_password_with_session.sql`
- **Validation:** `npm run lint` PASS (0 errors / 3 expected warnings), `npm run build` PASS, `npm run db:migrations:audit` PASS. Migration `20260620123000` is applied to the linked DB. Invalid-session RPC probe returns normal JSON `{ success: false, error_code: "session_invalid" }`, confirming PostgREST can find the function.

---

## In Progress / Dirty State

- No active code slice.
- Local source changes for `CLU-MEMBERSHIP-PLANS-SHOWCASE-001` and `CLU-FREE-MEMBER-LABEL-001` are present but not committed. Runtime deployment for the showcase feature is complete. Do not commit or push without explicit user instruction.
- Untracked local artifacts remain (`artifacts/`, `LUB_Users_Export.xlsx`, `supabase/.temp/`). Do not stage artifacts.

---

## Deferred / Next Candidate Work

1. `COD-MSME-ISSUES-001`
2. `COD-PUBLIC-001`
3. `COD-MEMBERS-EXPORT-002`

---

## References

- Task board: `docs/agent_coordination/TASK_BOARD.md`
- Handoff notes: `docs/agent_coordination/HANDOFF_NOTES.md`
- Ownership rules: `docs/agent_coordination/OWNERSHIP_RULES.md`
