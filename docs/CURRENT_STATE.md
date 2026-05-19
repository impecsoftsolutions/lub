# LUB Web Portal - Current State

**Last updated:** 2026-05-19  
**Updated by:** Codex (`COD-ACTIVITIES-SLUG-DATETIME-PARITY-083`)

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
| Phase 1 readonly smoke | Last known PASS baseline: 3 passed / 12 skipped |

---

## Active Stream

**Active stream:** None.

---

## Last Verified

- **When:** 2026-05-19
- **What:** `COD-ACTIVITIES-SLUG-DATETIME-PARITY-083` - Activities now use Event-style slug UX in admin (`Edit slug`, auto-managed state, URL preview), and Activities support multi-day datetimes with `start_at` / `end_at` in DB/RPC/service/UI while keeping `activity_date` compatibility.
- **Deploy/apply commands run:** `supabase db push --linked` (applied `20260519093000_activities_slug_datetime_083.sql`).
- **Result:** Lint PASS (0 errors / 3 warnings), Build PASS, Phase1 readonly smoke PASS (3 passed / 12 skipped).

Runtime notes:
- `src/pages/AdminActivityForm.tsx`: slug field now mirrors Event UX and date fields are now `Start date & time` + `End date & time`.
- `supabase/migrations/20260519093000_activities_slug_datetime_083.sql`: added `activities.start_at` + `activities.end_at`, backfilled `start_at` from legacy `activity_date`, and recreated activity read/write RPCs to include datetime fields.
- `src/lib/supabase.ts`: activity types and create/update payloads now include `start_at` / `end_at`.
- `src/pages/Events.tsx`, `src/pages/ActivityDetail.tsx`, `src/pages/AdminActivities.tsx`: activity date rendering now prefers datetime range (start/end) and falls back to legacy `activity_date`.

---

## Recently Closed Events Follow-ups

### 083 Activities slug/date parity

- Closed on 2026-05-19.
- Added migration: `supabase/migrations/20260519093000_activities_slug_datetime_083.sql` and applied to linked DB.
- Updated Activities admin form to Event-style slug controls and multi-day datetime fields.
- Updated public/admin activity list/detail consumers to render date ranges from `start_at/end_at` with `activity_date` fallback.

### 081 Registration deadline toggle

- Closed on 2026-05-08.
- Added migration: `supabase/migrations/20260507025000_events_registration_deadline_toggle_081.sql` and applied to linked DB.
- Updated admin UI to support explicit custom deadline enable/disable.
- Updated public event registration rendering so disabled custom deadline is hidden while registration still auto-closes at event end.

### 078 Excerpt + Invitation Visibility

- Closed on 2026-05-07.
- Added migration: `supabase/migrations/20260507024000_events_excerpt_invitation_public_visibility_078.sql` and applied to linked DB.
- Updated admin UI: `src/pages/AdminEventForm.tsx` with `Show on website` checkboxes for Excerpt and Invitation Text.
- Public event reads now honor toggles in `events.ai_metadata` via:
  - `get_published_events`
  - `get_event_by_slug`

### 077 Short Share URL


- Closed on 2026-05-07.
- Added migration: `supabase/migrations/20260507023000_events_short_share_url_077.sql` and applied to linked DB.
- Added public short redirect route and resolver: `/r/:code`.
- Added admin controls in Share RSVP panel to view/copy/open/refresh short URL.

### 076 Badge Window + Duplicate Guard

- Runtime apply closed on 2026-05-07 (`supabase db push --linked`).
- `src/pages/ActivityDetail.tsx`: opens badge page in new window for submit + Get-my-badge and maps duplicate error codes.
- `src/pages/EventBadgeDownload.tsx`: removed `Open Image` and `Open PDF` buttons.

### 075 Post-registration badge page + JPG download

- Closed on 2026-05-07.
- UI-only slice; no migrations or edge function changes.
- `src/pages/ActivityDetail.tsx`: submit success and Get-my-badge now route to website badge page.
- `src/pages/EventBadgeDownload.tsx`: code/mobile lookup support + JPG preview/download.
- `src/lib/pdfImageRender.ts`: added `renderPdfFirstPageAsJpegBlob(...)` helper.
- `src/App.tsx`: added explicit `/events/badge` route.

### 074 Check-in UI - Registrations Columns + Undo Action

- Closed on 2026-05-07.
- UI-only slice; no migrations or edge function changes.

### 073 Check-in Persistence Backend

- Closed on 2026-05-07.
- Migration `20260507020000_events_checkin_persist_073.sql` applied.

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
