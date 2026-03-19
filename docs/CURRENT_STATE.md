# LUB Web Portal - Current State

**Last updated:** 2026-03-19
**Updated by:** Codex (baseline commit)

---

## Project

- **Repo:** `C:\webprojects\lub`
- **Latest deep handover:** `docs/session_documents/session_48_phase1_runtime_verification_completion_and_next_stream_handover.md`
- **Project guide:** `docs/lub_web_portal_project_guide_for_claude_code.md`

---

## Current Baseline

| Check | Status |
|-------|--------|
| Build (`npm run build`) | Last known: passing at Session 48 |
| Lint (`npm run lint`) | Not re-verified in Session 48 - re-run before next stream |
| Phase 1 destructive smoke | **15 passed** (verified 2026-03-13) |

Phase 1 baseline is the non-negotiable floor. Do not merge or ship changes that break it.

---

## Active Stream

**No active stream.** Phase 1 hardening is complete.

Next recommended stream: **Audit remaining privileged admin write paths outside Phase 1 scope.**

Leading candidates (in rough priority order):
1. Admin state management - `upsertState`, `updateStateActiveStatus` in `src/lib/supabase.ts` / `src/pages/AdminStateManagement.tsx`
2. Admin user role management - `addUserRole`, `updateUserRole`, `removeUserRole`
3. Admin directory visibility - `updateFieldVisibility`, `updateMultipleFieldVisibilities`
4. Admin organization profile management

Assign exactly one domain to one agent per session. Update this section when a stream starts.

---

## Last Verified

- **When:** 2026-03-13
- **What:** Full Phase 1 destructive Playwright suite
- **Result:** 15 passed
- **Command:**
  ```
  npm run test:e2e:phase1:local:destructive
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
- Lint status is unconfirmed - run `npm run lint` at start of next stream before touching any files.
- Broader validation-consumption cleanup is deferred - do not start it until after the next privileged-write hardening slice is complete.

---

## Next Recommended Action

1. Run `npm run build` and `npm run lint` on the committed baseline and record the result here
2. Start next stream: **admin state management hardening**
   - Inspect `src/lib/supabase.ts` service functions for state management
   - Inspect `src/pages/AdminStateManagement.tsx`
   - Check existing migrations for any partial wrapper coverage
   - Plan new `_with_session` wrapper migration
   - Implement frontend wiring
   - Prove live with targeted Playwright coverage

---

## References

- Project guide: `docs/lub_web_portal_project_guide_for_claude_code.md`
- Latest deep handover: `docs/session_documents/session_48_phase1_runtime_verification_completion_and_next_stream_handover.md`
- Startup rules: `CLAUDE.md` (Claude Code) / `AGENTS.md` (Codex)
