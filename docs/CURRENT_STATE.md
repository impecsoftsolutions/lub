# LUB Web Portal - Current State

**Last updated:** 2026-04-03
**Updated by:** Codex

---

## Project

- **Repo:** `C:\webprojects\lub`
- **Latest deep handover:** `docs/session_documents/session_51_hardcoded_cleanup_payment_settings_and_shared_workflow_closeout.md`
- **Project guide:** `docs/lub_web_portal_project_guide_for_claude_code.md`

---

## Current Baseline

| Check | Status |
|-------|--------|
| Build (`npm run build`) | PASS (2026-04-03) |
| Lint (`npm run lint`) | PASS - 0 errors, 3 warnings in shadcn primitives (expected) (2026-04-03) |
| Phase 1 destructive smoke | **15 passed** (verified 2026-03-13) |
| Phase 1 readonly smoke | PASS - 3 passed / 12 skipped (2026-04-03) |

Phase 1 baseline remains the non-negotiable floor.

---

## Active Stream

**Active stream:** None. The shadcn/ui + Tailwind v4 migration is complete, runtime-verified, and committed (COD-SHADCN-001 + CLAUDE-SHADCN-002).  
**Current owner:** None  
**Task board:** `docs/agent_coordination/TASK_BOARD.md`

Most recently completed stream:
- CLAUDE-SHADCN-002: shadcn/ui + Tailwind v4 migration Phases 2-5 complete and committed. Ocean Breeze CSS theme, 19 shadcn UI components, AppSidebar (shadcn Sidebar + React Router), AdminLayout with SidebarProvider, and the key admin surfaces migrated to shadcn primitives.
- COD-SHADCN-001: Tailwind v4 install, @tailwindcss/vite, radix peer deps, @/ alias, and tailwind.config.js removal - verified and committed with the shared migration checkpoint.
- COD-DASH-001: aligned the dashboard `Active Admin Users` metric with real admin-capable users by counting active, non-frozen `users` rows where `account_type` is `admin` or `both`.
- CLAUDE-UI-004: Stripe-style redesign for authenticated portal surfaces.
- CLAUDE-UI-003: member detail view for all statuses + professional PDF export.

---

## Last Verified

- **When:** 2026-04-03
- **What:** shadcn/ui + Tailwind v4 migration (COD-SHADCN-001 + CLAUDE-SHADCN-002)
- **Result:** Full migration complete, runtime-verified, and committed. Build passes, lint passes with 0 errors and 3 expected warnings in shadcn CVA primitives, and Phase 1 readonly smoke remains 3 passed / 12 skipped.
- **Command(s):**
  ```
  npm run build
  npm run lint
  npm run test:e2e:phase1:local
  ```

---

## In Progress / Dirty State

No active slice.

Working tree should be clean after the migration checkpoint commit, except for local-only machine files if present. Run `git status` before starting the next stream.

---

## Deferred Work

| # | Item | Notes |
|---|------|-------|
| 1 | Review remaining main chunk-size warning | The `sessionManager` import-graph warning is fixed. The remaining oversized main bundle is still an optimization concern, not a correctness blocker. |
| 2 | Broader validation cleanup follow-up | First safe slice is done. Any broader validation changes should be evidence-driven and kept narrow. |
| 3 | Define and implement app-wide settings hub | Add a portal-level Settings area for global/application settings that do not fit an existing narrower settings section. Queue entry lives on the shared task board as `CLAUDE-UI-005`. |
| 4 | Investigate any remaining focus-return anomalies | The shared permission-refresh root cause is fixed. Reopen only if there is still fresh evidence of a similar issue in a page-specific flow. |

---

## Known Risks / Watch Items

- **Edge env step still pending** - `supabase/functions/send-email/index.ts` now requires `RESEND_FROM_ADDRESS` in the edge-function environment.
- **Storage migration may still be pending in the real environment** - `supabase/migrations/20260403123000_create_storage_buckets_for_public_files_and_member_photos.sql` should be applied if QR/document uploads are still failing.
- **Build warning still present** - Vite still reports a large main application chunk.
- **Join payment-proof upload path** - if the storage migration has not been applied, this path can still fail for the same reason as QR uploads.

---

## Next Recommended Action

The shadcn migration checkpoint is complete. Next options:

- **`CLAUDE-UI-005`** - Application settings hub in Settings
- Start the next user-prioritized slice if a different feature or bug takes precedence

Remaining environment follow-up:
1. set `RESEND_FROM_ADDRESS` in edge function env
2. apply the storage-bucket migration if upload paths are still failing in the real environment

---

## References

- Task board: `docs/agent_coordination/TASK_BOARD.md`
- Handoff notes: `docs/agent_coordination/HANDOFF_NOTES.md`
- Project guide: `docs/lub_web_portal_project_guide_for_claude_code.md`
- Latest deep handover: `docs/session_documents/session_51_hardcoded_cleanup_payment_settings_and_shared_workflow_closeout.md`
