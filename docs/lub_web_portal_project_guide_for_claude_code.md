# LUB Web Portal - Project Guide For Claude Code

**Project name:** LUB Web Portal  
**Repo root:** `C:\webprojects\lub`  
**Document purpose:** Give Claude Code a practical, technically accurate understanding of this project so it can work productively without first rediscovering the architecture, current checkpoint, and recent hardening/testing history.  
**Current document date:** 2026-03-19  

## 1. What This Project Is

LUB Web Portal is a Vite + React + TypeScript + Supabase web application for Laghu Udyog Bharati.

At a product level, the app has three broad surfaces:

1. **Public website**
   - home page
   - directory of approved members
   - leadership, events, news, activities
   - membership benefits
   - join / application flow
   - payment page

2. **Member experience**
   - passwordless sign-up and sign-in using email + mobile
   - dashboard
   - profile view/edit
   - reapply flow for rejected registrations
   - settings / credential-change flows
   - password reset and change-password flows still exist in code as supporting infrastructure, but the active auth direction is custom session + email/mobile

3. **Admin portal**
   - registrations review and mutation flows
   - deleted members restore
   - states, districts, cities, pending cities, payment settings
   - organization profile and designations
   - form configuration and validation settings
   - user/role administration

This is not a typical Node/Express backend project. The browser talks directly to Supabase for reads and for many mutations, often via RPC functions. That means the real security boundary is split across:

- frontend service-layer behavior in `src/lib/supabase.ts`
- Supabase SQL/RPC functions under `supabase/migrations/`
- RLS policies and helper functions in the database

## 2. Current Checkpoint You Should Treat As Truth

This repo recently completed a major Phase 1 hardening and runtime-verification stream. That work is described in:

- `docs/session_documents/session_48_phase1_runtime_verification_completion_and_next_stream_handover.md`

Important current truths:

- destructive Playwright Phase 1 baseline is **15 passed**
- completed Phase 1 domains should not be reopened casually
- the recent stream established a stronger security direction:
  - privileged browser/admin writes should move to server-authoritative `_with_session` RPC wrappers
  - wrappers accept `p_session_token`
  - server derives acting user with `resolve_custom_session_user_id(...)`
  - server enforces permission with `has_permission(...)`
  - client-supplied actor UUIDs are considered weaker legacy patterns

Important practical warning:

- the repo contains many root-level markdown files documenting past fixes and debugging sessions
- those files are useful context, but they are not all equally current
- for the most recent architectural truth, prefer:
  1. current code
  2. `docs/session_documents/session_48_phase1_runtime_verification_completion_and_next_stream_handover.md`
  3. then older one-off docs only if needed

## 3. High-Level Tech Stack

### Frontend

- Vite
- React 18
- TypeScript
- React Router
- Tailwind CSS
- Lucide icons
- DnD Kit for reorderable admin UIs

### Backend / Data / Auth

- Supabase JS client
- Supabase Postgres
- Supabase RPC functions
- Supabase Storage
- custom session-token auth model layered on top of Supabase data model

### Testing

- Playwright
- targeted Phase 1 smoke harness under `tests/e2e/`

### Build / Tooling

- Vite build
- ESLint
- Tailwind/PostCSS

## 4. Important Top-Level Files And Folders

### Core app entry

- `src/main.tsx`
  - React entry point
- `src/App.tsx`
  - route tree and route grouping

### Core runtime logic

- `src/lib/supabase.ts`
  - central service layer
  - the single most important file for understanding data access and mutation patterns
- `src/lib/customAuth.ts`
  - custom passwordless auth/session logic
- `src/lib/sessionManager.ts`
  - localStorage-based session persistence and refresh handling
- `src/lib/memberAuth.ts`
  - member-facing auth helpers on top of custom auth
- `src/lib/permissionService.ts`
  - permission loading and permission checks
- `src/lib/validation.ts`
  - shared validation stack
- `src/lib/credentialValidation.ts`
  - canonical email/mobile credential-format validation helper

### Contexts and hooks

- `src/contexts/MemberContext.tsx`
- `src/contexts/PermissionContext.tsx`
- `src/contexts/AdminContext.tsx`
- `src/hooks/usePermissions.ts`
- `src/hooks/useValidation.ts`
- `src/hooks/useFormFieldConfig.ts`

### Major page groups

- `src/pages/`
  - public, member, and many admin pages live here
- `src/pages/AdminDashboard/PaymentSettings.tsx`
  - admin payment settings domain
- `src/pages/admin/AdminUsers.tsx`
  - route wrapper around admin users surface

### Components

- `src/components/Layout.tsx`
  - public shell
- `src/components/admin/AdminLayout.tsx`
  - admin shell
- `src/components/EditMemberModal.tsx`
- `src/components/ViewApplicationModal.tsx`
- `src/components/member/ChangeCredentialModal.tsx`
- `src/components/admin/modals/EditUserModal.tsx`

### Database and migrations

- `supabase/migrations/`
  - all SQL schema, policy, function, and RPC evolution

### Tests

- `playwright.config.ts`
- `tests/e2e/phase1-production-smoke.spec.ts`
- `tests/e2e/helpers/auth.ts`
- `tests/e2e/helpers/fixtures.ts`

### Session continuity

- `docs/session_documents/session_46_passwordless_auth_hardening_dashboard_landing.md`
- `docs/session_documents/session_47_phase1_hardening_smoke_automation_pending_city_workflow.md`
- `docs/session_documents/session_48_phase1_runtime_verification_completion_and_next_stream_handover.md`

## 5. Routing Model

The route tree is defined in `src/App.tsx`.

### Public routes under `Layout`

- `/`
- `/members`
- `/member/:id/:companySlug/:nameSlug`
- `/events`
- `/news`
- `/activities`
- `/leadership`
- `/join`
- `/membership-benefits`
- `/styleguide`
- `/payment`

### Auth routes

- `/signin`
- `/signup`
- `/verify-email`
- `/forgot-password`
- `/reset-password`

### Member routes

- `/dashboard`
- `/dashboard/profile`
- `/dashboard/edit`
- `/dashboard/settings`
- `/dashboard/reapply`
- `/dashboard/change-password`

### Admin routes

Admin shell is rendered through `AdminLayoutWrapper`, which uses `sessionManager.getUserData()` and `AdminContextProvider`.

Canonical admin paths:

- `/admin/dashboard`
- `/admin/members/registrations`
- `/admin/members/deleted`
- `/admin/members/visibility`
- `/admin/locations/states`
- `/admin/locations/states/:stateName/locations`
- `/admin/locations/cities`
- `/admin/locations/pending-cities`
- `/admin/locations/payment-settings`
- `/admin/organization/profile`
- `/admin/organization/designations`
- `/admin/settings/forms`
- `/admin/settings/forms/join-lub`
- `/admin/settings/validation`
- `/admin/administration/users`

There are also multiple legacy redirect routes that map older admin URLs to the new structure.

## 6. Authentication And Session Model

This is one of the most important parts of the system.

### Core auth direction

The project moved away from password-based login and toward custom email + mobile based authentication with a custom session table and session token.

### Key files

- `src/lib/customAuth.ts`
- `src/lib/sessionManager.ts`
- `src/lib/memberAuth.ts`
- `src/types/auth.types.ts`

### Session storage

Default session config in `src/types/auth.types.ts`:

- session duration: 7 days
- refresh interval: 5 minutes
- storage key: `lub_session_token`

Local storage keys used by the app and Playwright harness:

- `lub_session_token`
- `lub_session_token_expiry`
- `lub_session_token_user`

### Browser-side flow

`customAuth.signIn(email, mobile)`:

- normalizes email and mobile
- validates credential shape
- uses Supabase RPCs like:
  - `lookup_user_for_login`
  - `record_failed_login_attempt`
  - `mark_user_login_success`
- creates a custom auth session using:
  - `generate_session_token`
  - insert into `auth_sessions`

### Member sign-up

`memberAuthService.signUpMember(email, mobile_number)`:

- uses RPC `create_portal_user_with_session`
- returns:
  - user
  - sessionToken
  - expiresAt

### Session validation

`customAuth.validateSession(sessionToken)` calls:

- `get_session_user_by_token`

### Session refresh

`sessionManager.startSessionRefresh()`:

- periodically refreshes active sessions
- skips refresh after long inactivity
- updates expiry in localStorage

### Admin shell access

`src/components/admin/AdminLayout.tsx`:

- checks session token presence
- checks session expiry
- fetches current user via `customAuth.getCurrentUserFromSession()`
- allows admin shell only when `account_type` is `admin` or `both`
- redirects to `/signin` otherwise

## 7. Permission Model

Permissions are not only UI flags; they are part of the server-side hardening model.

### Key files

- `src/contexts/PermissionContext.tsx`
- `src/hooks/usePermissions.ts`
- `src/lib/permissionService.ts`
- `src/types/permissions.ts`
- `src/components/permissions/PermissionGate.tsx`

### How it works

`PermissionProvider`:

- loads current authenticated user via `customAuth.getCurrentUserWithPermissions()`
- caches user + permissions in memory
- refreshes on window focus

`permissionService`:

- fetches permission list via RPC `get_user_permissions`
- fetches roles via RPC `get_user_roles`
- checks individual permission via RPC `has_permission`
- computes primary role priority:
  - `super_admin > admin > editor > viewer`

### Important coding invariant

UI permission gates are useful, but they are not the trust boundary.

The intended trust boundary for privileged writes is:

- frontend calls `_with_session` RPC
- backend derives actor from session token
- backend checks permission code server-side

## 8. Supabase Service Layer Architecture

`src/lib/supabase.ts` is the central access layer. Claude Code should inspect this file before changing any domain because it contains:

- Supabase client initialization
- TypeScript interfaces for key entities
- nearly all read/write service functions
- a mixture of:
  - direct table reads
  - direct browser writes
  - hardened `_with_session` RPC-based writes

### Environment assumptions

The file expects:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

If either is missing, the file throws during initialization.

### Major service groupings in `src/lib/supabase.ts`

- `userRolesService`
- `statesService`
- `locationsService`
- `adminCitiesService`
- `citiesService`
- `organizationProfileService`
- `companyDesignationsService`
- `stateLeadersService`
- `fileUploadService`
- `memberRegistrationService`
- `lubRolesService`
- `memberLubRolesService`
- `directoryVisibilityService`
- `formFieldConfigService`
- `memberAuditService`
- `deletedMembersService`
- `validationRulesService`
- `leadershipService`

### Key interpretation rule

Do not assume every service in `src/lib/supabase.ts` is equally hardened.

As of the Session 48 checkpoint:

- several major admin mutation domains are hardened and wrapper-first
- some remaining admin mutation domains still use older direct browser write patterns

This distinction is intentional and is the basis for the next planned stream.

## 9. Major Functional Domains

### Public directory

Key files:

- `src/pages/Directory.tsx`
- `src/components/ExpandedMemberDetails.tsx`
- `src/lib/supabase.ts`

What it does:

- loads approved active members from `member_registrations`
- supports search/filter by state, district, city
- switches between card and list views
- uses directory visibility settings to hide/show fields

### Join / registration flow

Key files:

- `src/pages/Join.tsx`
- `src/hooks/useFormFieldConfig.ts`
- `src/hooks/useValidation.ts`
- `src/lib/validation.ts`
- `src/lib/normalization.ts`
- `src/lib/imageProcessing.ts`
- `src/lib/supabase.ts`

What it does:

- authenticated-only join/application flow
- pre-fills email and mobile for authenticated user
- blocks duplicate / already-pending / approved / rejected states appropriately
- loads:
  - payment-enabled states
  - districts
  - cities
  - designations
- uses shared form configuration and validation rules
- supports custom city / pending-city workflow
- uploads files and profile photo
- uses normalization preview before final submission in some cases

### Member dashboard and profile management

Key files:

- `src/pages/MemberDashboard.tsx`
- `src/pages/MemberViewProfile.tsx`
- `src/pages/MemberEditProfile.tsx`
- `src/pages/MemberSettings.tsx`
- `src/pages/MemberReapply.tsx`
- `src/components/member/ChangeCredentialModal.tsx`
- `src/lib/memberAuth.ts`
- `src/lib/memberCredentialService.ts`

What it does:

- verifies current member session
- loads member registration by session token
- shows approval/pending/rejected status
- supports edit, reapply, credential change, and logout flows

### Admin registrations and member management

Key files:

- `src/pages/AdminRegistrations.tsx`
- `src/components/ViewApplicationModal.tsx`
- `src/components/EditMemberModal.tsx`
- `src/components/AuditHistoryModal.tsx`
- `src/lib/supabase.ts`

What it does:

- list and filter registrations
- approve / reject
- edit member details
- toggle active
- soft delete
- open audit history

This domain is part of the completed hardened Phase 1 scope and already has Playwright coverage.

### Locations and pending-city workflow

Key files:

- `src/pages/AdminStateManagement.tsx`
- `src/pages/AdminLocationManagement.tsx`
- `src/pages/AdminCityManagement.tsx`
- `src/pages/AdminPendingCities.tsx`
- `src/lib/supabase.ts`
- `supabase/migrations/20260310103000_pending_city_resolution_workflow.sql`

What it does:

- state management
- district management
- city management
- pending-city review and resolve

Important current truth:

- city management and pending-city workflow were part of the completed Phase 1 hardening/proof stream
- state management is still a known next-slice candidate outside the completed scope

### Organization and designation management

Key files:

- `src/pages/AdminProfileSettings.tsx`
- `src/pages/AdminDesignationsManagement.tsx`
- `src/lib/supabase.ts`

What it does:

- organization profile editing
- company designations
- LUB roles
- member-role assignments

Important current truth:

- member-role assign/update/delete/reorder are already hardened and runtime-proven
- organization profile update is still a remaining direct-write candidate outside the completed scope

### Settings and validation management

Key files:

- `src/pages/AdminFormsList.tsx`
- `src/pages/AdminFormFieldConfiguration.tsx`
- `src/pages/AdminValidationSettings.tsx`
- `src/hooks/useFormFieldConfig.ts`
- `src/hooks/useValidation.ts`
- `src/lib/validation.ts`
- `src/lib/supabase.ts`

What it does:

- manage admin-visible form sections
- configure field visibility / required state / validation rule mapping
- manage validation rules and categories

Important current truth:

- form field configuration and validation mutation flows are already covered by the green Phase 1 suite
- auth/member credential validation was also recently consolidated in safe shared helpers

## 10. Validation Architecture

This project has two different validation layers that Claude Code should not confuse.

### Layer A: shared validation stack

Files:

- `src/lib/validation.ts`
- `src/hooks/useValidation.ts`
- `src/hooks/useFormFieldConfig.ts`
- database tables/functions around:
  - `validation_rules`
  - `form_field_configurations`

Use cases:

- dynamic validation rule lookups
- field visibility and required-state control
- admin form configuration
- join/member/admin forms that already opt into this shared stack

### Layer B: canonical credential-format validation

Files:

- `src/lib/credentialValidation.ts`
- `src/lib/customAuth.ts`
- `src/lib/memberCredentialService.ts`
- `src/pages/SignIn.tsx`
- `src/pages/SignUp.tsx`
- `src/pages/MemberEditProfile.tsx`
- `src/components/member/ChangeCredentialModal.tsx`
- `src/components/admin/modals/EditUserModal.tsx`

Use cases:

- email normalization and validation
- mobile normalization and validation
- keep auth/member/admin credential flows consistent without a risky full migration to database-driven validation rules

Important current truth:

- validation-consumption cleanup is partially completed
- it was intentionally done in small slices
- a broader validation unification stream still exists as future work, but it is not the current highest-priority stream

## 11. Security And Hardening Direction

This project has a lot of security-relevant history. Claude Code should work with that history, not against it.

### Current approved direction

For privileged browser/admin writes:

- prefer `_with_session` RPC wrappers
- send `p_session_token`
- derive actor server-side
- enforce permissions server-side
- avoid browser-supplied actor IDs
- avoid direct writes to protected tables from the browser when the domain is being hardened

### Important migrations relevant to the recent stream

- `20260310103000_pending_city_resolution_workflow.sql`
  - pending-city durable linkage and exact-match behavior
- `20260312121000_add_session_token_wrappers_for_city_and_designations.sql`
  - city update and member-role wrappers
- `20260313093000_add_session_wrappers_for_designation_master_mutations.sql`
  - designation and LUB role master wrappers
- `20260313094500_add_session_wrappers_for_validation_and_form_display_order.sql`
  - validation/form display-order wrappers

### Current known remaining admin direct-write domains

From the latest checkpoint, the notable remaining admin/browser mutation domains outside completed Phase 1 scope are:

- admin user role management
- admin state management
- admin directory visibility management
- admin organization profile management

If Claude Code is asked to harden one of these, it should first inspect:

- `src/lib/supabase.ts`
- the corresponding admin page
- existing wrapper migrations
- Session 48 handover

## 12. Supabase And Database Notes

### General model

The app relies heavily on:

- direct Supabase table reads
- Supabase RPC functions for privileged and/or cross-RLS operations
- RLS policies
- SQL migrations as the source of truth for backend behavior

### Important consequence

The frontend cannot be understood correctly without checking the SQL migrations for:

- RPC definitions
- grants
- RLS policy assumptions
- helper functions like `has_permission(...)`
- custom session-token function family

### Storage

`fileUploadService` uses Supabase Storage bucket:

- `public-files`

This is used for:

- uploaded certificates
- QR code files
- organization logo
- other uploaded assets

### Database folder

- `supabase/migrations/` is large and historical
- do not assume older migrations are cleanly summarized anywhere else
- inspect actual SQL when changing a domain with backend implications

## 13. Testing And Quality Baseline

### Build

Primary build command:

- `npm run build`

### Lint

- `npm run lint`

### Playwright

Config:

- `playwright.config.ts`

Important behavior:

- one Chromium project
- HTML report in `playwright-report`
- JSON report in `test-results/phase1-production-smoke.json`
- trace/video/screenshots retained on failure or retry

### Current destructive smoke baseline

The truthful current baseline from the completed stream is:

- **15 passed**

Main spec file:

- `tests/e2e/phase1-production-smoke.spec.ts`

Helper files:

- `tests/e2e/helpers/auth.ts`
- `tests/e2e/helpers/fixtures.ts`

### Important smoke environment variables

- `PHASE1_SMOKE_BASE_URL`
- `PHASE1_SMOKE_ADMIN_EMAIL`
- `PHASE1_SMOKE_ADMIN_MOBILE`
- `RUN_DESTRUCTIVE`
- `PHASE1_SMOKE_FIXTURES_FILE`

### Important scripts from `package.json`

- `npm run dev`
- `npm run build`
- `npm run lint`
- `npm run test:e2e:phase1`
- `npm run test:e2e:phase1:local`
- `npm run test:e2e:phase1:local:destructive`

### Practical note for Claude Code

If asked to change a covered admin domain, always inspect the smoke suite first. A lot of recent stability work lives in the test harness, and careless changes can invalidate the proven `15 passed` baseline.

## 14. Key Product And Engineering Invariants

Claude Code should preserve these unless the user explicitly asks for a change and the consequences are understood.

### Product invariants

- only approved active members should appear in the public directory
- join flow should remain gated by authenticated user state and current registration status
- pending-city behavior should remain server-authoritative
- admin shell should remain tied to authenticated custom-session state and account type
- permissions should fail closed in UI

### Engineering invariants

- do not redesign auth without checking the custom session model end to end
- do not replace hardened `_with_session` paths with direct table writes
- do not reopen completed Phase 1 work without fresh failing evidence
- do not trust older one-off docs over current code and Session 48
- do not assume a migration is applied just because the SQL file exists

## 15. Current Known Next Workstream

The latest completed handover makes the next recommended stream explicit:

1. audit remaining privileged admin write paths outside the completed Phase 1 scope
2. rank them by risk and implementation size
3. choose one small, high-value admin domain for the next hardening slice

At the moment, the leading candidate previously identified was:

- admin state management

Important note:

- this is planning context, not a command to act
- repo truth should still win if a future agent finds new evidence

## 16. How Claude Code Should Approach This Repo

If Claude Code is being connected to this project for practical engineering help, this is the recommended starting workflow:

1. read this document
2. read `docs/session_documents/session_48_phase1_runtime_verification_completion_and_next_stream_handover.md`
3. inspect `git status`
4. inspect `src/App.tsx`
5. inspect `src/lib/supabase.ts`
6. inspect the relevant page/component/service for the requested domain
7. inspect matching SQL migrations in `supabase/migrations/`
8. only then propose or implement changes

### Best "source of truth" order

When facts conflict, use this order:

1. current code in repo
2. relevant SQL migration definitions
3. latest session handover
4. older root markdown docs

## 17. Files Claude Code Should Read First For Most Tasks

### Always high-value

- `src/App.tsx`
- `src/lib/supabase.ts`
- `src/lib/customAuth.ts`
- `src/lib/sessionManager.ts`
- `src/lib/permissionService.ts`
- `src/contexts/PermissionContext.tsx`
- `src/components/admin/AdminLayout.tsx`
- `docs/session_documents/session_48_phase1_runtime_verification_completion_and_next_stream_handover.md`

### If task involves forms or validation

- `src/lib/validation.ts`
- `src/hooks/useValidation.ts`
- `src/hooks/useFormFieldConfig.ts`
- `src/lib/credentialValidation.ts`
- `src/pages/Join.tsx`

### If task involves admin mutations

- `src/lib/supabase.ts`
- matching `src/pages/Admin*.tsx`
- matching SQL migrations under `supabase/migrations/`
- `tests/e2e/phase1-production-smoke.spec.ts`

### If task involves auth/session behavior

- `src/lib/customAuth.ts`
- `src/lib/memberAuth.ts`
- `src/lib/sessionManager.ts`
- `src/types/auth.types.ts`
- `tests/e2e/helpers/auth.ts`

## 18. Important Recent Lessons From The Repo History

These are worth knowing because they affect how careful Claude Code should be.

- the app recently went through extensive smoke-harness stabilization
- pending-city workflow was substantially upgraded and proven
- admin route detection and session handling had real edge cases
- validation cleanup is partial and deliberate, not complete
- several remaining admin domains still have older direct-write patterns
- this repo has a lot of historical fix docs, so it is easy to mistake past intent for current reality

## 19. Short Bottom-Line Summary

LUB Web Portal is a public/member/admin portal built on React + Vite + Supabase with a custom session-token auth model, a large SQL migration history, and a recent Phase 1 hardening stream that is now runtime-proven and green at `15 passed`.

The most important technical facts for Claude Code are:

- `src/lib/supabase.ts` is the central service layer
- SQL migrations are essential to understanding backend truth
- `_with_session` RPC hardening is the approved direction for privileged writes
- pending-city and multiple admin flows were recently hardened and should not be casually reopened
- Session 48 is the current continuity checkpoint

If Claude Code starts from those assumptions and verifies code before acting, it should be able to work effectively on this repo.
