# LUB Web Portal - Current State

**Last updated:** 2026-04-03
**Updated by:** Codex

---

## Project

- **Repo:** `C:\webprojects\lub`
- **Latest deep handover:** `docs/session_documents/session_50_signup_state_join_prefill_and_join_flow_handover.md`
- **Project guide:** `docs/lub_web_portal_project_guide_for_claude_code.md`

---

## Current Baseline

| Check | Status |
|-------|--------|
| Build (`npm run build`) | PASS (2026-04-03) |
| Lint (`npm run lint`) | PASS - 0 errors, 0 warnings (2026-04-03) |
| Phase 1 destructive smoke | **15 passed** (verified 2026-03-13) |
| Phase 1 readonly smoke | PASS - 3 passed / 12 skipped (2026-04-03) |

Phase 1 baseline remains the non-negotiable floor.

---

## Active Stream

**Active stream:** None - the hardcoded-values cleanup stream is complete.  
**Current owner:** None  
**Task board:** `docs/agent_coordination/TASK_BOARD.md`

Most recently completed stream:
- Hardcoded-values cleanup across org-profile data, smoke-test admin credentials, Footer/SignIn/AdminProfileSettings UI consumption, and payment-settings admin cleanup

---

## Last Verified

- **When:** 2026-04-03
- **What:** Hardcoded-values cleanup plus payment-settings follow-up
- **Result:** Lint and build pass after:
  - `organization_website` DB/type/RPC wiring
  - Footer website + org-profile UI consumption
  - smoke admin credential cleanup
  - payment-settings delete action
- **Command(s):**
  ```
  npm run lint
  npm run build
  npm run test:e2e:phase1:local
  ```

---

## In Progress / Dirty State

This stream is ready to commit.

Expected state after the next checkpoint commit:
- working tree clean
- coordination docs committed
- hardcoded-values cleanup and payment-settings delete flow checkpointed

If `git status` is dirty after that commit, inspect the delta before starting the next stream.

---

## Deferred Work

| # | Item | Notes |
|---|------|-------|
| 1 | Validation-consumption cleanup | Two separate validation layers exist. This is the next Codex stream. |
| 2 | Review non-blocking build warnings | Build still emits chunk-size and `sessionManager` import-graph warnings. These are optimization concerns, not correctness blockers. |

---

## Known Risks / Watch Items

- **Edge env step still pending** - `supabase/functions/send-email/index.ts` now requires `RESEND_FROM_ADDRESS` in the edge-function environment.
- **Storage migration may still be pending in the real environment** - `supabase/migrations/20260403123000_create_storage_buckets_for_public_files_and_member_photos.sql` should be applied if QR/document uploads are still failing.
- **Build warnings are still present** - Vite still reports large chunk size and mixed dynamic/static import usage for `src/lib/sessionManager.ts`.
- **Join payment-proof upload path** - if the storage migration has not been applied, this path can still fail for the same reason as QR uploads.

---

## Next Recommended Action

Start **COD-VAL-001**: validation-consumption cleanup.

Only remaining environment follow-up from the completed stream:
1. set `RESEND_FROM_ADDRESS`
2. apply the storage-bucket migration if upload paths are still failing in the real environment

---

## References

- Task board: `docs/agent_coordination/TASK_BOARD.md`
- Handoff notes: `docs/agent_coordination/HANDOFF_NOTES.md`
- Project guide: `docs/lub_web_portal_project_guide_for_claude_code.md`
- Latest deep handover: `docs/session_documents/session_50_signup_state_join_prefill_and_join_flow_handover.md`
