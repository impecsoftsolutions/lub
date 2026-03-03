# Session 46 — passwordless auth hardening + dashboard landing

**Date/time (Asia/Kolkata):** 2026-03-03 16:51:03 +05:30

## Session objective(s)

- Harden the new passwordless authentication flow so it is safe under custom `auth_sessions` + RLS.
- Remove trust in caller-supplied user IDs for sensitive auth-related mutations.
- Make signup create an immediate custom session so the user can continue authenticated.
- Consolidate login gating so deactivated members are blocked deterministically without a fail-open pre-login RPC.
- Remove active split-brain reliance on `supabase.auth` in the primary auth/session flows.
- Change post-auth landing so both successful login and successful signup land on `/dashboard`.
- Produce a handoff artifact that allows the next engineer/session to continue without re-reading the full repo.

## Initial state / assumptions confirmed by inspection

- The repo uses a passwordless portal auth model based on `email + 10-digit mobile number`.
- The browser session model is custom and uses the `auth_sessions` table, not Supabase Auth sessions, for the primary portal auth path.
- Frontend session persistence is handled by `sessionManager`.
- `DEFAULT_SESSION_CONFIG.storageKey` in `src/types/auth.types.ts` is `lub_session_token`, so the active localStorage keys are:
  - `lub_session_token`
  - `lub_session_token_expiry`
  - `lub_session_token_user`
- The main route targets relevant to auth are:
  - `/signin`
  - `/signup`
  - `/dashboard`
  - `/join`
  - `/admin`
- `/dashboard` exists in `src/App.tsx` and points to `MemberDashboard`.
- At the start of this document-generation task, `docs/` existed but `docs/session_documents/` did not.
- Session 46 work in the working tree consists of:
  - 12 modified tracked files
  - 3 new untracked migration files
- The active passwordless-auth DB baseline in the repo includes:
  1. `20260303120000_switch_to_email_mobile_auth.sql`
  2. `20260303123000_fix_lookup_user_for_login_ambiguity.sql`
  3. `20260303130000_secure_custom_auth_mutation_rpcs.sql`
  4. `20260303131000_create_portal_user_with_session_rpc.sql`
  5. `20260303132000_consolidate_login_lookup_and_member_gate.sql`
- Assumption locked for this document:
  - “Session 46” refers to the current working-tree state observed via `git status --short`, including the uncommitted migration files above.

## Plan agreed (final)

### Auth model

- Keep the user-visible credential model as:
  - email
  - 10-digit mobile number
- Keep the custom session model as:
  - session token in `auth_sessions`
  - localStorage persistence through `sessionManager`
- Do not reintroduce passwords, OTPs, PINs, magic links, or other factors.

### Security and data-flow decisions

- All sensitive user credential mutations must derive the acting user from a validated custom session token on the server side.
- Browser callers must no longer be trusted to prove identity by sending:
  - `p_user_id`
  - `p_requesting_user_id`
- `set_session_user()` must no longer be a browser-usable authorization primitive.
- Login gating for deactivated members must be part of the single login lookup RPC, not a second pre-login RPC that can fail open.

### Post-auth landing decision

- After successful login, always land on `/dashboard`.
- After successful signup, always land on `/dashboard`.
- Keep the hard redirect pattern (`window.location.href`) after session save so the app fully remounts and `MemberContext` restores auth before protected route checks run.
- `Join` remains reachable manually but is no longer the automatic destination after signup.

### Public API / interface changes

- `change_user_email(uuid, text)` -> `change_user_email(text, text)`
  - arg 1 is now `p_session_token`
- `change_user_mobile(uuid, text)` -> `change_user_mobile(text, text)`
  - arg 1 is now `p_session_token`
- `admin_update_user_details(uuid, uuid, text, text, text)` -> `admin_update_user_details(text, uuid, text, text, text)`
  - arg 1 is now `p_session_token`
- New DB RPC:
  - `create_portal_user_with_session(text, text, text, text) -> jsonb`
- `lookup_user_for_login(text)` keeps the same name, but its return shape is expanded to include:
  - `member_can_login`
  - `member_login_reason`
- Frontend behavior change:
  - both login and signup now land on `/dashboard`

## Work completed

- Added a token-resolution helper RPC to map a browser-provided custom session token to the acting `user_id`.
- Revoked public execute access on `set_session_user(uuid)`.
- Replaced vulnerable credential mutation RPCs so they authorize via validated session token instead of caller-supplied UUIDs.
- Replaced the admin user update RPC so admin authorization is based on the session-derived actor, not a forged requestor UUID.
- Added a signup RPC that creates a `general_user` record and immediate custom session in one server-side transaction path.
- Recreated `lookup_user_for_login(text)` with:
  - the prior ambiguity fix preserved
  - embedded deactivated-member gating
  - `member_can_login` / `member_login_reason`
- Updated frontend signup to call the new signup-with-session RPC and persist the returned session.
- Updated frontend login to rely on the consolidated lookup RPC result for member gating.
- Updated session restore to validate the stored token before treating cached user data as authenticated.
- Updated logout to delete the server-side session first, then clear local client state.
- Updated member credential mutation calls to send `p_session_token` instead of `p_user_id`.
- Updated admin user edit calls to send `p_session_token` instead of `p_requesting_user_id`.
- Removed active `authService` / `supabase.auth` usage from several runtime paths tied to auth and user identity.
- Changed post-auth landing for both login and signup to `/dashboard`.
- Created this session handoff document and created `docs/session_documents/` for document storage.

## Files changed

| File path | What changed | Why |
| --- | --- | --- |
| `src/lib/customAuth.ts` | Added inline member login gating using `member_can_login` / `member_login_reason`; removed separate `get_member_login_status` pre-login call; deprecated `setUserContext()` into a no-op; sign-in now lands on dashboard via page-layer redirect changes. Diff: `+10 / -31`. | Eliminate fail-open member gating and stop relying on browser-set DB session context. |
| `src/lib/memberAuth.ts` | Switched signup to `create_portal_user_with_session`; returns session payload on signup; validates token during session restore; clears invalid sessions; deletes server session before local clear during logout; replaced `supabase.auth.getUser()` in `updateMemberProfile()`. Diff: `+61 / -64`. | Make signup authenticated immediately, harden restore/logout, and remove active dependence on Supabase Auth in core member flow. |
| `src/lib/logoutService.ts` | Removed duplicated manual token deletion and `supabase.auth.signOut()` cleanup; now delegates to `memberAuthService.signOutMember()` before clearing browser storage and redirecting. Diff: `+0 / -31`. | Fix logout sequencing so server-side `auth_sessions` is invalidated before local state is cleared. |
| `src/lib/memberCredentialService.ts` | Replaced RPC payloads from `p_user_id` to `p_session_token` for `change_user_email` and `change_user_mobile`; added session-token presence check. Diff: `+10 / -8`. | Prevent caller-supplied UUID takeover for self-service credential changes. |
| `src/lib/normalization.ts` | Removed `supabase.auth.getSession()` and bearer header injection for the `normalize-member` edge function call. Diff: `+1 / -7`. | Remove active dependency on Supabase Auth for a path still reachable from authenticated UI flows. |
| `src/pages/SignIn.tsx` | Removed the `setUserContext()` call; changed post-login redirect so all users now hard-redirect to `/dashboard`. Diff: `+1 / -15`. | Stop relying on browser-set DB session context and standardize dashboard landing for every user type. |
| `src/pages/SignUp.tsx` | Saves the session returned by signup RPC; validates `result.user`, `result.sessionToken`, and `result.expiresAt`; changed success copy to dashboard; changed post-signup hard redirect from `/join` to `/dashboard`. Diff: `+10 / -2`. | Ensure new users are authenticated immediately and land on the dashboard instead of being auto-sent to Join. |
| `src/components/admin/modals/EditUserModal.tsx` | Replaced requestor UUID lookup with session token lookup; now sends `p_session_token` and no longer sends `p_requesting_user_id`. Diff: `+4 / -5`. | Prevent forged-admin identity in the browser request payload. |
| `src/pages/MemberProfile.tsx` | Replaced `authService` with `customAuth.getCurrentUserFromSession()`; removed admin detection by email substring and now derives admin access from `account_type`. Diff: `+7 / -7`. | Remove active split-brain auth usage and use the custom session user as the identity source. |
| `src/components/ViewApplicationModal.tsx` | Replaced `authService.getCurrentUser()` with `sessionManager.getUserData()` for “mark viewed” attribution. Diff: `+4 / -4`. | Remove active dependency on `authService` / Supabase Auth in a live component path. |
| `src/pages/AdminCityManagement.tsx` | Replaced `supabase.auth.getUser()` with the existing local `getRequestingUserId()` path. Diff: `+4 / -4`. | Reduce split-brain auth reliance in an active admin page. |
| `src/pages/AdminFormFieldConfiguration.tsx` | Replaced `supabase.auth.getUser()` with `sessionManager.getUserData()` to populate `currentUserId`. Diff: `+3 / -8`. | Reduce split-brain auth reliance in an active admin configuration page. |
| `supabase/migrations/20260303130000_secure_custom_auth_mutation_rpcs.sql` | New file (`237` lines). Adds `resolve_custom_session_user_id`; revokes public access to `set_session_user`; drops old vulnerable mutation signatures; recreates token-based `change_user_email`, `change_user_mobile`, and `admin_update_user_details`. | Close the critical server-side identity trust bug in auth-related `SECURITY DEFINER` RPCs. |
| `supabase/migrations/20260303131000_create_portal_user_with_session_rpc.sql` | New file (`108` lines). Adds `create_portal_user_with_session` to create a `general_user` and immediate custom session in one RPC. | Fix signup so a new user is authenticated immediately without a second login step. |
| `supabase/migrations/20260303132000_consolidate_login_lookup_and_member_gate.sql` | New file (`110` lines). Drops and recreates `lookup_user_for_login`; preserves the ambiguity fix; adds `member_can_login` and `member_login_reason`. | Make pre-login member gating deterministic and eliminate the separate fail-open `get_member_login_status` step. |
| `supabase/migrations/20260303123000_fix_lookup_user_for_login_ambiguity.sql` | Existing baseline migration (`102` lines), not newly authored in Session 46; earlier hotfix that qualified `u.email`, `u.account_status`, and `u.locked_until` in the `UPDATE` predicate. | Part of the active passwordless-auth DB baseline that Session 46 builds on. |

## Database changes (if any)

### Migrations added in Session 46

1. `20260303130000_secure_custom_auth_mutation_rpcs.sql`
2. `20260303131000_create_portal_user_with_session_rpc.sql`
3. `20260303132000_consolidate_login_lookup_and_member_gate.sql`

### Active baseline required before those

1. `20260303120000_switch_to_email_mobile_auth.sql`
2. `20260303123000_fix_lookup_user_for_login_ambiguity.sql`

### Schema deltas

- No new tables were created in Session 46.
- No table column definitions were changed in the three Session 46 migrations.
- The change set is function-surface focused rather than table-schema focused.

### Function / RPC deltas

- New private helper:
  - `resolve_custom_session_user_id(text) -> uuid`
- New signup RPC:
  - `create_portal_user_with_session(text, text, text, text) -> jsonb`
- Replaced public function signatures:
  - `change_user_email(uuid, text)` -> `change_user_email(text, text)`
  - `change_user_mobile(uuid, text)` -> `change_user_mobile(text, text)`
  - `admin_update_user_details(uuid, uuid, text, text, text)` -> `admin_update_user_details(text, uuid, text, text, text)`
- Recreated:
  - `lookup_user_for_login(text)` with expanded return shape:
    - added `member_can_login`
    - added `member_login_reason`

### Grants / security deltas

- Revoked:
  - `REVOKE EXECUTE ON FUNCTION public.resolve_custom_session_user_id(text) FROM PUBLIC`
  - `REVOKE EXECUTE ON FUNCTION public.set_session_user(uuid) FROM PUBLIC`
- Granted to `PUBLIC`:
  - `change_user_email(text, text)`
  - `change_user_mobile(text, text)`
  - `admin_update_user_details(text, uuid, text, text, text)`
  - `create_portal_user_with_session(text, text, text, text)`
  - `lookup_user_for_login(text)`

### Migrations added / ran

- Added in the working tree:
  - `20260303130000_secure_custom_auth_mutation_rpcs.sql`
  - `20260303131000_create_portal_user_with_session_rpc.sql`
  - `20260303132000_consolidate_login_lookup_and_member_gate.sql`
- **Not run from this environment:** no live DB migration execution was performed in Session 46 from this workspace.

### Rollback notes

- Do **not** edit or rewrite historical migrations.
- Any rollback should be append-only and implemented as new corrective migrations.
- Rolling back to the old UUID-trusting mutation signatures would intentionally reintroduce insecure behavior and should be treated as high risk.
- Operational rollback should prefer:
  - reverting frontend code if necessary
  - then adding a new corrective SQL migration
  - not destructive migration history edits

## Commands run (exact)

```powershell
Get-ChildItem docs -Force -ErrorAction SilentlyContinue
Get-ChildItem docs/session_documents -Force -ErrorAction SilentlyContinue
git status --short
git diff --stat
rg -n "lookup_user_for_login" supabase/migrations
git diff --unified=0 -- src/lib/customAuth.ts src/lib/memberAuth.ts src/lib/logoutService.ts src/lib/memberCredentialService.ts src/lib/normalization.ts
git diff --unified=0 -- src/pages/SignIn.tsx src/pages/SignUp.tsx src/components/admin/modals/EditUserModal.tsx src/pages/MemberProfile.tsx src/components/ViewApplicationModal.tsx src/pages/AdminCityManagement.tsx src/pages/AdminFormFieldConfiguration.tsx
Get-Content supabase/migrations/20260303130000_secure_custom_auth_mutation_rpcs.sql
Get-Content supabase/migrations/20260303131000_create_portal_user_with_session_rpc.sql
Get-Content supabase/migrations/20260303132000_consolidate_login_lookup_and_member_gate.sql
git diff --numstat
rg -n "lub_session_token|lub_session_token_expiry|lub_session_token_user|saveSession\\(|getSessionToken\\(|isSessionExpired\\(" src/lib/sessionManager.ts
Get-Content src/lib/sessionManager.ts | Select-Object -First 220
Get-Date -Format "yyyy-MM-dd HH:mm:ss zzz"
npm run build
New-Item -ItemType Directory -Force docs/session_documents | Out-Null
```

Additional targeted `Get-Content` / `rg` inspections were also used during Session 46 planning/implementation to confirm:

- route map and dashboard target in `src/App.tsx`
- current sign-in / sign-up redirect logic
- `MemberContext` initialization path
- `Join` auth redirect behavior
- active `authService` importers and remaining `supabase.auth.*` usages

## Verification performed + results

### Verified in-session

- `npm run build` passed successfully after the Session 46 frontend changes.
- The working tree contains the Session 46 auth changes and 3 new migrations.
- `/dashboard` exists in `src/App.tsx` and points to `MemberDashboard`.
- `src/pages/SignIn.tsx` now redirects to `/dashboard` after successful login.
- `src/pages/SignUp.tsx` now saves the returned session and redirects to `/dashboard` after successful signup.
- At the start of this document-generation task, `docs/session_documents/` did not exist.
- The three new Session 46 migrations are present in the working tree.
- `lookup_user_for_login` is defined in:
  - `20260303120000_switch_to_email_mobile_auth.sql`
  - `20260303123000_fix_lookup_user_for_login_ambiguity.sql`
  - `20260303132000_consolidate_login_lookup_and_member_gate.sql`
- The document directory has now been created and this handoff file has been written.

### Not verified in-session

- No DB migration was applied from this environment.
- No live Supabase function signatures or grants were verified against a real database.
- No manual browser test was executed in Session 46 for:
  - login
  - signup
  - dashboard landing
  - logout
  - session refresh
  - self credential mutation
  - admin credential mutation
- No Railway deployment was performed.
- No live staging/production auth flow was exercised.

## Deployment notes (Railway)

- No Railway deployment was performed in Session 46 from this environment.
- No live Railway/Supabase migration execution was confirmed.
- Before deploying, apply migrations in this exact order:
  1. `20260303120000_switch_to_email_mobile_auth.sql`
  2. `20260303123000_fix_lookup_user_for_login_ambiguity.sql`
  3. `20260303130000_secure_custom_auth_mutation_rpcs.sql`
  4. `20260303131000_create_portal_user_with_session_rpc.sql`
  5. `20260303132000_consolidate_login_lookup_and_member_gate.sql`
- After the DB migration sequence succeeds, deploy the frontend bundle containing the matching TypeScript changes from Session 46.
- Do not deploy frontend-only without the new SQL function signatures, because the frontend now expects:
  - token-based credential mutation RPC payloads
  - the signup-with-session RPC
  - the expanded `lookup_user_for_login` response shape

## Known issues / risks

1. `docs/session_documents/` did not exist before this task and had to be created; future session docs should use the same folder.
2. The three Session 46 migration files are currently present in the working tree but, from this environment, were **not** applied to a live Supabase DB.
3. Until the new migrations are applied to the target DB, the frontend and DB contracts are mismatched.
4. `src/lib/memberAuth.ts` still contains an inactive dead branch:
   - `if (false && cachedUser && !bypassCache)`
   - It is not active at runtime but remains cleanup debt.
5. `src/lib/auth.ts` still exists with legacy `supabase.auth.*` helpers, even though active importers were removed from the main runtime paths reviewed in Session 46.
6. `src/lib/supabase.ts` still contains some `supabase.auth.*` usages in non-primary auth/admin utility paths; those were not part of Session 46.
7. Admin users now land on `/dashboard` after login instead of `/admin`. This is intentional under the current redirect decision, but it changes prior operator expectations.
8. Live DB grant/function validation and manual auth-flow QA are still outstanding.

## Next session: step-by-step continuation plan

1. Apply the pending SQL migrations to a staging Supabase/Railway environment in the required order.
2. Verify the live function signatures and grants for:
   - `lookup_user_for_login`
   - `create_portal_user_with_session`
   - `change_user_email`
   - `change_user_mobile`
   - `admin_update_user_details`
   - `set_session_user`
3. Run manual end-to-end tests:
   - login existing user -> dashboard
   - signup new user -> dashboard
   - refresh dashboard -> still authenticated
   - logout -> session row invalidated + redirect to signin
   - self email/mobile change -> only current user is updated
   - admin user edit -> only true admins succeed
4. Confirm manual access to `/join` still works after authentication.
5. Clean remaining legacy auth debt:
   - remove the inactive branch in `memberAuth.ts`
   - decide whether to delete or formally deprecate `src/lib/auth.ts`
   - audit remaining `supabase.auth.*` calls in `src/lib/supabase.ts`
6. After staging validation, deploy DB + frontend together to production.

### Exact next Codex prompt text to use next

```text
IMPLEMENTATION MODE

Use the Session 46 transition document as the source of truth. First inspect the live Supabase/Railway environment (no assumptions) and verify that migrations 20260303120000, 20260303123000, 20260303130000, 20260303131000, and 20260303132000 are applied in order and that the exposed function signatures/grants match the frontend. Then run a static + live validation pass for the passwordless auth flow (login, signup, dashboard landing, session restore, logout, self credential change, admin user edit). Output findings first, ordered by severity, with exact file/function references and exact SQL/function mismatches if any.
```

## Test cases and scenarios

- Login existing normal user -> `/dashboard`
- Login existing admin/both user -> `/dashboard`
- Signup new user -> session saved -> `/dashboard`
- Refresh `/dashboard` after login -> remains authenticated
- Refresh `/dashboard` after signup -> remains authenticated
- Logout from dashboard -> back to `/signin`
- Manual navigation to `/join` after login/signup -> page remains accessible
- Self email change works using token-based RPC
- Self mobile change works using token-based RPC
- Admin edit works only with a valid admin session token
- Confirm the app no longer relies on `set_session_user()` during sign-in

## Assumptions and defaults

- Session 46 refers to the current working-tree state shown by `git status --short`.
- The three new migration files are part of Session 46 even though they are not yet committed.
- `20260303123000_fix_lookup_user_for_login_ambiguity.sql` is part of the effective DB baseline, not newly authored in Session 46.
- The session timestamp is fixed to the inspected Asia/Kolkata time:
  - `2026-03-03 16:51:03 +05:30`
- The document reflects repo inspection and local build verification only; it does not claim live DB or live environment validation.
