# LUB Web Portal - Current State

**Last updated:** 2026-05-07  
**Updated by:** Claude (074 follow-up: check-in stale-cache fix + button label)

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
- **What:** `COD-EVENTS-CHECKIN-UI-FOLLOWUP-074` — UI follow-up: check-in columns in registrations + undo check-in action.
- **Deploy/apply commands run:** None (UI-only slice; no migrations or edge function changes).
- **Result:** Lint PASS (0 errors / 3 expected shadcn warnings), Build PASS, Phase 1 readonly smoke PASS (3 passed / 12 skipped).

Runtime outcomes:
- `AdminEventRegistrations`: registrations table and XLSX export now show Checked In (green badge / `—`), Checked In At (formatted timestamp), and Check-in Source (`Admin`, `QR Scan`, `Manual`).
- `AdminEventCheckin`: detail card now seeds checked-in state from `row.checked_in_at` on load; when checked in, shows "Attendance recorded" + amber "Undo check-in" button; Undo calls `eventsService.uncheckInBadge` and clears state on success.

---

## Recently Closed Events Follow-ups

### 074 Check-in UI — Registrations Columns + Undo Action

- Closed on 2026-05-07.
- UI-only slice; no migrations or edge function changes.
- `AdminEventRegistrations.tsx`: added `CheckCircle2` import, `formatCheckinTime`/`formatCheckinSource` helpers, 3 table columns (Checked In / Checked In At / Source), 3 XLSX export columns, `check_in_source` added to search haystack.
- `AdminEventCheckin.tsx`: added `isUndoing` state, `handleUndo` using `eventsService.uncheckInBadge`, `selectRow` now seeds `checkedIn` from `row.checked_in_at`, detail card shows amber Undo button when checked in.
- **074 follow-up (same session):** Fixed in-session stale-cache bug — after `checkInBadge` / `uncheckInBadge` success, the matching row in `allRsvps` is now patched in memory so re-selecting the same person without a page reload reflects the correct check-in state. Renamed "Search another" button to "Close".

### 073 Check-in Persistence Backend

- Closed on 2026-05-07.
- Added migration `20260507020000_events_checkin_persist_073.sql`.
- Includes: check-in source patch (`admin`), roster payload field exposure, and reverse check-in RPC.
- `supabase db push --linked` applied successfully.

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
