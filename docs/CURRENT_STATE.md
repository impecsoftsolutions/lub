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
| Lint (`npm run lint`) | PASS - 0 errors, 0 warnings (2026-04-03) |
| Phase 1 destructive smoke | **15 passed** (verified 2026-03-13) |
| Phase 1 readonly smoke | PASS - 3 passed / 12 skipped (2026-04-03) |

Phase 1 baseline remains the non-negotiable floor.

---

## Active Stream

**Active stream:** None - the authenticated Stripe-style redesign, PDF export refinements, narrow build-warning cleanup, focus-return refresh fix, and dashboard admin-user metric alignment are complete and no slice is currently in progress.  
**Current owner:** None  
**Task board:** `docs/agent_coordination/TASK_BOARD.md`

Most recently completed stream:
- COD-DASH-001: aligned the dashboard `Active Admin Users` metric with real admin-capable users by counting active, non-frozen `users` rows where `account_type` is `admin` or `both`
- CLAUDE-UI-004: Stripe-style redesign for authenticated portal surfaces (admin chrome, registrations table, member portal nav/cards/pages)
- CLAUDE-UI-003: member detail view for all statuses + professional PDF export (View Details button, Download PDF, LUB logo header, all member sections, dynamic import of jsPDF + html2canvas)
- COD-PDF-002: strict A4 pagination, whole-section layout, 2 cm margins, last-page-only footer
- COD-BLD-001: removed the `sessionManager` mixed dynamic/static import warning; left the oversized main bundle warning deferred as an optimization concern
- COD-RUN-001: changed the window-focus permission refresh to a background refresh so the first click after returning focus is no longer swallowed by permission-gated rerenders

---

## Last Verified

- **When:** 2026-04-03
- **What:** Dashboard admin-user metric alignment
- **Result:** Build passes after replacing the `Active Admin Users` dashboard metric source. It now counts active, non-frozen `users` rows with `account_type IN ('admin', 'both')` instead of counting distinct `user_roles.user_id` values, so the card matches real admin-shell access. Repo-wide lint is currently blocked by unrelated errors under `vendor/shadcnuikit`.
- **Command(s):**
  ```
  npm run lint
  npm run build
  ```

---

## In Progress / Dirty State

No active slice.

Working tree is currently dirty with uncommitted code and coordination-doc changes from the recent PDF export, vCard removal, validation, and build-warning slices. Run `git status` before starting the next stream.

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
- **Build warning still present** - Vite still reports a large main application chunk. The earlier `sessionManager` mixed import-graph warning is fixed.
- **Join payment-proof upload path** - if the storage migration has not been applied, this path can still fail for the same reason as QR uploads.
- **Repo-wide lint is currently noisy** - `npm run lint` is failing on unrelated files under `vendor/shadcnuikit`, not on the portal code touched in the latest metric fix.

---

## Next Recommended Action

Start **CLAUDE-UI-005** unless a different user-prioritized feature or bug takes precedence.

Only remaining environment follow-up from the completed stream:
1. set `RESEND_FROM_ADDRESS`
2. apply the storage-bucket migration if upload paths are still failing in the real environment

---

## References

- Task board: `docs/agent_coordination/TASK_BOARD.md`
- Handoff notes: `docs/agent_coordination/HANDOFF_NOTES.md`
- Project guide: `docs/lub_web_portal_project_guide_for_claude_code.md`
- Latest deep handover: `docs/session_documents/session_51_hardcoded_cleanup_payment_settings_and_shared_workflow_closeout.md`
