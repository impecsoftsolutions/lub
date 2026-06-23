# LUB Web Portal - Current State

**Last updated:** 2026-06-23
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
| Lint (`npm run lint`) | PASS on 2026-06-23 (0 errors, 3 expected shadcn warnings) |
| Build (`npm run build`) | PASS on 2026-06-23 |
| Phase 1 destructive smoke | Baseline remains **15 passed** |
| Phase 1 readonly smoke | Last known PASS (3 passed / 12 skipped) |

---

## Active Stream

No active implementation slice.

---

## Recently Completed

### COD-MEMBERSHIP-PLANS-COMPARISON-UPDATE-001
- **Branch:** `main`
- **Commit:** Local/uncommitted
- **What shipped:** Updated the public Membership Plans comparison table so unavailable features render as a red cross instead of a grey dash. Added configurable comparison rows for `LUB national account` and `Member registration certificate`, renamed `LUB portal account` to `LUB state account`, and reordered the table so the state/national/certificate rows appear first.
- **Files (new):** `supabase/migrations/20260624160000_update_membership_plan_feature_labels.sql`
- **Files (modified):** `src/pages/MembershipPlans.tsx`
- **Validation:** `npm run build` PASS, `npm run lint` PASS (0 errors / 3 expected shadcn warnings), `npm run db:migrations:audit` PASS (local 270 / remote 270 / local_only 0 / remote_only 0) on 2026-06-23.
- **Runtime:** Migration `20260624160000_update_membership_plan_feature_labels.sql` applied to the linked DB on 2026-06-23.

### COD-MEMBER-DASHBOARD-FREE-PAID-FLOW-001
- **Branch:** `main`
- **Commit:** `8d5dec5` pushed to `main`; follow-up payment-page bugfix is local and uncommitted.
- **What shipped:** Updated the new/unregistered member dashboard flow to choose Free Membership or Paid Membership first. Free opens a persuasion/confirmation modal before going to `/join?membership=free`; Paid goes to `/payment?membership=paid` with the signed-up state included when available, so the payment page preselects the user's state and loads payment details automatically. The payment page also falls back to the signed-in member state when no `state` URL param is present, replaces the old Home button with a Back button, and preserves `membership=paid` when continuing to registration. Follow-up local fix: an explicit blank `state=` now clears payment details instead of immediately reselecting the member state, and payment-page state dropdown changes use history replace so the Back button returns to the previous page instead of stepping through same-page state changes. Payment and Membership Plans CTAs now preserve `membership=paid`, and `/join` reads `membership=free|paid` to preselect the correct registration type. Free Membership hides the payment section, skips payment-field validation, and submits no payment proof. Backend hardening forces Free applications to store clean payment placeholders regardless of accidental client values.
- **Files (new):** `supabase/migrations/20260624143000_harden_free_membership_payment_placeholders.sql`
- **Files (modified):** `src/pages/MemberDashboard.tsx`, `src/pages/Join.tsx`, `src/pages/Payment.tsx`, `src/components/StateWiseFeePanel.tsx`, `src/pages/MembershipPlans.tsx`
- **Validation:** `npm run build` PASS, `npm run lint` PASS (0 errors / 3 expected shadcn warnings) on 2026-06-23.
- **Runtime:** Migration `20260624143000_harden_free_membership_payment_placeholders.sql` applied to the linked DB on 2026-06-23. Migration audit PASS (local 269 / remote 269 / local_only 0 / remote_only 0). Invalid-input RPC probe returned normal JSON (`User ID is required`), confirming PostgREST sees `submit_member_registration`.

### COD-AUTH-FORM-BUILDER-PASSWORD-001
- **Branch:** `main`
- **Commit:** `c950af7` (`main`)
- **What shipped:** Corrected the password login UI to use the Form Builder V2 contract instead of page-only hardcoded fields. Added a migration that introduces `password` as a form-builder field type, seeds locked system auth fields (`password` on signup; `identifier` + `password` on sign-in), retires old sign-in email/mobile fields from the sign-in form, updates the live snapshots, and replaces the publish guard so auth fields cannot be hidden or made optional. Refactored `/signup` to render password from signup config and exclude it from dynamic payload storage; refactored `/signin` to load `signinFormConfigV2Service` again. Follow-up review fix: the migration now sets the live-snapshot write context before touching `form_config_v2_live_fields`, and `/signup` + `/signin` include compatibility auth-field fallbacks so the new source can run briefly against the old DB before the migration is applied.
- **Files (new):** `supabase/migrations/20260624113000_form_builder_password_auth_fields.sql`
- **Files (modified):** `src/pages/SignUpV2.tsx`, `src/pages/SignIn.tsx`, `src/lib/supabase.ts`, `src/pages/AdminFieldLibrary.tsx`, `src/pages/AdminFormStudio.tsx`
- **Validation:** `npm run build` PASS, `npm run lint` PASS (0 errors / 3 expected shadcn warnings) on 2026-06-23.
- **Runtime:** Migration `20260624113000_form_builder_password_auth_fields.sql` applied to the linked DB on 2026-06-23 after pushing source to `main`. Migration audit PASS (local 268 / remote 268 / local_only 0 / remote_only 0). Public RPC verification PASS: signup live config includes visible required `password:password`; sign-in live config includes visible required `identifier:text` + `password:password` and no old sign-in `email`/`mobile_number` fields.

### COD-JOIN-SMART-UPLOAD-SKIP-001
- **Branch:** `main`
- **Commit:** Pending user instruction (do not commit/push without explicit request)
- **What shipped:** Added a secondary `Skip` button beside the existing `Next` / `Review Details` button on the member registration smart document upload steps. `Skip` calls the same guided navigation handler as `Next`, so it only advances the optional upload flow and does not remove uploaded files, extracted fields, or saved draft data.
- **Files (modified):** `src/pages/Join.tsx`
- **Validation:** `npm run build` PASS, `npm run lint` PASS (0 errors / 3 expected shadcn warnings) on 2026-06-23.

### CLU-SHOWCASE-MODERATION-001
- **Branch:** `main`
- **Commit:** Pending user instruction (do not commit/push without explicit request)
- **What shipped (frontend + migration; no edge/bucket change):**
  - `is_public boolean NOT NULL DEFAULT true` on `showcase_listings` (orthogonal to status). Public listings now require `status='approved' AND is_public=true`. get_public/get_member/admin_get read RPCs surface `is_public`.
  - New admin `_with_session` RPCs (all `has_permission(members.edit)`): `admin_set_showcase_listing_public_visibility_with_session` (Hide/Show), `admin_update_showcase_listing_with_session` (admin edit; preserves status; no photo/location change), `admin_delete_archived_showcase_listing_with_session` (permanent delete, server-enforced archived-only). The member delete RPC is NOT reused.
  - Admin moderation actions are now explicit per status: pending_review = Approve / Reject with Note / Archive; approved+public = Hide from Public / Edit Listing / Archive; approved+hidden = Show Publicly / Edit Listing / Archive; rejected = Edit Listing / Approve / Archive; draft = Edit Listing / Archive; archived = Delete (permanent, confirm modal). A "Hidden" badge shows on hidden approved listings.
  - Admin edit modal covers title, product/service name, category, keywords, short/detailed description, contact email/number (non-empty = public, matching the member model), website. Admin photo upload/reorder intentionally NOT included.
  - Restore/Unarchive deferred (avoids ambiguous restore status).
- **Files (new):** `supabase/migrations/20260624100000_showcase_moderation_visibility.sql`
- **Files (modified):** `src/lib/supabase.ts`, `src/pages/AdminShowcaseModeration.tsx`
- **Validation:** `npm run lint` PASS (0 errors / 3 expected shadcn warnings), `npm run build` PASS (2026-06-24).
- **Codex runtime:** Applied migration `20260624100000_showcase_moderation_visibility.sql` to the linked DB on 2026-06-23. New admin RPC probes (`admin_set_showcase_listing_public_visibility_with_session`, `admin_update_showcase_listing_with_session`, `admin_delete_archived_showcase_listing_with_session`) return normal `session_invalid` JSON for invalid sessions. Schema checks confirm `showcase_listings.is_public` is `NOT NULL DEFAULT true`; the existing approved listing remains public (`approved_total=1`, `approved_public=1`). A rollback-only valid-admin probe confirmed archived-only delete enforcement: deleting an approved listing returns `invalid_status` with "Archive it first." Migration audit PASS: local 267 / remote 267 / local_only 0 / remote_only 0. No edge/bucket change.

### CLU-SHOWCASE-AI-VISION-001
- **Branch:** `main`
- **Commit:** Pending user instruction (do not commit/push without explicit request)
- **What shipped (frontend + edge function; no DB migration):**
  - Photo-aware AI for Business Showcase. The "Generate / Improve with AI" button now works from photos and/or text and is enabled when there is text OR at least one selected/uploaded photo.
  - On click, the member form uploads any pending local photos first (reusing `showcase-photo-upload`), writes the returned public URLs back into photo state (so a later Save does not re-upload), then sends the ordered photo URLs to the AI function.
  - Follow-up fix: `showcaseService.uploadPhoto` and `showcaseService.improveWithAI` now send the Supabase anon `apikey`/`Authorization` headers required by Edge Functions. This fixes browser uploads failing with `UNAUTHORIZED_NO_AUTH_HEADER` before function code ran.
  - Contact cleanup: the member form now shows simple `Contact email`, `Contact number`, and `Website` fields with no optional wording or public-display checkboxes. Non-empty email/number/website values are public on the listing; blank fields are hidden. Email and website are validated in the frontend and server-side RPCs; contact number remains free-form for mobile or landline.
  - Keywords + category ordering: showcase categories now display A-Z with `Other` pinned last. Listings now have a `keywords` field; members can type keywords, generate keywords separately, or let the main AI generation fill keywords along with title/product/description. Public/admin search now matches keywords, but the public Business Showcase UI does not display keyword chips.
  - Edge function `improve-showcase-listing` accepts up to 3 validated `showcase-photos` public URLs, adds `input_image` items to the single OpenAI Responses call, uses image-aware no-invention prompting, returns `usedImages`, and retries text-only on image/modality failure (clear error if there is neither usable text nor a successful image read).
  - SSRF guard: only URLs under `${SUPABASE_URL}/storage/v1/object/public/showcase-photos/` are passed to OpenAI (max 3).
  - AI remains review-only — never auto-saves/submits; paid-member gate preserved; no API keys in frontend.
- **Files (modified):** `supabase/functions/improve-showcase-listing/index.ts`, `src/lib/supabase.ts`, `src/pages/MemberShowcaseListings.tsx`, `src/pages/BusinessShowcase.tsx`, `src/pages/AdminShowcaseModeration.tsx`
- **Files (new):** `supabase/migrations/20260623110000_showcase_website_contact_validation.sql`, `supabase/migrations/20260623113000_showcase_keywords.sql`
- **Validation:** `npm run lint` PASS (0 errors / 3 expected shadcn warnings), `npm run build` PASS (2026-06-23). Follow-up header/contact/website fixes revalidated with `npm run build` PASS and `npm run lint` PASS (0 errors / 3 expected shadcn warnings) on 2026-06-23.
- **Codex runtime:** Redeployed `improve-showcase-listing` to the linked Supabase project on 2026-06-23; function list shows version 3 updated at 2026-06-23 09:34:50 UTC. Live anon-key probes for text-only, foreign photo URL, and allowed `showcase-photos` URL payloads all returned normal `session_invalid` JSON, confirming the deployed function is reachable and session-gated.
- **Runtime note:** A full photo-to-suggestion smoke test requires a valid signed-in paid-member session token and was not completed from the local runtime environment. An anon REST read of `ai_runtime_settings` returned no public rows, so the model row could not be directly inspected without privileged DB access; the function source still defaults to `gpt-4o-mini` when no model override is visible to the function.
- **Contact/website runtime:** Codex applied migration `20260623110000_showcase_website_contact_validation.sql` to the linked Supabase DB on 2026-06-23. RPC probes returned normal JSON for `get_public_showcase_listings`, `create_showcase_listing_with_session`, `update_showcase_listing_with_session`, and `admin_get_showcase_listings_with_session` with the new `p_website_url` param. `npm run db:migrations:audit` PASS: local 265 / remote 265 / local_only 0 / remote_only 0.
- **Keywords runtime:** Codex applied migration `20260623113000_showcase_keywords.sql` to the linked Supabase DB on 2026-06-23 and redeployed `improve-showcase-listing` (ACTIVE version 4, updated 2026-06-23 10:09:02 UTC). RPC probes with `p_keywords` returned normal JSON for public/create/update/admin reads. Live Edge Function probe with a keywords payload returned normal `session_invalid` JSON. `npm run db:migrations:audit` PASS: local 266 / remote 266 / local_only 0 / remote_only 0.

### CLU-SHOWCASE-V2-001
- **Branch:** `main`
- **Commit:** Pending user instruction (do not commit/push without explicit request)
- **What shipped (frontend + runtime applied):**
  - Multi-photo listings: ordered `photo_urls jsonb` (up to 3, [0] = main), 10 MB/photo. Legacy `photo_url` kept and dual-written; read RPCs emit a unified `photos` array with legacy fallback. Existing single-photo listings backfilled.
  - Contact fields: nullable `contact_email`/`contact_phone` + `show_contact_email`/`show_contact_phone` consent flags (default false). Public RPC exposes a contact value only when its show flag is true. `contact_preference` retained for compat, dropped from UI.
  - Location: create/update snapshot state/district/city from the latest approved registration; member form shows location read-only (no retype).
  - Admin-managed categories: new `showcase_categories` table (name/display_order/is_active) + seed (Packaging in; Manufacturing split; Other); public RLS read (active) + `admin_get_showcase_categories_with_session` + `admin_upsert_showcase_category_with_session`. Public/member/admin pages load categories from backend; member edit keeps a now-inactive stored category as an option.
  - Edge function `showcase-photo-upload` raised to 10 MB (already gated on paid `account_type`).
  - Paid-member gate preserved on create (`account_type in member/both`); the prior latent member_id/user_id snapshot bug fixed.
- **Files (new):** `supabase/migrations/20260623100000_business_showcase_v2.sql`, `src/pages/AdminShowcaseCategories.tsx`
- **Files (modified):** `supabase/functions/showcase-photo-upload/index.ts`, `src/lib/supabase.ts`, `src/pages/MemberShowcaseListings.tsx`, `src/pages/BusinessShowcase.tsx`, `src/pages/AdminShowcaseModeration.tsx`, `src/pages/AdminSettingsHub.tsx`, `src/components/admin/AppSidebar.tsx`, `src/App.tsx`
- **Validation:** `npm run lint` PASS (0 errors / 3 expected shadcn warnings), `npm run build` PASS (2026-06-23).
- **Runtime deployment:** Codex applied migration `20260623100000_business_showcase_v2.sql` to the linked Supabase DB on 2026-06-23, raised `showcase-photos` bucket limit from 5 MB to 10 MB, and redeployed `showcase-photo-upload`.
- **Runtime verification:** RPC probes returned normal JSON (not "function not found") for `get_public_showcase_listings`, `create_showcase_listing_with_session`, `update_showcase_listing_with_session`, `admin_get_showcase_listings_with_session`, `admin_get_showcase_categories_with_session`, and `admin_upsert_showcase_category_with_session`. Schema checks confirmed `photo_urls`, contact fields, show flags, and `city` exist; `showcase_categories` exists with 19 seeded categories, including Packaging and no bare Manufacturing. The storage bucket is public with `file_size_limit=10485760` and JPEG/JPG/PNG/WebP MIME restrictions. Live upload-function invalid-session probe returned normal `session_invalid` JSON. `npm run db:migrations:audit` PASS: local 264 / remote 264 / local_only 0 / remote_only 0. There are currently no existing single-photo showcase rows to sample for photo fallback; the legacy fallback is present in the applied read RPCs.

### CLU-FREE-PAID-MEMBERSHIP-001
- **Branch:** `main`
- **Commit:** Pending user instruction (do not commit/push without explicit request)
- **What shipped (frontend + runtime applied):**
  - Explicit `membership_application_type` ('free'|'paid', default 'paid') on `member_registrations`.
  - `submit_member_registration` stores the type and enforces paid-needs-proof server-side; Free apps get safe placeholders for NOT NULL payment columns.
  - `update_member_registration_status` promotes `account_type` to 'member' ONLY for approved PAID registrations; Free approvals stay `general_user`.
  - `create_showcase_listing_with_session` now gates on paid (`account_type in member/both`) and fixes a latent `member_id`/`user_id` lookup bug.
  - New `get_member_registration_types_with_session` read RPC powers the admin Free/Paid filter + per-row badge (no composite-type change).
  - New `membership_upgrade_requests` table + 4 `_with_session` RPCs (submit / get-mine / admin-list / admin-review). Approval is atomic: promotes `account_type` AND stamps the existing registration paid; approved-Free row is never mutated until approval.
  - Directory list query now gates on `membership_application_type='paid'` (Free Members are not listed as paid members).
  - Join page: Free vs Paid selector; payment proof required only for Paid; type sent to RPC.
  - Member dashboard: "Upgrade to Paid Membership" CTA for approved Free members → `/dashboard/upgrade` (new page with StateWiseFeePanel + payment proof upload + submit; shows "under review" when pending).
  - Admin Member Registrations: Free/Paid filter dropdown, per-row Free/Paid badge, and an "Upgrade Requests" tab (`AdminUpgradeRequests`) to approve/reject upgrades.
- **Files (new):** `supabase/migrations/20260622100000_free_paid_membership.sql`, `src/pages/MemberMembershipUpgrade.tsx`, `src/pages/AdminUpgradeRequests.tsx`
- **Files (modified):** `src/lib/supabase.ts`, `src/pages/Join.tsx`, `src/pages/Directory.tsx`, `src/pages/MemberDashboard.tsx`, `src/pages/AdminRegistrations.tsx`, `src/App.tsx`, `supabase/functions/showcase-photo-upload/index.ts`, `supabase/functions/improve-showcase-listing/index.ts`
- **Validation:** `npm run lint` PASS (0 errors / 3 expected shadcn warnings), `npm run build` PASS (2026-06-22).
- **Runtime deployment:** Codex applied migration `20260622100000_free_paid_membership.sql` to the linked Supabase DB on 2026-06-22.
- **Runtime verification:** RPC probes returned normal JSON (not "function not found") for invalid/input sessions: `submit_member_registration`, `create_showcase_listing_with_session`, `get_member_registration_types_with_session`, `submit_membership_upgrade_with_session`, `admin_list_membership_upgrade_requests_with_session`, and `admin_review_membership_upgrade_with_session`. Schema/data checks confirmed `member_registrations.membership_application_type` exists, is `NOT NULL`, defaults to `'paid'::text`, has CHECK (`free`,`paid`), and all 174 existing rows are `paid`. `npm run db:migrations:audit` PASS: local 263 / remote 263 / local_only 0 / remote_only 0.
- **Edge function hardening:** Codex updated and deployed `showcase-photo-upload` and `improve-showcase-listing` so both gate on paid `users.account_type in ('member','both')`, matching the showcase create RPC and removing the stale `member_registrations.member_id = <uuid>` lookup. Live invalid-session probes returned normal `session_invalid` JSON for both functions.

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
- Local source changes for `COD-MEMBER-DASHBOARD-FREE-PAID-FLOW-001` payment-page follow-up and `COD-MEMBERSHIP-PLANS-COMPARISON-UPDATE-001` are present but not committed. Migrations `20260624143000` and `20260624160000` are applied and verified. Local source changes for `COD-AUTH-FORM-BUILDER-PASSWORD-001` and `COD-JOIN-SMART-UPLOAD-SKIP-001` were committed in `c950af7` and pushed to `main`. Migration `20260624113000` is applied and verified. The Free/Paid migration `20260622100000`, Showcase v2 migration `20260623100000`, website/contact migration `20260623110000`, keywords migration `20260623113000`, and moderation/visibility migration `20260624100000` are applied and verified. The `showcase-photos` bucket is at 10 MB; `showcase-photo-upload` and `improve-showcase-listing` are redeployed.
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
