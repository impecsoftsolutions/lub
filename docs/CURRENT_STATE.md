# LUB Web Portal - Current State

**Last updated:** 2026-03-20
**Updated by:** Codex (three-domain hardening stream)

---

## Project

- **Repo:** `C:\webprojects\lub`
- **Latest deep handover:** `docs/session_documents/session_48_phase1_runtime_verification_completion_and_next_stream_handover.md`
- **Project guide:** `docs/lub_web_portal_project_guide_for_claude_code.md`

---

## Current Baseline

| Check | Status |
|-------|--------|
| Build (`npm run build`) | PASS (2026-03-20) |
| Lint (`npm run lint`) | FAIL - 206 errors, 42 warnings (2026-03-19, pre-existing debt, not introduced by Phase 1) |
| Phase 1 destructive smoke | **15 passed** (verified 2026-03-13) |

Phase 1 baseline is the non-negotiable floor. Do not merge or ship changes that break it.

---

## Active Stream

**No active stream.** Directory visibility, organization profile, and user role write-wrapper hardening are complete.

Next recommended stream: **Investigate and fix the user creation path through a proper server-side route.**

Assign exactly one domain to one agent per session. Update this section when a stream starts.

---

## Last Verified

- **When:** 2026-03-20
- **What:** Directory visibility, organization profile, and user role wrapper verification
- **Result:** Domain 1 and 2 fully smoke-passed. Domain 3 wrappers were live-proven for add/update/remove, but the pre-existing browser-side `supabase.auth.admin.createUser()` step in `userRolesService.addUserRole()` still fails with `403 not_admin`.
- **Command(s):**
  ```
  npm run build
  ```

---

## In Progress / Dirty State

Three-domain hardening changes are committed as the current baseline.

Expected state after this checkpoint:
- working tree clean before the next stream starts
- Phase 1 baseline preserved at 15 passed
- `AGENTS.md`, `CLAUDE.md`, and `docs/CURRENT_STATE.md` available as the shared startup/checkpoint files

If `git status` is dirty when the next stream begins:
- inspect and explain the delta first
- do not assume it belongs to the completed Phase 1 baseline

---

## Open Risks / Open Questions

- Migration `20260313093000` (designation master wrappers): application to DB was not explicitly confirmed during Session 48. Verify before hardening that domain further.
- Lint baseline is failing (206 errors, 42 warnings as of 2026-03-19). Mostly pre-existing no-explicit-any and unused-var debt. One item to watch: constant condition in `src/lib/memberAuth.ts` line 148 - inspect before touching that file.
- Direct `information_schema.routines` verification is not available from the anon client used in this workspace. For state-management hardening, function existence was proven indirectly through successful live RPC calls to `upsert_state_with_session` and `update_state_active_status_with_session`.
- `supabase.auth.admin.createUser()` in `userRolesService.addUserRole()` is a browser-side admin Auth API call returning `403 not_admin`. This is a pre-existing issue outside Domain 3 scope. Needs a server-side Edge Function or service-role backend route to fix. Do not attempt to fix by exposing the service role key in the browser.
- Broader validation-consumption cleanup is deferred - do not start it until after the next privileged-write hardening slice is complete.

---

## Next Recommended Action

1. Start next stream: **fix the admin user creation path through a proper server-side route**
   - investigate a Supabase Edge Function or equivalent server-side backend route
   - move the `supabase.auth.admin.createUser()` step out of the browser
   - preserve the new `_with_session` wrapper path for `user_roles` insert/update/delete
2. Keep lint cleanup deferred unless the chosen slice directly requires a narrowly scoped lint fix

---

## References

- Project guide: `docs/lub_web_portal_project_guide_for_claude_code.md`
- Latest deep handover: `docs/session_documents/session_48_phase1_runtime_verification_completion_and_next_stream_handover.md`
- Startup rules: `CLAUDE.md` (Claude Code) / `AGENTS.md` (Codex)
