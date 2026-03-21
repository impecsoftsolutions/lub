# LUB Web Portal - Current State

**Last updated:** 2026-03-21
**Updated by:** Codex (signup state persistence and Join prefill stream)

---

## Project

- **Repo:** `C:\webprojects\lub`
- **Latest deep handover:** `docs/session_documents/session_50_signup_state_join_prefill_and_join_flow_handover.md`
- **Project guide:** `docs/lub_web_portal_project_guide_for_claude_code.md`

---

## Current Baseline

| Check | Status |
|-------|--------|
| Build (`npm run build`) | PASS (2026-03-21) |
| Lint (`npm run lint`) | PASS - 0 errors, 0 warnings (2026-03-21) |
| Phase 1 destructive smoke | **15 passed** (verified 2026-03-13) |

Phase 1 baseline is the non-negotiable floor. Do not merge or ship changes that break it.

---

## Active Stream

**Active stream:** None - signup state persistence and Join prefill stream complete.

Most recent completed stream before this one: **Single-field correction stepper added to Join and Member Edit Profile.**

Assign exactly one domain to one agent per session. Update this section when a stream starts.

---

## Last Verified

- **When:** 2026-03-21
- **What:** Signup state persistence and Join state auto-prefill
- **Result:** Build and lint pass. DB migration applied successfully. Signup now stores state in the user account, and Join auto-fills state from the authenticated account. Manual smoke confirmed the flow works.
- **Command(s):**
  ```
  npm run lint
  npm run build
  ```

---

## In Progress / Dirty State

No active implementation stream. Working tree should be clean after the current checkpoint commit.

Expected state after this checkpoint:
- working tree clean
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
- Lint cleanup reduced the baseline from `206 errors, 42 warnings` to `0 errors, 0 warnings`.
- Join and Member Edit Profile now use a single-field correction stepper instead of the old multi-field review modal. The user confirms one corrected field at a time and must still click the form submit button afterward.
- Signup now captures `State`, persists it in `public.users`, and Join auto-fills the same state from the authenticated account.
- Join layout updated so `Payment Information` sits below `Personal Information`, `Payment Proof` is inside `Payment Information`, and Join action buttons are right-aligned with the Verify/Submit flow.

| # | Item | Notes |
|---|------|-------|
| 1 | Validation-consumption cleanup | Two separate validation layers exist - cleanup deferred until after hardening work and lint cleanup are complete. See project guide section 10. |
| 2 | Review non-blocking build warnings | Build still emits chunk-size and `sessionManager` import-graph warnings. These are optimization concerns, not correctness blockers. |

---

## Known Risks / Watch Items

Things to be aware of when touching certain areas - not work items, just caution flags.

- **Migration `20260313093000`** (designation master wrappers) - DB application was not explicitly confirmed during Session 48. Verify before hardening that domain further.
- **`information_schema.routines`** - not queryable via the anon client in this workspace. Function existence must be proven via live RPC smoke, not metadata query.
- **Build warnings are still present** - Vite still reports large chunk size and mixed dynamic/static import usage for `src/lib/sessionManager.ts`. These do not currently block build or lint.
- **Join payment-proof upload path** - live Join smoke surfaced `StorageApiError: Bucket not found` for the payment-proof upload, but the registration RPC still completed successfully. This is unrelated to the correction-stepper flow and should be audited separately.

---

## Next Recommended Action

When ready to resume work, pick the top item from **Deferred Work** above.
Current top item: **Validation-consumption cleanup** (Deferred Work item 1).

---

## References

- Project guide: `docs/lub_web_portal_project_guide_for_claude_code.md`
- Latest deep handover: `docs/session_documents/session_50_signup_state_join_prefill_and_join_flow_handover.md`
- Startup rules: `CLAUDE.md` (Claude Code) / `AGENTS.md` (Codex)
