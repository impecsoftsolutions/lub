# LUB Web Portal - Current State

**Last updated:** 2026-04-12
**Updated by:** Claude

---

## Project

- **Repo:** `C:\webprojects\lub`
- **Latest deep handover:** `docs/session_documents/session_77_field_length_backend_contracts.md`
- **Project guide:** `docs/lub_web_portal_project_guide_for_claude_code.md`

---

## Current Baseline

| Check | Status |
|-------|--------|
| Build (`npm run build`) | PASS (2026-04-12) |
| Lint (`npm run lint`) | PASS - 0 errors, 3 warnings in shadcn primitives (expected) (2026-04-12) |
| Phase 1 destructive smoke | **15 passed** (verified 2026-03-13 baseline) |
| Phase 1 readonly smoke | PASS - 3 passed / 12 skipped (2026-04-12) |

Phase 1 destructive baseline remains the non-negotiable floor.

---

## Active Stream

**Active stream:** None. All queued work is complete.
**Current owner:** None
**Task board:** `docs/agent_coordination/TASK_BOARD.md`
**Current handoff state:** `CLAUDE-FIELD-LENGTH-001` complete. Full field-length stack is live: backend DB/RPC contracts (Codex) + UI inputs, hook helpers, and runtime enforcement (Claude).

Most recently completed streams:
- **CLAUDE-FIELD-LENGTH-001**: Implemented frontend consumption of field-level length contracts. Added `min_length`/`max_length` to `useFormFieldConfig` hook (`FieldConfigMap` interface, all 4 builder branches, `getFieldMinLength`/`getFieldMaxLength` helpers). Added min/max length inputs to `AdminFieldLibrary` create/edit form (applicable types only: text/textarea/email/tel/number/url). Added `maxLength` HTML attribute to all text/textarea inputs in Join and MemberEditProfile. Added length validation checks in `validateForm` of both forms (max-length hard stop, min-length error before regex). `EMPTY_FORM` constant and `startEdit` pre-fill updated with length fields.
- **COD-FIELD-LENGTH-001**: Implemented field-level length contract foundation for Form Builder V2. Added nullable `min_length` / `max_length` columns to field library + draft/live form-field tables, extended field read payloads (builder schema, field library, Signup/Signin/Join/MemberEdit live+draft RPCs), extended field-library create/update write contracts with type-aware length guardrails, and exported matching type/service support in `src/lib/supabase.ts`.
- **COD-AI-RUNTIME-003**: Cut over live `normalize-member` to DB-backed AI runtime settings. Added/deployed `supabase/functions/normalize-member/index.ts` (version 11) to read `provider/model/reasoning_effort/api_key_secret` from `public.ai_runtime_settings` (`member_normalization`) via `SUPABASE_SERVICE_ROLE_KEY`. Verified live probe returns valid normalization response and remote function-body scans now show `OPENAI_API_KEY=MISS` for all deployed functions.
- **COD-AI-VERIFY-003**: Completed read-only live verification of deployed `normalize-member` dependency chain. Pulled remote function body via Supabase management API and inspected ESZIP bundle strings; confirmed deployed code still contains `const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")` and `"OPENAI_API_KEY not configured"` error path. Decision: keep `OPENAI_API_KEY` in Edge secrets until a new function version is deployed that no longer depends on it.
- **COD-AI-SETTINGS-002**: Added OpenAI reasoning setting support end-to-end. New migration `20260412222000_add_ai_runtime_reasoning_effort.sql` adds `reasoning_effort` to AI runtime settings and extends AI settings RPC contracts; client service/types and Admin AI Settings page now support conditional reasoning dropdown for OpenAI only. Runtime profile now exports reasoning effort in `_ai_runtime` hint payload.
- **COD-VAL-DESC-002**: Closed the backend persistence gap for validation-rule description edits. Added migration `20260412201500_update_validation_rule_with_description_param.sql` extending `update_validation_rule_with_session` with `p_description`, updated `validationRulesService.updateValidationRule` typing/RPC payload, and wired `editedDescription` into `AdminValidationSettings` save flow so description updates survive reloads.
- **CLAUDE-THEME-001 + CLAUDE-SIDEBAR-LOGO-001 + CLAUDE-VAL-DESC-001**: (1) Renamed "Appearance" → "Theme" in sidebar nav, Settings Hub card, and page title — route unchanged. (2) Sidebar logo button now acts as collapse trigger: `toggleSidebar` on click, `PanelLeftClose` hover affordance, desktop `SidebarTrigger` hidden, mobile trigger preserved. (3) Description textarea added to validation rule edit form with full state management; backend persistence dependency is now closed by `COD-VAL-DESC-002`.
- **COD-AI-SETTINGS-001**: Added secure AI runtime settings management for normalization workflows. Implemented `settings.ai.view/manage` permissions, singleton settings table, masked read and session-wrapped write RPCs, non-sensitive public runtime profile RPC, and admin page wiring (`/admin/settings/ai`) via Settings Hub and sidebar.
- **COD-APPEAR-LINK-002**: Completed targeted appearance-token linkage cleanup across Join/admin/login-auth scope. Replaced remaining hardcoded color/shadow classes with semantic theme-token classes (including Form Studio/Form Editor preview/status surfaces), then ran a scoped audit that returned `NO_HARDCODED_CLASSES_FOUND` for the targeted domain.
- **COD-USR-001**: Fixed Admin Users Edit User modal interaction/persistence blocker. Root cause was overlay layering (modal rendering beneath/backdrop interference), not RPC. Modal now uses stable dialog layering (`z-[80]` shell, backdrop below, modal panel above with click isolation) and tokenized success/error visuals for theme consistency. User confirmed fix in runtime.
- **CLAUDE-VERIFY-UX-001 + CLAUDE-VERIFY-UX-002 + CLAUDE-FORM-UPLOAD-001**: Three UX polish slices for Member Registration and Member Edit forms: (1) Verify spinner now activates immediately when the user clicks Verify (before `validateForm()`) so there's no idle pause; (2) On Verify validation failure, page auto-scrolls and focuses the first invalid field by DOM `id` with fallback to next key if element missing/hidden; (3) Document upload controls now show a styled `Upload File` / `Upload New File` button label instead of the native file input UI, with `View current ...` links and selected-file name display preserved.
- **COD-VERIFY-BUG-001 + COD-VAL-LIVE-002**: Closed Member Edit verify false-positive bug by moving required checks to a configuration-driven pass over all visible+required fields (including `alternate_contact_name`) with file/city conditional handling. Added form-level `onBlur` live validation in Member Registration and Member Edit so mapped validation rules (for example NAME FORMAT) surface inline during interaction before final Verify.
- **COD-FORMS-PORTAL-009**: Replaced hardcoded runtime field names/placeholders in Join + Member Edit with metadata getters from `useFormFieldConfig` (`getFieldLabel`, `getFieldPlaceholder`, `getFieldOptions`) so configured labels in Field Library are reflected on live forms. Kept technical keys/contracts unchanged and preserved existing visibility/required/validation/submission behavior.
- **COD-FORMS-PORTAL-008**: Completed user-facing naming consistency for Member Registration. Updated Join page heading, Home page CTA label, and Form Studio/Form Builder display labels so `join_lub` renders as "Member Registration Form" while preserving technical keys/routes/RPC contracts.
- **COD-FORMS-PORTAL-007**: Corrected Member Edit preview UX and visual parity. In `/dashboard/edit?preview=1`, top/back and footer/cancel actions now return to `/admin/form-studio/member_edit` instead of navigating to live profile, and the blue-tinted heading/preview strip was replaced with neutral tokenized styling to match signup/signin/member-registration pages.
- **COD-FORMS-PORTAL-006**: Fixed critical preview data-isolation issue in Member Edit. `/dashboard/edit?preview=1` no longer loads live member profile data for the logged-in admin/user. Preview mode now resets to safe empty values, skips live profile fetch path, and bypasses non-preview-only auth/profile guards for read-only structure preview.
- **COD-FORMS-PORTAL-005**: Closed remaining non-tokenized visual shell styles in Member Edit and Join. Removed hardcoded blue gradient/amber preview strip/white text usage in Member Edit banner shell and tokenized Join submit/verify text-state classes so both flows better track Appearance settings (`primary`, `secondary`, `destructive`, `muted`, `border`, `shadow-sm`).
- **COD-FORMS-PORTAL-004**: Hardened theme-token parity for Member Registration (`/join`) and Member Edit (`/dashboard/edit`) form surfaces by replacing remaining hardcoded red/blue/green/shadow utility classes with appearance-tokenized classes (`destructive`/`primary`/`secondary`/`shadow-sm`). This ensures both forms track active theme settings more consistently without changing submission/auth/runtime behavior.
- **COD-MEMBER-EDIT-PARITY-002**: Closed Member Edit field/data parity gap against Member Registration model. Added missing document field support in Member Edit (`gst_certificate_url`, `udyam_certificate_url`, `payment_proof_url`) with file selection/upload + current-file links, wired these fields into validation/load/save, and updated `update_member_profile` RPC to persist document URL updates. Save flow now merges loaded original data with current edits before RPC write so unchanged values are preserved safely.
- **COD-JOIN-RUNTIME-003**: Closed Join/Member Registration runtime parity + normalization verification slice. `Join.tsx` now enforces field applicability (Builder visibility + conditional rules such as GST-dependent fields) across required-field checks, dynamic validation mapping, submission sanitization, document upload payload selection, and normalization payload composition. This prevents hidden/inactive field values from being validated or submitted and keeps Join runtime aligned with Builder live form behavior.
- **COD-TECH-002**: Fixed both remaining build warnings safely. Resolved Tailwind CSS minifier warning by removing malformed `has-*` selector generation in shared Card header class, and removed >500k admin chunk warning by splitting admin bundle into scoped chunks (`app-admin-core`, `app-admin-forms`, `app-admin-members`, `app-admin-users`) in `vite.config.ts`. Validation: lint PASS (0 errors / 3 expected warnings), build PASS with no css-syntax/chunk-size warnings, Phase1 readonly smoke PASS (3 passed / 12 skipped).
- **COD-USR-DELMODAL-002**: Fixed Admin Users Delete User Account modal overlay stacking and interaction regression. Dialog now renders above backdrop, checkbox interaction stays inside modal (no accidental close), and delete-warning UI contrast was improved using tokenized destructive/success visual states.
- **COD-REG-DEL-003**: Fixed Admin Registrations delete no-op. Restored missing `openDeleteDialog` handler in registrations actions flow so Delete consistently opens the confirmation dialog and proceeds via existing soft-delete/archive path.
- **COD-REG-UX-002**: Fixed Admin Registrations + Edit Member modal defects. Pending member names now render bold in pending state, pending approvals count now uses session-based registrations read path (same security model as pending cities), custom-city required validation now respects existing value and required logic, custom city text is preserved when toggling city `Other <-> standard city`, and edit-modal close/success now returns to the true origin context (list vs Application Review modal).
- **COD-FORM-SYSTEM-CLEAN-001**: Applied migration `20260410183000_hide_system_fields_from_builder_access.sql` to remove reserved system metadata keys (`id`, `status`, `created_at`, `updated_at`) from Builder/Studio-accessible schema, field-library listings, and Join/Member Edit runtime contracts. Added backend write guards so these keys cannot be reattached or recreated via Builder RPC paths.
- **COD-VAL-MEMBER-EDIT-001**: Fixed form-aware validation runtime parity for Member Edit and Join. `validationService.validateByFieldName` now accepts `formKey` (`join_lub` / `member_edit`) instead of hardcoded Join mapping, `useValidation` now passes form context, and Member Edit required/format checks now honor field visibility so hidden fields do not block save/submit.
- **CLAUDE-JOIN-EDIT-UI-001**: Member Edit pilot UI wired to Builder contracts. `useFormFieldConfig` switched from legacy → `builder_live`/`builder_draft` for `member_edit`. `isFieldVisible` checks added to all configurable fields (personal info, company, business, registration, alternate contact). Preview gate: `no_session` redirects to signin, `access_denied`/`load_failed` render blocking screens. Preview banner + submit/verify blocked in preview mode. Studio preview path extended: `member_edit` → `/dashboard/edit?preview=1`.
- **COD-MEMBER-EDIT-BE-001**: Added Member Edit Builder backend/runtime contracts. Seeded `member_edit` form from `join_lub` draft baseline, added authenticated live read RPC (`get_member_edit_form_configuration_v2_with_session`) and admin draft preview RPC (`get_member_edit_form_configuration_v2_draft_with_session`), and exported client services/hooks support (`memberEditFormConfigV2Service`, `builder_live`/`builder_draft` hook support for `member_edit`) to unblock pilot Member Edit UI.
- **COD-JOIN-PREVIEW-003**: Added Join draft preview hardening for Form Studio preview path. Implemented admin-gated Join draft read RPC (`get_join_form_configuration_v2_draft_with_session`), added `joinFormConfigV2Service.getDraftConfiguration()`, extended `useFormFieldConfig` with `builder_draft` source/error codes, and updated Join runtime preview handling (`no_session` signin redirect with `next`, admin-only access block, no live fallback). Join preview verify/submit actions are now read-only.
- **CLAUDE-TERM-001**: Renamed "Join LUB Form" → "Member Registration Form" in all UI labels (`AdminFormsList.tsx`, `AdminFormFieldConfiguration.tsx`). Technical keys/paths/form_key values unchanged.
- **CLAUDE-JOIN-UI-003**: Enabled Join form preview entrypoint in Studio — `join_lub` now routes to `/join?preview=1` in the preview path ternary. Updated fallback toast to generic copy.
- **COD-SIGNUP-LEGACY-REMOVE-003**: Permanently removed legacy Signup fallback by deleting `/signup-legacy`, deleting `SignUp.tsx`, and removing `VITE_SIGNUP_PRIMARY_MODE` rollback routing logic so `/signup` is always Builder-driven Signup V2.
- **COD-FORM-DEPRECATE-002**: Hard removed obsolete admin Signup configuration page by deleting route `/admin/settings/forms/signup` and removing `AdminSignupFormConfiguration` page implementation.
- **COD-UI-013**: Removed Signup Form card from the Form Configuration hub page so centralized Form Builder is the primary admin path.
- **COD-JOIN-FORM-002**: Join runtime is now linked to Builder live contracts. Added public Join live configuration RPC (`get_join_form_configuration_v2`), moved Join field visibility/required reads to Builder live via hook options, and aligned Join validation lookup to Builder live validation mappings with legacy fallback.
- **COD-SIGNIN-GUARD-002**: Hardened `/signin` behavior for authenticated users. Logged-in users are now redirected immediately (no sign-in form flash) to safe `next`, last tracked non-signin route, same-origin referrer, then `/dashboard` fallback.
- **CLAUDE-UI-012**: Moved Dashboard link from the public header bar into the user dropdown menu. Removed standalone button from desktop nav and mobile menu; Dashboard is now the first item in the dropdown (before My Profile / Settings / Admin Panel).
- **COD-SIGNIN-FORM-001**: Sign-In is now under Form Builder live configuration model. Added `signin` form seed + protected core fields (`email`, `mobile_number`), new live/draft Sign-In configuration RPCs, publish guard enforcement for Sign-In core fields, Sign-In runtime loading from published live config with admin-only draft preview gate, and Studio preview support for Sign-In (`/signin?preview=1`).
- **COD-FIELDLIB-SEARCH-001**: Added smart search to Field Library with ranked multi-attribute matching (label/key/section/type/validation/status/flags), plus explicit empty-state and filtered-count feedback.
- **COD-VAL-FORM-001**: Linked Validation Settings with Form Builder + Signup runtime. Field Library now supports selecting active validation rules, Signup client-side validation enforces mapped regex rules, and signup account creation RPC now validates against published live form snapshot (not draft) while skipping inactive rules safely.
- **COD-SIGNUP-CUTOVER-002**: Removed pilot route `/signup-v2` after cutover; Studio preview and preview login-return now use `/signup?preview=1` only.
- **COD-SIGNUP-CUTOVER-001**: Primary signup route cutover complete. `/signup` serves Signup V2 (legacy fallback route/switch later removed in `COD-SIGNUP-LEGACY-REMOVE-003`).
- **COD-UI-011**: Removed helper/instruction notes beneath fields on public Signup V2 output so the signup form shows only labels, controls, and validation feedback unless explicitly requested.
- **COD-UI-010**: Tightened Signup V2 visual sizing to match legacy Signup layout (container width, heading/subheading scale, core input/select paddings) while preserving preview/unpublish behavior.
- **CLAUDE-FB23-GATE-001 / CLAUDE-FB23-UNPUB-001 / CLAUDE-FB23-STATUS-001**: Preview access hard gate (no silent fallback), Unpublish action in Studio, badge/status alignment for `unpublished` origin across Studio and Builder. SignIn `?next=` redirect wired for post-login return to preview URL.
- **COD-FB23-BE-001**: Preview access + unpublish backend contracts - added `unpublish_form_builder_v2_with_session`, extended live origin to include `unpublished`, switched public signup runtime config read to live-only (no draft fallback), and exported draft error classification for frontend gating.
- **COD-PUBLISH-001**: Manual publish gate hardening + publish origin visibility - blocked direct writes to live form snapshots outside explicit publish context, added `_with_session` publish-status read contracts, and surfaced live origin metadata (`manual`, `legacy seeded`, `not published`) in Form Builder and Form Studio.
- **COD-FB23-001**: Form Builder and Signup preview consistency fixes - Signup draft preview RPC for `preview=1`, controlled select-option resolver alignment, unresolved-select required guard, and Field Library options parsing UX fix.

Deferred by decision:
- Legacy individual Join form page remains during UAT (`/admin/settings/forms/join-lub`).

---

## Last Verified

- **When:** 2026-04-12
- **What:** Field length frontend implementation (`CLAUDE-FIELD-LENGTH-001`)
- **Result:** PASS
- **Commands:**
  ```
  npm run lint     → 0 errors / 3 warnings (expected)
  npm run build    → PASS
  npm run test:e2e:phase1:local → 3 passed / 12 skipped (baseline intact)
  ```

---

## In Progress / Dirty State

No active coordinated slice. Working tree is clean relative to CLAUDE-FIELD-LENGTH-001 completion.

Working tree may contain additional unrelated local changes from prior sessions. Do not revert without explicit user direction.

---

## Deferred / Next Candidate Work

When forms stream is complete, next top candidates are:
1. `COD-MSME-SHOWCASE-001` - **new priority**: MSME product showcase platform with free + member tiers (product display, photo gallery, inquiry form). Higher priority than news/events. Needs product scoping session with user before starting.
2. `COD-MSME-ISSUES-001` - MSME issue intake/categorization platform (deferred by user).
3. `COD-PUBLIC-001` - populate public Events/News/Activities pages beyond placeholder headings (lower priority than showcase, deferred by user).
4. `CLAUDE-FORM-UPLOAD-002` - replace remaining native file input text with standardized upload button pattern where still present.

---

## Known Risks / Watch Items

- Readonly smoke can show occasional login-route flakiness; rerun currently passes.
- Main chunk size warning can still appear as a non-blocking optimization warning.
- Migration safety workflow remains mandatory: audit first, apply only targeted versions, verify after each apply.
- Join legacy settings page still exists by design until UAT sign-off on Builder/Studio workflows.

---

## References

- Task board: `docs/agent_coordination/TASK_BOARD.md`
- Handoff notes: `docs/agent_coordination/HANDOFF_NOTES.md`
- Project guide: `docs/lub_web_portal_project_guide_for_claude_code.md`
- Latest deep handover: `docs/session_documents/session_77_field_length_backend_contracts.md`
