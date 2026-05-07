# LUB Web Portal - Current State

**Last updated:** 2026-05-07  
**Updated by:** Codex (`COD-EVENTS-BADGE-CAMERA-SCANNER-072` closeout)

---

## Project

- **Repo:** `C:\webprojects\lub`
- **Latest deep handover:** `docs/session_documents/session_78_smart_upload_batch_005.md`
- **Project guide:** `docs/lub_web_portal_project_guide_for_claude_code.md`

---

## Current Baseline

| Check | Status |
|-------|--------|
| Lint (`npm run lint`) | PASS - 0 errors, 3 expected shadcn warnings |
| Build (`npm run build`) | PASS |
| Phase 1 destructive smoke | **15 passed** baseline |
| Phase 1 readonly smoke | PASS - 3 passed / 12 skipped |

---

## Active Stream

**Active stream:** None.

---

## Last Verified

- **When:** 2026-05-07
- **What:** `COD-EVENTS-BADGE-CAMERA-SCANNER-072` - admin badge check-in camera scanner.
- **Deploy/apply commands run:** None (frontend-only slice).
- **Result:** Lint PASS, Build PASS, Phase 1 readonly smoke PASS on retry.

Runtime outcomes:
- Admin check-in page now supports camera QR scanning in addition to manual badge code/URL entry.
- Scanner requests rear camera, continuously detects QR payload, normalizes to badge code, and auto-runs existing lookup flow.
- Existing manage/view permission behavior remains unchanged.
- Manual lookup and attendance marking behavior remains unchanged.

---

## Recently Closed Events Follow-ups

### 072 Badge Check-in Camera Scanner

- Closed on 2026-05-07.
- Added camera scanner UI and loop on `/admin/content/events/:id/checkin`.
- No schema changes, no edge function changes.
- Safe fallback remains available: manual entry/paste.

### 071 Badge Layout / Profession Options / Badge Download / Aadhaar Reports

- Closed end-to-end on 2026-05-07.
- Migrations `070`, `071`, and `071x` applied.
- Badge renderer deployed and verified.

---

## In Progress / Dirty State

- Worktree remains collaboratively dirty from prior slices; do not revert unrelated files.

---

## Deferred / Next Candidate Work

1. `COD-MSME-SHOWCASE-001`
2. `COD-MSME-ISSUES-001`
3. `COD-PUBLIC-001`
4. `COD-MEMBERS-EXPORT-002`

---

## References

- Task board: `docs/agent_coordination/TASK_BOARD.md`
- Handoff notes: `docs/agent_coordination/HANDOFF_NOTES.md`
- Project guide: `docs/lub_web_portal_project_guide_for_claude_code.md`
- Latest deep handover: `docs/session_documents/session_78_smart_upload_batch_005.md`
