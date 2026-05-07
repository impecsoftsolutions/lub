# LUB Agent Handoff Notes

Keep this file short and overwrite it instead of appending a journal.

## Current Owner

No active slice.

## Closed Slice - COD-EVENTS-REGISTRATION-SUBMIT-NO-POPUP-080

### What changed

**`src/pages/ActivityDetail.tsx`**
- Removed pre-open `window.open('about:blank', '_blank')` from `submitRsvp`.
- Removed related close-on-error behavior.
- On `submit_event_rsvp` failure (duplicate/validation/server), page now stays in-place and shows inline error directly.
- On success, new tab opens only when `badge_code` is returned.

### Apply/deploy

- No migration needed.
- No deploy needed.

### Validation

- `npm run lint` -> PASS (0 errors / 3 expected warnings)
- `npm run build` -> PASS
- `npm run test:e2e:phase1:local` -> PASS (3 passed / 12 skipped)
