# LUB Agent Handoff Notes

Keep this file short and overwrite it instead of appending a journal.

## Single-Board Rule

Only `docs/agent_coordination/TASK_BOARD.md` is authoritative.
Do not edit task rows in worktree-local board copies.

## Current Owner — Codex

## Current Slice — COD-EVENTS-CMS-AI-AUTOFILL-038

Single-batch implementation of Event Brief AI autofill + slug UX
overhaul + agenda public toggle on top of the 032 Events CMS slice.

---

## What landed

Migration:
- `supabase/migrations/20260504000000_events_ai_autofill_and_slug_lock.sql`
  - ALTER TABLE `public.events`:
    - `show_agenda_publicly boolean NOT NULL DEFAULT false`
    - `slug_locked boolean NOT NULL DEFAULT false`
    - `ai_metadata jsonb NULL`
  - NEW RPC `check_event_slug_available_with_session(p_session_token, p_slug, p_event_id?)`
    - SECURITY DEFINER; gated on `events.create` OR `events.edit_any` OR `events.edit_own`.
    - Returns `{ success, available, normalized_slug }` (or structured failure).
  - CREATE OR REPLACE on existing event RPCs to:
    - Honor `slug_locked`: when true, reject collisions with
      `error_code='slug_conflict'` (and `conflict_slug`) instead
      of auto-suffixing.
    - Persist + return `show_agenda_publicly`, `slug_locked`, `ai_metadata`.
    - Gate public `agenda_items` by `show_agenda_publicly`
      (returns `[]` when off; admin RPCs always return the full
      array).
    - Fix the pre-existing pagination bug in `get_published_events`
      and `get_all_events_with_session` by slicing rows BEFORE
      `jsonb_agg` (subquery + LIMIT/OFFSET inside).

New Edge Function:
- `supabase/functions/draft-event-content/index.ts`
  - Cloned the proven pattern from `draft-activity-content`.
  - Modes: `draft` (default), `extract_fields`.
  - Brief ≤ 4000 chars; up to 3 source files (image ≤ 10 MB, PDF ≤
    20 MB, cumulative ≤ 30 MB).
  - Reads `ai_runtime_settings` row keyed `event_drafting`.
  - Permission gate: `events.create` OR `events.edit_any` OR
    `events.edit_own`.
  - Draft response includes `data` (title, slug, excerpt,
    description, event_type, visibility, start_at, end_at,
    location, invitation_text, agenda_items, show_agenda_publicly)
    plus an `ai` metadata block (model, generated_at,
    source_doc_count, brief_chars).
  - Fail-closed envelope with structured `error_code`
    (`brief_required`, `files_too_many`, `files_too_large`,
    `unsupported_format`, `permission_denied`, `ai_disabled`,
    `provider_unsupported`, `no_api_key`, `session_invalid`,
    `generation_failed`).

Service layer (`src/lib/supabase.ts`):
- New types: `EventAIDraftSourceFile`, `EventAIDraftHints`,
  `EventAIDraftResult`, `EventSlugAvailability`. Extended
  `AdminEventDetail` and `PublicEventDetail` with the three new
  fields where relevant.
- New methods on `eventsService`:
  - `checkSlugAvailable(token, slug, eventId?)`
  - `draftFromBrief(token, { brief, mode?, hints?, sourceFiles? })`
- Widened `create`/`update` return types to surface
  `error_code` + `conflict_slug` so the form can branch on
  `slug_conflict`.

Admin UI (`src/pages/AdminEventForm.tsx`):
- Full rewrite preserving the existing save/publish/archive/
  delete actions.
- Event Brief panel above the form with:
  - Large textarea with character counter (≤ 4000).
  - Attach-(+) chip + file input. Selected files shown as
    chips with size + remove control.
  - "Generate from Brief" button with loading state.
  - Status chips: "Draft applied" / "Partial draft — please
    review" / "Generation failed".
- Slug rendered as read-only chip with `Lock` icon by default.
  Click `Edit slug` to enter manual mode. Debounced (400ms)
  availability check via `eventsService.checkSlugAvailable`.
  Inline indicator: ✓ Available, ✗ Already taken, ✗ Invalid,
  ⚠ Could not verify (server is final authority). Save and
  Publish are disabled while the slug is `taken` / `invalid` /
  `checking`. `Reset to auto` returns the slug to derived-from-
  title with `slug_locked=false`.
- Show-agenda-publicly toggle next to the Agenda heading.
- Published-event Generate flow: confirmation dialog explains
  "Generating overwrites the current event fields. The event
  remains published." On confirm, generation proceeds.
- Save / Publish posts the new fields (`slug_locked`,
  `show_agenda_publicly`, `ai_metadata`) along with the
  existing payload. On `error_code='slug_conflict'` the form
  re-opens the slug edit row and shows the inline error.

Public detail (`src/pages/ActivityDetail.tsx`):
- No code change required. The existing event-branch render
  already gates the agenda block on `agendaItems.length > 0`,
  and the public RPC now returns `agenda_items: []` whenever
  `show_agenda_publicly = false`.

## Validation

- `npm run lint` → PASS (0 errors / 3 expected shadcn warnings)
- `npm run build` → PASS (admin chunk crossed the 500 KB warning
  threshold — no new dependency, just additional UI code; left
  for a future code-split slice)
- `npm run test:e2e:phase1:local` → PASS (3 passed / 12 skipped)

## Pending Codex runtime work

1. Apply migration `20260504000000_events_ai_autofill_and_slug_lock.sql`.
2. Deploy edge function `draft-event-content`
   (`supabase functions deploy draft-event-content`).
3. Seed `ai_runtime_settings` row keyed `event_drafting`
   (provider=openai, model, reasoning_effort, is_enabled=true,
   api_key_secret). Distinct from `member_normalization`.
4. RPC probes (admin session):
   - `check_event_slug_available_with_session`: fresh slug
     → `available=true`; existing slug → `available=false`;
     same slug while excluding the owning event_id →
     `available=true`.
   - `create_event_with_session` with `slug_locked=true` and a
     taken slug → `error_code='slug_conflict'`, no row inserted.
   - Same RPC with `slug_locked=false` → server auto-suffixes.
   - Pagination: `get_published_events(limit=2, offset=0)` →
     2 rows; `(limit=2, offset=2)` → next 2; `total` matches
     full count.
5. Edge Function probes (admin session):
   - `mode=draft` with brief only → returns full event payload.
   - With 1 image + brief → fields populate; `ai` metadata
     reports `source_doc_count: 1`.
   - With non-allowed MIME → `error_code='unsupported_format'`.
   - With > 3 files → `error_code='files_too_many'`.
   - Disable AI runtime → `error_code='ai_disabled'`.
6. Browser walk on `/admin/content/events/new`:
   - Event Brief panel renders, attach-(+) accepts files,
     Generate fills fields including agenda + show-agenda
     toggle suggestion.
   - Slug editor toggle → debounced availability indicator
     works.
   - Save / Publish blocked on confirmed-taken slug.
   - On a published event, `Generate` shows confirm dialog
     before overwriting; Cancel keeps current state.
7. Public walk on `/events/<slug>`:
   - With `show_agenda_publicly=true` → agenda renders.
   - With `show_agenda_publicly=false` → agenda block absent.

## Residual risks / follow-ups

- AI hallucination of dates / times / speakers: prompt
  explicitly forbids inventing values. Admin must spot-check.
- Latency on Generate (5–30 s with files): UI shows a clear
  loading state; admin can cancel via browser nav. No optimistic
  field flicker.
- Source files transient only (no persistence) — by design (C4).
- Admin chunk now warns at >500 KB. Out of scope for this
  slice; suggest a separate code-split slice for the admin
  bundle.
- Activity slug uniqueness is not affected; only events.
