# LUB Agent Handoff Notes

Keep this file short and overwrite it instead of appending a journal.

## Current Owner

No active slice.

## Closed Slice - COD-ACTIVITIES-SLUG-DATETIME-PARITY-083

### What changed

**`supabase/migrations/20260519093000_activities_slug_datetime_083.sql`**
- Added `public.activities.start_at` and `public.activities.end_at` (`timestamptz`).
- Backfilled `start_at` from legacy `activity_date` for existing rows.
- Recreated activity RPCs to include datetime fields:
  - `get_published_activities`
  - `get_activity_by_slug`
  - `get_all_activities_with_session`
  - `get_activity_by_id_with_session`
  - `create_activity_with_session`
  - `update_activity_with_session`
- `create/update` now accept `p_start_at` / `p_end_at`; update adds `p_clear_start_at` / `p_clear_end_at` to allow explicit clearing.
- `activity_date` is preserved for compatibility and derived from `start_at` when supplied.
- Recreated `create_activity_from_event_with_session` so bridged drafts carry `start_at/end_at` from source event.
- Ends with `NOTIFY pgrst, 'reload schema'`.

**`src/pages/AdminActivityForm.tsx`**
- Slug UX now mirrors Events:
  - `Edit slug`
  - `Reset to auto`
  - auto-managed lock display
  - public URL preview
- Replaced single `Activity Date` with:
  - `Start date & time`
  - `End date & time`
- Save/Publish now send `start_at/end_at` (ISO) and clear flags when fields are empty.
- AI brief drafting hints now derive legacy `activity_date` from `start_at` for prompt continuity.

**`src/lib/supabase.ts`**
- Added `start_at/end_at` to:
  - `PublicActivity`
  - `AdminActivityListItem`
  - `AdminActivityDetail`
- Extended activity `create`/`update` payloads and RPC args with datetime fields and clear flags.

**`src/pages/AdminActivities.tsx`**
- Date sorting now prefers `start_at` and falls back to legacy `activity_date`.
- Date display now supports multi-day range rendering.

**`src/pages/Events.tsx`**
- Activity cards now use `start_at` (fallback `activity_date`) and show date ranges when `end_at` differs.

**`src/pages/ActivityDetail.tsx`**
- Activity header metadata now renders date range from `start_at/end_at` with fallback to `activity_date`.

### Apply/deploy

- Applied migration to linked remote DB:
  - `supabase db push --linked`

### Validation

- `npm run lint` -> PASS (0 errors / 3 expected warnings)
- `npm run build` -> PASS
- `npm run test:e2e:phase1:local` -> PASS (3 passed / 12 skipped)
