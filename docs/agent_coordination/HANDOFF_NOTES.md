# LUB Agent Handoff Notes

Overwrite this file each session; do not append a running journal.

## Current Owner

No active implementation slice.

## Latest Closed Slices

### CLU-FREE-MEMBER-LABEL-001
- **Status:** Complete — source uncommitted (pending explicit user instruction)
- **Branch / Commit:** `main` / NOT YET COMMITTED
- **Summary:** Display-only relabel of the `general_user` account type to LUB product language. Admin/user-facing UI now reads "Free Member" (was "General User") and "Paid Member" (was "Member"). Added `src/lib/accountTypeLabel.ts` helper mapping stored enum values → display labels (general_user → Free Member, member → Paid Member, both → Paid Member + Admin, admin → Admin).
- **Backend unchanged:** enum value `general_user` is NOT renamed. All logic checks (`account_type === 'general_user'`, deletion gate, free-user gate) remain intact. NO DB migration, NO RPC change, NO edge function change. Codex's anon-key RPC probes confirmed the earlier-suspected showcase grant blocker does NOT exist (member/admin RPCs return normal `session_invalid` from the browser anon role), so no grant-fix migration was created.
- **No tier field added:** Free vs Paid stays derived from `account_type` + approved active `member_registrations` row. No `membership_tier` / `membership_status` / new enum.
- **Business Showcase gates verified (no change needed):** Free Members cannot create listings (`create_showcase_listing_with_session` checks approved+active registration → `not_approved_member`); `showcase-photo-upload` and `improve-showcase-listing` edge functions independently re-check approved status; public page shows approved-only via `get_public_showcase_listings`; admin moderation gated by `members.view` / `members.edit`; RLS deny-all on `showcase_listings`.
- **Validation:** lint PASS (0 errors / 3 expected shadcn warnings), build PASS (2026-06-21).
- **Files:** `src/lib/accountTypeLabel.ts` (new), `src/pages/admin/AdminUsers.tsx`, `src/components/admin/modals/BlockUserModal.tsx`, `src/components/admin/modals/DeleteUserModal.tsx`, `src/pages/Directory.tsx`

### CLU-MEMBERSHIP-PLANS-SHOWCASE-001
- **Status:** Runtime deployed; source commit/push still pending explicit user instruction
- **Branch / Commit:** `main` / NOT YET COMMITTED (user will confirm before commit/push)
- **Summary:** Implemented the full Membership Plans + Business Showcase feature. Public `/membership-plans` page with hero, plan cards (Free vs Paid with copy guardrails), feature comparison table, `StateWiseFeePanel` shared component, and bottom CTA. Public `/business-showcase` with filters and listing grid. Member dashboard `/dashboard/showcase` with listing CRUD, photo upload, AI improve. Admin moderation `/admin/content/showcase`. Admin settings `/admin/settings/membership-plans`. Nav wired across Header, Footer, MemberNav, AppSidebar, AdminSettingsHub. Routes wired in App.tsx. SEO metadata for both public pages.
- **Validation:** lint PASS (0 errors / 3 expected shadcn warnings), build PASS (2026-06-21).
- **Runtime deployment:** Codex applied migration `supabase/migrations/20260621100000_business_showcase.sql` to the linked Supabase DB on 2026-06-21, deployed edge functions `showcase-photo-upload` and `improve-showcase-listing`, and created public Supabase Storage bucket `showcase-photos` with 5 MB image limit and JPEG/PNG/WebP MIME restrictions.
- **Runtime verification:** `get_public_showcase_listings` RPC probe returned HTTP 200 with `[]`, which is expected before approved listings exist. `supabase functions list` shows both new functions ACTIVE. A follow-up `npm run db:migrations:audit` retry was blocked by Supabase pooler `(ECIRCUITBREAKER) too many authentication failures` after earlier failed direct `psql` attempts; retry after the temporary pooler block clears.
- **Free card copy guardrails (do NOT add these to Free card):** "approved LUB member", "full member", "full directory access", "directory listing", "business showcase posting", "committee eligibility", "leadership eligibility". The Free card only lists community/access benefits: portal account, LUB news/updates, public events, upgrade anytime.
- **Security pattern used:** All privileged writes use `_with_session` RPCs; no direct `.from().insert/update/delete` browser writes on the `showcase_listings` table (RLS deny-all on the table).
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

### COD-MEMBER-CHANGE-PASSWORD-001
- **Status:** Closed locally, pending commit
- **Branch / Commit:** `feature/ux-sprint-1` / pending local commit (2026-06-20)
- **Summary:** Added a logged-in member Change Password path from `/dashboard/settings` Privacy & Security to `/dashboard/change-password`. The page collects current password, new password, and confirmation; validates minimum length and matching confirmation client-side; calls the member auth service; and shows success after changing the password. Stale "password-based authentication is no longer supported" copy was removed from member settings and related auth/modal surfaces.
- **Backend details:** New `change_member_password_with_session` RPC verifies the current custom session, checks inactive/suspended users, rejects placeholder/passwordless accounts with a Forgot Password instruction, verifies the current password with the existing password helpers, hashes the new password server-side, resets lockout counters, and deletes other sessions for the same user while keeping the current session.
- **Validation:** lint PASS (0 errors / 3 expected warnings), build PASS, migration audit PASS. Migration `20260620123000_member_change_password_with_session.sql` applied to the linked DB. Invalid-session RPC probe returns normal JSON `{ success: false, error_code: "session_invalid" }`.
- **Files:** `src/pages/MemberSettings.tsx`, `src/pages/MemberChangePassword.tsx`, `src/lib/customAuth.ts`, `src/lib/memberAuth.ts`, `src/components/ChangePasswordModal.tsx`, `supabase/migrations/20260620123000_member_change_password_with_session.sql`

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
- **Validation:** lint PASS (0 errors / 3 expected warnings), build PASS, migration audit PASS. Migration `20260620103000` is applied to the linked DB and `request-password-reset` Edge Function is deployed.
- **Files:** `src/pages/SignIn.tsx`, `src/pages/SignUpV2.tsx`, `src/pages/ForgotPassword.tsx`, `src/pages/ResetPassword.tsx`, `src/lib/customAuth.ts`, `src/lib/memberAuth.ts`, `src/lib/passwordReset.ts`, `supabase/functions/request-password-reset/index.ts`, `supabase/migrations/20260620103000_universal_password_auth.sql`

## Open Handoff

None. Runtime deployment is complete; source files remain uncommitted pending explicit user instruction.

## Next Queue

Track ready items only in `docs/agent_coordination/TASK_BOARD.md`:
- `COD-MSME-ISSUES-001`
- `COD-PUBLIC-001`
- `COD-MEMBERS-EXPORT-002`
