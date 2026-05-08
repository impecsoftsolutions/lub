# LUB Agent Handoff Notes

Keep this file short and overwrite it instead of appending a journal.

## Current Owner

No active slice.

## Closed Slice - COD-EVENTS-REGISTRATION-DEADLINE-TOGGLE-081

### What changed

**`src/pages/AdminEventForm.tsx`**
- Added `Enable custom deadline` toggle in the Registration block.
- Admin payload now persists `ai_metadata.rsvp_deadline_enabled`.
- `rsvp_deadline_at` is saved only when custom deadline is enabled.
- Save validation now enforces:
  - custom deadline must be set if enabled,
  - custom deadline cannot be after event end datetime.
- When enabling custom deadline with an empty field, the input auto-seeds from event end (or start if end is empty).

**`src/pages/ActivityDetail.tsx`**
- Public event page now reads `rsvp.deadline_enabled`.
- Deadline text is shown only when custom deadline is enabled.
- When custom deadline is disabled, registration still closes by server-side event-end fallback, but deadline text is hidden.

**`src/lib/supabase.ts`**
- Extended `EventRsvpPublicConfig` with optional `deadline_enabled`.

**`supabase/migrations/20260507025000_events_registration_deadline_toggle_081.sql`**
- Recreated `get_event_by_slug`:
  - computes `deadline_enabled` from `ai_metadata.rsvp_deadline_enabled` (fallback: `rsvp_deadline_at IS NOT NULL`),
  - computes effective deadline:
    - enabled: `COALESCE(rsvp_deadline_at, end_at, start_at)`,
    - disabled: `COALESCE(end_at, start_at)`,
  - returns `rsvp.deadline_enabled`,
  - hides `rsvp.deadline_at` when disabled.
- Recreated `submit_event_rsvp` with the same effective-deadline logic for enforcement.
- Ends with `NOTIFY pgrst, 'reload schema'`.

### Apply/deploy

- Applied migration to linked remote DB:
  - `supabase db push --linked`

### Validation

- `npm run lint` -> PASS (0 errors / 3 expected warnings)
- `npm run build` -> PASS
- `npm run test:e2e:phase1:local` -> PASS (3 passed / 12 skipped)
