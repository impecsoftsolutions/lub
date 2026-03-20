# LUB Web Portal - Current State

**Last updated:** 2026-03-20
**Updated by:** Codex (warning-reduction checkpoint)

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
| Lint (`npm run lint`) | PASS with warnings only - 0 errors, 3 warnings (2026-03-20) |
| Phase 1 destructive smoke | **15 passed** (verified 2026-03-13) |

Phase 1 baseline is the non-negotiable floor. Do not merge or ship changes that break it.

---

## Active Stream

**Active stream:** None - warning-reduction checkpoint complete.

Most recent completed stream before this one: **Role assignment UI added to the routed Admin Users page using the existing hardened role wrappers.**

Assign exactly one domain to one agent per session. Update this section when a stream starts.

---

## Last Verified

- **When:** 2026-03-20
- **What:** Warning-only lint cleanup checkpoint
- **Result:** Lint reduced further from `0 errors, 35 warnings` to `0 errors, 3 warnings`. Build remains passing after the cleanup.
- **Command(s):**
  ```
  npm run lint
  npm run build
  ```

---

## In Progress / Dirty State

No active implementation stream. The repo includes an uncommitted warning-reduction batch after commit `e710e58` until this checkpoint is committed.

Expected state after this checkpoint:
- working tree dirty until this warning-reduction checkpoint is committed
- Phase 1 baseline preserved at 15 passed
- `AGENTS.md`, `CLAUDE.md`, and `docs/CURRENT_STATE.md` available as the shared startup/checkpoint files

If `git status` is dirty when the next stream begins:
- inspect and explain the delta first
- do not assume it belongs to the completed Phase 1 baseline

---

## Deferred Work

Planned items not yet started, in priority order. Remove an item from this list when it is done.

Done this session:
- Role assignment UI added to `src/pages/admin/AdminUsers.tsx` with `AssignRoleModal` and the existing hardened role wrappers. Admin user creation is now handled through Sign Up plus role assignment.
- Lint cleanup reduced the baseline from `206 errors, 42 warnings` to `0 errors, 3 warnings`. The remaining warnings are structural `react-refresh/only-export-components` warnings in the context providers.

| # | Item | Notes |
|---|------|-------|
| 1 | Decide whether to clear the final 3 fast-refresh warnings | Remaining warnings are only `react-refresh/only-export-components` in `src/contexts/AdminContext.tsx`, `src/contexts/MemberContext.tsx`, and `src/contexts/PermissionContext.tsx`. This likely requires small structural file moves, not behavior changes. |
| 2 | Validation-consumption cleanup | Two separate validation layers exist - cleanup deferred until after hardening work is complete. See project guide section 10. |

---

## Known Risks / Watch Items

Things to be aware of when touching certain areas - not work items, just caution flags.

- **Migration `20260313093000`** (designation master wrappers) - DB application was not explicitly confirmed during Session 48. Verify before hardening that domain further.
- **`information_schema.routines`** - not queryable via the anon client in this workspace. Function existence must be proven via live RPC smoke, not metadata query.
- **Remaining lint warnings** - only 3 structural fast-refresh warnings remain, all in context providers. They do not currently block build or lint pass status.

---

## Next Recommended Action

When ready to resume work, pick the top item from **Deferred Work** above.
Current top item: **Decide whether to clear the final 3 fast-refresh warnings** (Deferred Work item 1).

---

## References

- Project guide: `docs/lub_web_portal_project_guide_for_claude_code.md`
- Latest deep handover: `docs/session_documents/session_49_dual_agent_setup_and_browser_side_hardening_completion.md`
- Startup rules: `CLAUDE.md` (Claude Code) / `AGENTS.md` (Codex)
