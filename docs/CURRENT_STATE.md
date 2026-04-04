# LUB Web Portal - Current State

**Last updated:** 2026-04-04
**Updated by:** Claude Code

---

## Project

- **Repo:** `C:\webprojects\lub`
- **Latest deep handover:** `docs/session_documents/session_51_hardcoded_cleanup_payment_settings_and_shared_workflow_closeout.md`
- **Project guide:** `docs/lub_web_portal_project_guide_for_claude_code.md`

---

## Current Baseline

| Check | Status |
|-------|--------|
| Build (`npm run build`) | PASS (2026-04-04) |
| Lint (`npm run lint`) | PASS - 0 errors, 3 warnings in shadcn primitives (expected) (2026-04-04) |
| Phase 1 destructive smoke | **15 passed** (verified 2026-03-13) |
| Phase 1 readonly smoke | PASS - 3 passed / 12 skipped (2026-04-03) |

Phase 1 baseline remains the non-negotiable floor.

---

## Active Stream

**Active stream:** None. CLAUDE-APPEAR-004 third-pass changes reverted per user direction.
**Current owner:** None
**Task board:** `docs/agent_coordination/TASK_BOARD.md`

Most recently completed stream:
- **CLAUDE-APPEAR-004 (third-pass REVERTED)**: User determined the "strict Appearance linkage" third pass overreached — it removed intentional visual design choices (Footer dark navy, gradient hero blues, icon colour diversity in dashboard panels). All third-pass changes have been undone. Reverted files: `Footer.tsx` (bg-blue-900 restored), `QuickActionsPanel.tsx` (blue/green/purple icon diversity restored), `SystemStatusPanel.tsx` (Globe → text-blue-600, Building2 → text-green-600), `RecentActivityList.tsx` (border-blue-500 restored), `AuditHistoryModal.tsx` (update/create icons + badges → text-blue-600 / bg-blue-100), `ViewApplicationModal.tsx` (all 7 section icons → text-blue-600), `NormalizationPreviewModal.tsx` (focus:ring-green-500 restored), `ImageCropModal.tsx` (bg-gray-900 + inline slider hex values restored), `MembershipBenefits.tsx` (from-blue-600 to-blue-700 gradient + text-white/text-blue-100 restored), `MemberEditProfile.tsx` (from-blue-600 to-blue-700 gradient restored), `ValidationCheck.tsx` (text-gray-600 + bg-gray-100 text-gray-800 badge restored), `ExpandedMemberDetails.tsx` (User icon → text-blue-600), `AdminRegistrations.tsx` (spinners → border-blue-600).
  - `bg-black/50` overlay consolidation kept (Tailwind v4 preferred syntax, functionally identical).
  Build PASS; lint 0 errors / 3 expected warnings.
- **CLAUDE-APPEAR-004 (first pass)**: Full appearance-system conformance audit — replaced bg-white, bg-gray-*, text-gray-*, border-gray-*, bg-blue-*, focus:ring-blue-*, hover:bg-gray-*, divide-gray-* across 30+ files. Build PASS; lint 0 errors / 3 expected warnings.
- **COD-APPEAR-003**: hardcode audit pass across authenticated admin/member surfaces and shared dashboard/components. Applied safe batch replacements for theme-aware card surfaces, border/background tokens, muted/body text tokens, native table wrappers, and authenticated loading/error states in `AdminUsers`, `AdminCityManagement`, `AdminPendingCities`, `AdminStateManagement`, `AdminRegistrations`, `MemberDashboard`, `MemberViewProfile`, `MemberSettings`, `AuditHistoryModal`, `QuickActionsPanel`, `RecentActivityList`, and `SystemStatusPanel`. Build PASS; lint 0 errors / 3 expected warnings.
- **CLAUDE-APPEAR-002**: Full appearance customization expansion + typography audit — **complete**. All phases done:
  - **Font Family section**: 7 font choices (System Default, Segoe UI Variable, Inter, DM Sans, Outfit, Nunito, Poppins). Google Fonts pre-loaded on mount for live preview. `--font-body` CSS variable drives `body { font-family }`.
  - **Typography section**: 5 role rows (Page Title, Section Heading, Body, Table Header, Caption). Each has Size (S/M/L/XL) + Weight (Regular/Medium/Semibold/Bold) step buttons with live preview. "Reset all" button. Driven by `--typ-*-weight` CSS tokens + size overrides.
  - **Corner Style redesign**: Replaced 3-preset buttons with a live preview box + slider (0–24 px) + number input. Three quick-preset chips (Sharp · 2px, Balanced · 8px, Rounded · 14px). Old stored values auto-migrate.
  - **Table Style expansion**: Added Row Spacing (Compact/Normal/Relaxed presets → `--table-header-py` / `--table-row-py`) and Scrollbar Thickness (0–16 px slider+input → `--table-scrollbar-size`). Horizontal scrollbar styled via webkit CSS.
  - **Table shadow bug fixed**: Added `div:has(> .overflow-x-auto > table)` alongside the shadcn `:has(> [data-slot="table-container"])` selector so native admin tables also receive `--table-shadow`.
  - **Native table cell padding standardized**: `table th:not([data-slot])` / `table td:not([data-slot])` CSS rules with `!important` apply `--table-cell-px` / `--table-header-py` / `--table-row-py` tokens to all raw admin tables without touching shadcn Table.
  - **Typography audit (all `<th>` elements)**: Fixed remaining 34 native `<th>` elements across `AdminCityManagement.tsx` (6), `AdminDesignationsManagement.tsx` (17), `AdminStateManagement.tsx` (5), `AdminUsers.tsx` (6). All now `text-label font-medium text-muted-foreground uppercase tracking-wider`.
  - Build PASS, lint 0 errors.

Previous completed streams:
- CLAUDE-TYPE-001: Unified admin/dashboard typography scale — complete. All three phases done (shared components, page files, component files). Final grep confirms zero remaining violations in admin/dashboard scope.
- COD-JOIN-001: Fixed Join registration verification/submission loading-state regression.
- CLAUDE-APPEAR-001: Full appearance customization UI — Quick Theme presets, Custom Brand Colour picker, Corner Style selector, Colour Mode toggle.
- CLAUDE-SHADCN-002: shadcn/ui + Tailwind v4 migration Phases 2-5 complete and committed.
- COD-SHADCN-001: Tailwind v4 install and build config.
- COD-DASH-001: Dashboard Active Admin Users metric fix.
- CLAUDE-UI-004: Stripe-style redesign for authenticated portal surfaces.
- CLAUDE-UI-003: Member detail view for all statuses + professional PDF export.

---

## Last Verified

- **When:** 2026-04-04
- **What:** CLAUDE-APPEAR-004 third-pass revert — undid strict appearance linkage overreach across 13 files
- **Result:** Build and lint both pass. 0 errors.
- **Command(s):**
  ```
  npm run build
  npm run lint
  ```

---

## In Progress / Dirty State

No active slice. Working tree has uncommitted changes from CLAUDE-APPEAR-004 (30+ files — all authenticated portal surface files with hardcoded token replacements) plus prior uncommitted changes from CLAUDE-APPEAR-002 and COD-JOIN-001.

Run `git status` before starting the next stream.

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
- **Join loading-state fix is local only until committed** - the crossed Verify/Submit loading flags are corrected in code, but this fix is not committed yet.

---

## Next Recommended Action

- **`CLAUDE-UI-005`** — Application settings hub in Settings
- Commit CLAUDE-APPEAR-002 changes + COD-JOIN-001 if not yet committed
- Start the next user-prioritised slice if a different feature or bug takes precedence

Remaining environment follow-up:
1. Set `RESEND_FROM_ADDRESS` in edge function env
2. Apply the storage-bucket migration if upload paths are still failing in the real environment

---

## References

- Task board: `docs/agent_coordination/TASK_BOARD.md`
- Handoff notes: `docs/agent_coordination/HANDOFF_NOTES.md`
- Project guide: `docs/lub_web_portal_project_guide_for_claude_code.md`
- Latest deep handover: `docs/session_documents/session_51_hardcoded_cleanup_payment_settings_and_shared_workflow_closeout.md`
