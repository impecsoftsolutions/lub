# LUB Web Portal - Current State

**Last updated:** 2026-03-20
**Updated by:** Claude Code (restructured open risks into deferred work + watch items)

---

## Project

- **Repo:** `C:\webprojects\lub`
- **Latest deep handover:** `docs/session_documents/session_49_dual_agent_setup_and_browser_side_hardening_completion.md`
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

**No active stream.** Browser-side hardening is fully complete.

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

## Deferred Work

Planned items not yet started, in priority order. Remove an item from this list when it is done.

| # | Item | Notes |
|---|------|-------|
| 1 | Fix admin user creation via server-side Edge Function | `supabase.auth.admin.createUser()` returns `403 not_admin` from the browser. Move this call to a Supabase Edge Function. Do NOT fix by exposing the service role key in the browser. |
| 2 | Lint cleanup | 206 errors, 42 warnings as of 2026-03-19. All pre-existing debt. Safe to defer but should be done before the codebase grows further. |
| 3 | Validation-consumption cleanup | Two separate validation layers exist - cleanup deferred until after hardening work is complete. See project guide section 10. |

---

## Known Risks / Watch Items

Things to be aware of when touching certain areas - not work items, just caution flags.

- **`src/lib/memberAuth.ts` line 148** - constant condition `if (false && ...)` is dead code / disabled cache path. Low production risk but inspect before editing this file.
- **Migration `20260313093000`** (designation master wrappers) - DB application was not explicitly confirmed during Session 48. Verify before hardening that domain further.
- **`information_schema.routines`** - not queryable via the anon client in this workspace. Function existence must be proven via live RPC smoke, not metadata query.

---

## Next Recommended Action

When ready to resume work, pick the top item from **Deferred Work** above.
Current top item: **Fix admin user creation via server-side Edge Function** (Deferred Work item 1).

---

## References

- Project guide: `docs/lub_web_portal_project_guide_for_claude_code.md`
- Latest deep handover: `docs/session_documents/session_49_dual_agent_setup_and_browser_side_hardening_completion.md`
- Startup rules: `CLAUDE.md` (Claude Code) / `AGENTS.md` (Codex)
