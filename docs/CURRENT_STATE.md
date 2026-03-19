# LUB Web Portal - Current State

**Last updated:** 2026-03-19
**Updated by:** Codex (admin state management hardening)

---

## Project

- **Repo:** `C:\webprojects\lub`
- **Latest deep handover:** `docs/session_documents/session_48_phase1_runtime_verification_completion_and_next_stream_handover.md`
- **Project guide:** `docs/lub_web_portal_project_guide_for_claude_code.md`

---

## Current Baseline

| Check | Status |
|-------|--------|
| Build (`npm run build`) | PASS (2026-03-19) |
| Lint (`npm run lint`) | FAIL - 206 errors, 42 warnings (2026-03-19, pre-existing debt, not introduced by Phase 1) |
| Phase 1 destructive smoke | **15 passed** (verified 2026-03-13) |

Phase 1 baseline is the non-negotiable floor. Do not merge or ship changes that break it.

---

## Active Stream

**No active stream.** Admin state management hardening is complete.

Next recommended stream: **Audit remaining privileged admin write paths outside Phase 1 scope.**

Leading candidates (in rough priority order):
1. Admin user role management - `addUserRole`, `updateUserRole`, `removeUserRole`
2. Admin directory visibility - `updateFieldVisibility`, `updateMultipleFieldVisibilities`
3. Admin organization profile management

Assign exactly one domain to one agent per session. Update this section when a stream starts.

---

## Last Verified

- **When:** 2026-03-19
- **What:** Admin state management hardening verification
- **Result:** Migration applied manually by Yogish, runtime add/toggle smoke passed, post-change build passed
- **Command(s):**
  ```
  npm run build
  ```

---

## In Progress / Dirty State

Phase 1 work and the shared-environment files are committed as the current baseline.

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
- Broader validation-consumption cleanup is deferred - do not start it until after the next privileged-write hardening slice is complete.

---

## Next Recommended Action

1. Start next stream: **admin user role management hardening**
   - Inspect `src/lib/supabase.ts` user-role mutation paths
   - Inspect `src/pages/AdminUserManagement.tsx`
   - Replace weaker browser-side privileged writes with server-authoritative wrappers
   - Pay special attention to the current browser-side user creation path
2. Keep lint cleanup deferred unless the chosen slice directly requires a narrowly scoped lint fix

---

## References

- Project guide: `docs/lub_web_portal_project_guide_for_claude_code.md`
- Latest deep handover: `docs/session_documents/session_48_phase1_runtime_verification_completion_and_next_stream_handover.md`
- Startup rules: `CLAUDE.md` (Claude Code) / `AGENTS.md` (Codex)
