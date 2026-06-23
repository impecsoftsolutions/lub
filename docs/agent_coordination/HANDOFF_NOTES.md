# LUB Agent Handoff Notes

Overwrite this file each session; do not append a running journal.

## Current Owner

No active implementation slice.

## Latest Closed Slices

### COD-JOIN-SMART-UPLOAD-SKIP-001
- **Status:** Complete; source uncommitted (pending explicit user instruction).
- **Branch / Commit:** `main` / NOT YET COMMITTED
- **Summary:** Added a secondary `Skip` button beside the existing `Next` / `Review Details` button on the member registration smart document upload steps. It calls the same guided next handler, making optional uploads clearer without changing upload, extraction, persistence, or backend behavior.
- **Files:** `src/pages/Join.tsx`
- **Validation:** `npm run build` PASS; `npm run lint` PASS (0 errors / 3 expected shadcn warnings) on 2026-06-23.

### CLU-SHOWCASE-MODERATION-001
- **Status:** Frontend complete; migration applied and runtime verified. Source uncommitted (pending explicit user instruction).
- **Branch / Commit:** `main` / NOT YET COMMITTED
- **Summary:** Business Showcase moderation actions.
  - `is_public boolean NOT NULL DEFAULT true` on `showcase_listings`; public listing requires `status='approved' AND is_public=true`; get_public/get_member/admin_get surface `is_public`.
  - New admin `_with_session` RPCs (all `has_permission(members.edit)`): set-public-visibility (Hide/Show), admin-update (edit; preserves status; no photo/location change; contact visibility follows the member model — non-empty value is public), archived-only permanent delete (server-enforced). The member delete RPC is NOT reused.
  - AdminShowcaseModeration: explicit per-status action sets — pending = Approve/Reject-with-Note/Archive; approved+public = Hide/Edit/Archive; approved+hidden = Show/Edit/Archive; rejected = Edit/Approve/Archive; draft = Edit/Archive; archived = Delete (confirm modal). Hidden badge on hidden approved listings. New admin edit modal + delete-confirm modal.
  - Restore/Unarchive deferred (ambiguous restore status).
- **Validation:** lint PASS (0 errors / 3 expected shadcn warnings), build PASS (2026-06-24).
- **Codex runtime (CLU-SHOWCASE-MODERATION-001-RUNTIME):** Applied `supabase/migrations/20260624100000_showcase_moderation_visibility.sql` to the linked DB on 2026-06-23. `npm run db:migrations:audit` PASS: local 267 / remote 267 / local_only 0 / remote_only 0. Anon-key RPC probes for `admin_set_showcase_listing_public_visibility_with_session`, `admin_update_showcase_listing_with_session`, and `admin_delete_archived_showcase_listing_with_session` returned normal `session_invalid` JSON. DB checks confirmed `is_public` is `NOT NULL DEFAULT true`; existing approved listings remain public (`approved_total=1`, `approved_public=1`). A rollback-only valid-admin probe confirmed archived-only delete enforcement: delete on an approved listing returns `invalid_status` with "Archive it first."
- **Notes:** No edge function, storage, or bucket change. Member create/edit and public layout unchanged except hidden listings drop out of the public list.

### CLU-SHOWCASE-AI-VISION-001
- **Status:** Frontend + edge function complete; edge function redeployed. Source uncommitted (pending explicit user instruction).
- **Branch / Commit:** `main` / NOT YET COMMITTED
- **Summary:** Photo-aware AI for Business Showcase (one slice, no DB migration).
  - `improve-showcase-listing`: accepts `photo_urls` (validated against `${SUPABASE_URL}/storage/v1/object/public/showcase-photos/`, max 3 — SSRF guard); adds `input_image` items to the single OpenAI Responses call; image-aware no-invention prompt; returns `usedImages`; retries text-only if the model rejects images; clear error if there is neither usable text nor a successful image read. Paid gate + settings load unchanged.
  - `src/lib/supabase.ts`: `improveWithAI(token, listing, photoUrls?)` sends `photo_urls`, returns `usedImages`.
  - `MemberShowcaseListings.tsx`: AI button relabeled "Generate / Improve with AI", enabled when there is text OR ≥1 photo; uploads pending photos first (reusing `showcase-photo-upload`) and writes returned URLs back into photo state so Save does not re-upload; sends ordered URLs; toasts a fallback note when `usedImages=false`; suggestions stay review-only (never auto-saved/submitted).
- **Contact cleanup:** `MemberShowcaseListings.tsx` now shows `Contact email`, `Contact number`, and `Website` fields only. The old optional wording and public-display checkboxes were removed. Non-empty email/number/website values are public; blank values are hidden. Email and website are validated client-side and server-side; contact number is intentionally free-form for mobile or landline.
- **Keywords + categories:** Active showcase categories now sort A-Z with `Other` pinned last. Listings now have a searchable `keywords` field. Members can type keywords manually, generate only keywords with a separate button, or use the main AI generation to fill keywords along with title/product/description. Keywords remain internal/search-only on the public Business Showcase UI and are not shown as public chips.
- **Validation:** lint PASS (0 errors / 3 expected shadcn warnings), build PASS (2026-06-23). Contact/website follow-up revalidated with lint PASS (0 errors / 3 expected warnings) and build PASS on 2026-06-23.
- **Codex runtime (CLU-SHOWCASE-AI-VISION-001-RUNTIME):**
  - Redeployed `improve-showcase-listing` to linked Supabase project `qskziirjtzomrtckpzas` on 2026-06-23. Function list shows ACTIVE version 3 updated at 2026-06-23 09:34:50 UTC.
  - Live anon-key probes for text-only, foreign photo URL, and allowed `showcase-photos` URL payloads returned normal `session_invalid` JSON, confirming the deployed function is reachable and session-gated.
  - Full photo-to-suggestion smoke requires a valid signed-in paid-member session token and was not completed from the local runtime environment. An anon REST read of `ai_runtime_settings` returned no public rows, so the `business_showcase_drafting` model row could not be directly inspected without privileged DB access; the deployed source still defaults to `gpt-4o-mini` if the function does not receive a model override from runtime settings.
- **Contact/website runtime:** Applied `supabase/migrations/20260623110000_showcase_website_contact_validation.sql` to linked DB on 2026-06-23. It adds `showcase_listings.website_url`, validates optional email/website in create/update RPCs, returns `website_url` from public/member/admin reads, and treats filled email/phone/website as public. RPC probes with the new `p_website_url` param returned normal JSON for public/create/update/admin reads. Migration audit PASS: local 265 / remote 265.
- **Keywords runtime:** Applied `supabase/migrations/20260623113000_showcase_keywords.sql` to linked DB on 2026-06-23. It adds `showcase_listings.keywords`, returns keywords from public/member/admin reads, accepts `p_keywords` in create/update RPCs, and includes keywords in public/admin search. Redeployed `improve-showcase-listing` to ACTIVE version 4 (updated 2026-06-23 10:09:02 UTC). RPC probes with `p_keywords` returned normal JSON and migration audit PASS: local 266 / remote 266.
- **Notes:** Draft photos are already public (existing behavior) so passing public URLs to OpenAI adds no new exposure.

### CLU-SHOWCASE-V2-001
- **Status:** Frontend complete; migration applied and runtime verified. Source uncommitted (pending explicit user instruction).
- **Branch / Commit:** `main` / NOT YET COMMITTED
- **Summary:** Business Showcase v2.
  - Multi-photo: ordered `photo_urls jsonb` (up to 3, [0] = main), 10 MB each. Legacy `photo_url` kept + dual-written; read RPCs emit a unified `photos` array (photo_urls → [photo_url] → []). Existing single-photo rows backfilled. Helper `normalize_showcase_photos` clamps to 3.
  - Contact: nullable `contact_email`/`contact_phone` + `show_contact_email`/`show_contact_phone` (default false). Public RPC returns a contact value only when its show flag is true. Member form has explicit "Show publicly" toggles, default off.
  - Location: create/update snapshot state/district/city from the latest approved registration (member form shows it read-only). Added `city` column.
  - Categories: new `showcase_categories` table + seed (Packaging; Manufacturing split; Other); public RLS read (active) + `admin_get_showcase_categories_with_session` + `admin_upsert_showcase_category_with_session`; admin page `/admin/settings/showcase-categories` + Settings Hub card + sidebar link; member/public/admin dropdowns load from backend; member edit keeps a now-inactive stored category as an option.
  - create/update RPCs changed signature (DROP + CREATE) to take `p_photo_urls jsonb` + contact params; paid `account_type` gate preserved; latent member_id/user_id snapshot bug fixed.
- **Validation:** lint PASS (0 errors / 3 expected shadcn warnings), build PASS (2026-06-23).
- **Codex runtime:** Applied `supabase/migrations/20260623100000_business_showcase_v2.sql` to the linked DB on 2026-06-23, raised `showcase-photos` bucket limit from 5 MB to 10 MB, and redeployed `showcase-photo-upload`.
- **Runtime verification:** RPC probes returned normal JSON (not PostgREST "function not found") for `get_public_showcase_listings`, `create_showcase_listing_with_session`, `update_showcase_listing_with_session`, `admin_get_showcase_listings_with_session`, `admin_get_showcase_categories_with_session`, and `admin_upsert_showcase_category_with_session`. Schema checks confirmed `photo_urls`, contact fields, show flags, and `city` exist; `showcase_categories` exists with 19 seeded categories, including Packaging and no bare Manufacturing. Bucket verification: public, `file_size_limit=10485760`, JPEG/JPG/PNG/WebP MIME restrictions. Live upload-function invalid-session probe returned normal `session_invalid` JSON. `npm run db:migrations:audit` PASS: local 264 / remote 264 / local_only 0 / remote_only 0. There are currently no existing single-photo showcase rows to sample for photo fallback; the legacy fallback is present in the applied read RPCs.
- **Notes:**
  - The `showcase-photo-upload` and `improve-showcase-listing` edge functions already gate on paid `account_type` (Codex hardened them in the previous slice).
  - Backward compatibility: existing approved single-photo listings continue to display via the unified `photos` fallback; `photo_url` and `contact_preference` retained (deprecation deferred).

### CLU-FREE-PAID-MEMBERSHIP-001
- **Status:** Frontend complete; migration applied and verified. Source uncommitted (pending explicit user instruction).
- **Branch / Commit:** `main` / NOT YET COMMITTED
- **Summary:** Implements the Free vs Paid membership process and Free→Paid upgrade per the Codex-approved plan.
  - DB: explicit `membership_application_type` ('free'|'paid', default 'paid'); `submit_member_registration` stores it and enforces paid-needs-proof; `update_member_registration_status` promotes `account_type` to 'member' only for approved PAID rows (Free approvals stay general_user); `create_showcase_listing_with_session` now gates on paid `account_type` (and fixes a latent member_id/user_id lookup bug); new `get_member_registration_types_with_session`; new `membership_upgrade_requests` table + 4 RPCs with atomic approval (promote account_type + stamp existing registration paid; approved-Free row untouched until approval).
  - Frontend: Join Free/Paid selector + conditional payment proof; Directory list gated on paid; dashboard Upgrade CTA; `/dashboard/upgrade` page; admin Free/Paid filter + badge + Upgrade Requests tab.
- **Validation:** lint PASS (0 errors / 3 expected shadcn warnings), build PASS (2026-06-22).
- **Codex runtime:** Applied `supabase/migrations/20260622100000_free_paid_membership.sql` to the linked DB on 2026-06-22. RPC probes returned normal JSON (not PostgREST "function not found") for invalid/input sessions: `submit_member_registration`, `create_showcase_listing_with_session`, `get_member_registration_types_with_session`, `submit_membership_upgrade_with_session`, `admin_list_membership_upgrade_requests_with_session`, `admin_review_membership_upgrade_with_session`. Schema/data checks confirmed `member_registrations.membership_application_type` exists, is `NOT NULL`, defaults to `'paid'::text`, has CHECK (`free`,`paid`), and all 174 existing rows are `paid`. `npm run db:migrations:audit` PASS: local 263 / remote 263 / local_only 0 / remote_only 0.
- **Notes / decisions:**
  - The migration adds a 7th param to `submit_member_registration` via DROP + CREATE (no overload ambiguity); only the frontend calls it.
  - Codex updated and deployed the two showcase EDGE FUNCTIONS (showcase-photo-upload, improve-showcase-listing) so both gate on paid users.account_type in ('member','both'), mirroring the RPC fix and removing the stale member_registrations.member_id = <uuid> lookup. Live invalid-session probes returned normal session_invalid JSON for both functions.
  - No `membership_tier`/`membership_status` field; Free vs Paid stays derived from `account_type` + approved active registration. Backend enum unchanged.

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

### COD-AUTH-FORM-BUILDER-PASSWORD-001
- **Status:** Complete locally; source uncommitted; migration not yet applied.
- **Branch / Commit:** `main` / NOT YET COMMITTED.
- **Summary:** Corrected the recent password-login UI architecture so password and sign-in auth fields are represented by Form Builder V2 instead of hardcoded page-only fields. The migration `20260624113000_form_builder_password_auth_fields.sql` allows `password` in form-builder storage constraints, seeds locked system field-library entries for `identifier` and `password`, adds signup `password`, replaces sign-in email/mobile fields with `identifier` + `password`, updates live snapshots, and replaces the publish guard so signup requires email/mobile/password and sign-in requires identifier/password. Follow-up review fix: the migration sets `lub.form_builder_live_write_context='publish_rpc'` before live snapshot writes, avoiding the live-fields guard trigger failure. `SignUpV2` now reads password from configured form data, still excludes it from dynamic payload storage, and falls back to one password field if the DB is still on the old signup config. `SignIn` loads `signinFormConfigV2Service` and falls back to `identifier` + `password` fields if the DB is still on the old sign-in config.
- **Security:** Password continues to be passed only as a dedicated auth RPC parameter. It is not stored in `dynamicPayload` or form submissions. Existing hashing/reset/session RPCs are unchanged.
- **Validation:** `npm run build` PASS; `npm run lint` PASS (0 errors / 3 expected shadcn warnings) on 2026-06-23.
- **Runtime TODO:** Apply `supabase/migrations/20260624113000_form_builder_password_auth_fields.sql` after this source is deployed, not before. Release sequence: deploy source first, wait for Railway success, then immediately apply the migration. After applying, verify `/signin`, `/signup`, `/signin?preview=1`, and `/signup?preview=1` load configured auth fields.

Source files remain uncommitted pending explicit user instruction.

## Next Queue

Track ready items only in `docs/agent_coordination/TASK_BOARD.md`:
- `COD-MSME-ISSUES-001`
- `COD-PUBLIC-001`
- `COD-MEMBERS-EXPORT-002`
