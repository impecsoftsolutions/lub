# LUB Agent Handoff Notes

Keep this file short and overwrite it instead of appending a journal.

## Single-Board Rule

Only `docs/agent_coordination/TASK_BOARD.md` is authoritative. Do not edit task rows in worktree-local board copies.

## Current Owner — Codex

## Current Slice — COD-EVENTS-CMS-032

Events CMS full implementation batch is complete in repo.

## What landed

Backend/data:
- Added migration `supabase/migrations/20260503120000_events_cms_full.sql`.
- New `events` table with lifecycle (`draft/published/archived`), visibility (`public/member_only`), type, schedule, invitation text, agenda items.
- Added `events.*` permissions + role mappings.
- Added secure `_with_session` admin RPCs:
  - `get_all_events_with_session`
  - `get_event_by_id_with_session`
  - `create_event_with_session`
  - `update_event_with_session`
  - `publish_event_with_session`
  - `unpublish_event_with_session`
  - `archive_event_with_session`
  - `delete_event_with_session`
- Added public RPCs:
  - `get_published_events`
  - `get_event_by_slug`
  (member-only visibility included when member/both session token is present)

Frontend/service:
- Added `eventsService` and events types in `src/lib/supabase.ts`.
- Replaced placeholder `AdminEvents` with real list/actions page.
- Added `AdminEventForm` for create/edit/publish/archive/delete.
- Wired routes:
  - `/admin/content/events`
  - `/admin/content/events/new`
  - `/admin/content/events/:id/edit`
- Sidebar now supports events visibility using `events.view` with compatibility fallback to existing activities gate.

Public UX:
- `/events` now fetches both domains:
  - Upcoming Events section from `events`
  - Activities section from `activities`
- `/events/:slug` now resolves Event first; Activity fallback second.

## Validation

- `npm run lint` → PASS (0 errors / 3 expected warnings)
- `npm run build` → PASS
- `npm run test:e2e:phase1:local` → PASS (3 passed / 12 skipped)

## Remaining runtime step

- Apply migration `20260503120000_events_cms_full.sql` to target DB before expecting live Events CRUD/RPC behavior.

## Notes

- Existing unrelated dirty/untracked artifacts remain in worktree (`.playwright-mcp/`, `artifacts/`, `supabase/.temp/`, deleted handshake docs). They were not touched as part of this slice.
