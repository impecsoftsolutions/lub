# Event Public Registration Report - Frozen Contract

**Task:** `COD-EVENT-PUBLIC-REPORT-001`
**Agreed:** 2026-08-09
**Collaborators:** Codex + Claude Code CLI (`claude-opus-5`, high effort)

This contract was agreed before implementation. Material deviations require a new Codex/Claude Code convergence round before code continues.

## Ownership and order

1. Codex owns SQL/migrations, the `src/lib/supabase.ts` service contract, database/runtime validation, and Playwright.
2. Claude Code owns the `AdminEventForm` report controls, the public report page, the `/r/:token` route, wording, responsive behavior, and UI empty/error states.
3. Codex lands and verifies the backend/service contract before Claude Code implements UI.
4. Claude Code independently reviews the complete integrated diff. Any deviation is discussed and corrected until no deviations remain.

## Storage and isolation

- Do not store report secrets on `events`, because public event rows are readable and RLS does not provide column filtering.
- Add `event_public_reports`:
  - `event_id uuid primary key references events(id) on delete cascade`
  - `token text not null unique` (32 lowercase hex characters from 16 random bytes)
  - `password_hash text`
  - `fields text[] not null default ARRAY['full_name','badge_code']`
  - `is_enabled boolean not null default false`
  - `failed_attempts integer not null default 0`
  - `locked_until timestamptz`
  - `updated_at timestamptz not null default now()`
  - `updated_by uuid references users(id) on delete set null`
- Add `event_public_report_view_sessions`:
  - `view_token text primary key` (32 lowercase hex characters)
  - `event_id uuid not null references events(id) on delete cascade`
  - `expires_at timestamptz not null`
  - `created_at timestamptz not null default now()`
- Enable RLS on both tables with no policies. Do not use `FORCE ROW LEVEL SECURITY`.
- A pinned-search-path `SECURITY DEFINER` insert trigger creates a report row/token for every new event, regardless of creation path.
- Backfill every existing event with a token, disabled report, no password hash, and `full_name + badge_code` fields.
- Fully revoke table access from `anon` and `authenticated`; access is only through definer functions.

## Password and access model

- Passwords are bcrypt hashes using `extensions.crypt` / `extensions.gen_salt('bf', 10)`. Hashes are never returned.
- Every definer function pins `search_path` to trusted schemas and qualifies pgcrypto calls.
- New-event UI creates a visible, copyable 10-character password from an unambiguous alphabet. It is shown before save and not recoverable after reload.
- Existing reports remain disabled until an admin sets a password and enables them.
- Empty-string password updates are rejected; `NULL` preserves the current hash.
- Opening a report performs bcrypt once, then mints a 32-hex two-hour `view_token` stored by the UI in `sessionStorage`, keyed by report token.
- Unknown tokens run a dummy bcrypt check so unknown-token and wrong-password timing are similar. Both return `access_denied` without event metadata, fields, counts, or rows.
- Password failures increment atomically. At 20 failures, the report is locked for 10 minutes. A locked report returns a distinct temporary-lock error suitable for an organizer-facing message.
- Successful password verification resets failures/lock. Successful admin settings saves and token regeneration also reset them.
- Disabling a report takes effect on every rows request, including already-issued view tokens.
- Token regeneration invalidates all view sessions for that event.
- Expired view sessions are cleaned opportunistically and rejected.

## SQL helpers and field eligibility

- Use one internal `event_report_available_fields(event_id)` helper for admin and public logic. Revoke execute from `PUBLIC`, `anon`, and `authenticated`.
- Guard all `ai_metadata` boolean coercion; malformed strings must not make report RPCs raise.
- Eligible fields, in stable order:
  1. `full_name` - always
  2. `email` - when collected
  3. `phone` - when collected
  4. `company` - when collected
  5. `gender` - when collected
  6. `meal_preference` - when collected
  7. `profession` - when collected
  8. `designation` - when collected
  9. `notes` - when collected
  10. `visit_date` - when the event spans more than one `Asia/Kolkata` calendar date (`start_at IS NOT NULL` and the India-local date of `COALESCE(end_at, start_at)` is after the India-local start date)
  11. `badge_code` - always
- Aadhaar is never eligible for the public shared-password report.
- New-event defaults are conservative: `full_name`, `badge_code`, and, when configured, `company` and `designation`. Email, phone, gender, and meal preference require explicit opt-in and are marked sensitive in admin UI.
- Previously selected fields that are no longer eligible remain visible in admin UI as disabled with a "no longer collected" note. Public reads defensively intersect stored fields with current eligibility.

## Admin RPC contract

All privileged browser RPCs revoke from `PUBLIC`, grant execute to `anon, authenticated` (the app uses an anon-key custom-session model), derive the actor with `resolve_custom_session_user_id`, enforce `events.edit_any` or `events.edit_own` plus ownership, and never accept an actor UUID.

- `get_event_public_report_settings_with_session(p_session_token, p_event_id)`
  - Returns token, `is_enabled`, `password_configured`, `selected_fields`, ordered `available_fields`, and `locked_until`.
- `update_event_public_report_settings_with_session(p_session_token, p_event_id, p_password, p_selected_fields, p_is_enabled)`
  - Validates a non-empty selection and eligible subset.
  - `NULL` password preserves; blank rejects; enabling requires an existing or supplied password.
  - Resets failed attempts/lock on success.
- `regenerate_event_public_report_token_with_session(p_session_token, p_event_id)`
  - Returns the new token, resets lock state, and deletes outstanding view sessions.
- `create_event_with_public_report_with_session(p_session_token, p_payload, p_report_password, p_selected_fields)`
  - Calls the existing `create_event_with_session` inside the same outer transaction, inspects its JSON result, and raises on failure so the outer transaction cannot commit a partial create.
  - Configures/enables the trigger-created report row before returning.
  - Leaves the existing create RPC intact for compatibility.
- Any internal settings helper is not executable by browser roles.

## Public RPC contract

No public RPC accepts a custom session token.

### `open_public_event_report(p_token text, p_password text)`

On success:

```json
{
  "success": true,
  "data": {
    "view_token": "32-hex",
    "expires_at": "timestamptz",
    "event": {
      "title": "text",
      "location": "text|null",
      "start_at": "timestamptz|null",
      "end_at": "timestamptz|null"
    },
    "fields": [{ "key": "full_name", "label": "Name" }],
    "total": 0
  }
}
```

Only active RSVP statuses (`confirmed`, `pending`, `waitlisted`) count. Cancelled rows are excluded and status is not exposed.

### `get_public_event_report_rows(p_view_token text, p_field_keys text[], p_limit integer, p_offset integer)`

- `p_field_keys IS NULL` means the full current admin allowlist.
- Empty field arrays are rejected.
- Canonically invalid or never-authorized keys are rejected.
- If fields changed during an existing viewer session, return `fields_changed` plus current field descriptors so UI can resync and refetch.
- `p_limit` must be exactly 25, 50, 100, or `NULL` for All.
- `p_offset` must be non-negative.
- `NULL`/All is capped at 10,000 returned rows and reports true `total` plus `truncated`; pagination beyond offset 10,000 remains allowed.
- Rows use deterministic `created_at ASC, id ASC` order.
- Badge lookup uses a lateral latest-row join unless a one-to-one constraint is proven.
- Build a complete explicit `jsonb_build_object`, filter through `jsonb_each` by effective keys, and keep allowed null keys. Never use dynamic SQL, `row_to_json`, or `jsonb_strip_nulls`.
- Every rows call verifies view-session expiry, current report enablement, and the current admin field boundary.
- Response rows contain only requested effective keys. No event/report/RSVP IDs, slug, password state, status counts, or badge internals.

## Public UI behavior

- Route compatibility: the existing `/r/:code` entry point dispatches 32-lowercase-hex values to the public report and preserves all other values for the existing short-link redirect. The report remains public and outside admin/auth guards, with `noindex` metadata.
- Password stays in component memory only. View token is stored in `sessionStorage`; expiry/disable returns to the password gate.
- Header shows event name, venue, and date/time formatted in `Asia/Kolkata` because the schema has no per-event timezone.
- Table defaults to 50; options are 25, 50, 100, All.
- Viewer field filtering is client-side within the admin allowlist and cannot hide the final visible field.
- Normal row fetch requests the full admin allowlist. Download refetches All rows with only the currently visible keys.
- If All/download is truncated, do not emit an incomplete CSV; explain the cap.
- CSV uses a UTF-8 BOM, RFC-4180 escaping, and prefixes cells beginning with `=`, `+`, `-`, or `@` to prevent spreadsheet formula injection.
- Download label makes all-record behavior explicit: `Download all N registrations (CSV)`.

## Validation

- New event atomically receives a usable token, password gate, and conservative selected fields.
- Existing events receive disabled links and can be activated by setting a password.
- Wrong passwords/unknown tokens expose no metadata or registration data.
- Admin-unticked fields never appear in public row responses; cross-event access is impossible.
- Badge number is selectable and renders.
- Event title, venue, dates, and time render.
- 25/50/100/All and default 50 work.
- Viewer field filter and exact-column CSV work.
- Token regeneration, disable, expiry, lockout, field changes, and download truncation have explicit behavior.
- Run migration checks/application and live RPC probes where available, targeted Playwright coverage, `npm run lint`, `npm run build`, and the Phase 1 read-only smoke before/after where practical.

## Follow-up: sortable headers and no-wrap cells (2026-08-09)

Codex and Claude Code CLI (`claude-opus-5`, high effort) agreed this follow-up contract before implementation:

- Sorting is performed by the public rows RPC across the full scoped event result set, not only the currently loaded page.
- `get_public_event_report_rows` gains optional `p_sort_key` and `p_sort_direction` arguments. A null key preserves the original `created_at`, `id` order for compatibility.
- The migration drops the old four-argument function signature before creating the new signature, preventing ambiguous PostgREST overload resolution.
- A non-null sort key must be in the current effective requested/admin-allowed field list; direction must be `asc` or `desc`.
- Sorting uses a materialized `lower(btrim(value))` text value, with blank/null values last and `created_at`, `id` tie-breakers. The identical ordering governs page selection and JSON aggregation. `visit_date` uses its displayed lexical value, so ISO dates are chronological and `All days` groups alphabetically.
- Every visible table header toggles ascending/descending sorting, exposes `aria-sort` and a direction icon, resets pagination to the first page, and sends the sort to normal fetches and CSV downloads.
- Sorting clears safely if the viewer hides the sorted field, the admin allowlist changes, or the server rejects stale sort state.
- All body data cells use `white-space: nowrap`; the existing horizontal scroll container preserves complete untruncated values, including notes.
- Focused Playwright verifies exact sort request parameters, direction changes, pagination reset, download order parameters, stale-sort recovery, and computed no-wrap styling.

## Follow-up: Gender and Meal Preference summaries (2026-08-12)

Codex and Claude Code CLI (`claude-opus-5`, high effort) agreed this follow-up contract before implementation:

- Every successful `get_public_event_report_rows` response adds a fresh `summaries` array calculated across the complete event result set, never only the current page.
- A summary is returned only when its field is currently available and included in the event's admin-selected report fields. The only summary keys are `gender` and `meal_preference`.
- Counts use the same event scope and active RSVP statuses (`confirmed`, `pending`, `waitlisted`) as the report total.
- Values are grouped by `NULLIF(lower(btrim(value)), '')`, merging case/spacing variants and combining null/blank responses into one null bucket.
- The response shape is `{ key, label, items: [{ value, count }] }`. The UI derives human-readable item labels with the same formatter as table cells; null renders as `Not specified`.
- Items are ordered by count descending and normalized value ascending, with the null bucket last.
- An authorized field with no active registrations is present with `items: []`; an unauthorized or unavailable field is absent. The UI shows `No responses` for the former and hides the entire summary section only when the array is empty.
- Summaries update from normal report-row fetches and remain independent of viewer column visibility. Hiding a column narrows the table/download but does not remove an admin-authorized summary.
- The existing six-argument RPC signature, defaults, security-definer behavior, grants, view-token checks, field allowlist, pagination, sorting, and explicit row JSON are unchanged.

## Follow-up: individual and bulk badge downloads (2026-08-16)

Codex and Claude Code CLI (`claude-opus-5`, high effort) agreed this follow-up contract before implementation:

- No database migration, RPC signature change, or Edge Function change is required. Badge enumeration uses the existing view-token-gated `get_public_event_report_rows`; badge rendering uses the existing public `event-badge-download` function.
- Individual badge links and the bulk action exist only when `badge_code` is currently available and inside the admin-selected report allowlist. No badge action is exposed before password verification.
- Selecting `Badge Number` authorizes access to the existing badge artwork, which may display attendee name, company, designation, and day of visit regardless of which other report columns are selected. The admin field selector must disclose this explicitly.
- Badge responses are PDFs and are converted to JPG in the browser through one shared helper consumed by the existing public badge page, admin registrations page, and public report.
- A Badge Number table cell remains plain text when blank or after the badge window closes. Otherwise it is a semantic download link that creates `event-badge-CODE.jpg`. Badge codes are uppercased and must match `^[A-Z0-9_-]+$` before use in actions or filenames.
- The browser mirrors the renderer's availability deadline: `COALESCE(event.end_at, event.start_at) + 12 hours`. When closed, individual links are disabled and the bulk control explains that badge downloads are closed. The renderer remains the source of truth; an HTTP 410 during bulk aborts the remaining queue.
- Bulk download requests only `badge_code` from the rows RPC with the report view token, `limit = NULL`, offset zero, and badge-code ascending order. A truncated response creates no ZIP because it could not contain all badges.
- Bulk codes are normalized, validated, and deduplicated. Badge PDFs are fetched with concurrency three, converted to JPG, and added under `badges/` as stable `0001-badge-CODE.jpg` entries. JSZip is loaded dynamically on click.
- Network exceptions and 5xx responses are retried once. Permanent 4xx responses are never retried. If non-410 failures remain, a ZIP of successful files may be created only with explicit `X/Y` partial-success wording; zero successes create no file and never claim completion.
- Viewer column hiding removes the per-row Badge Number links with the column but does not remove the bulk action, because viewer filtering narrows table/download presentation while the admin allowlist remains the outer authorization boundary.
- CSV behavior remains unchanged: Badge Number exports as plain text and the CSV still includes exactly the viewer-visible columns.
- Accepted existing side effect: every successful render through `event-badge-download`, including individual, admin bulk, and public bulk downloads, updates `event_badges.last_downloaded_at`. A no-stamp renderer option is a separate future improvement, not part of this slice.

## Follow-up: reliable client ZIP saving (2026-08-16)

Codex and Claude Code CLI (`claude-opus-5`, high effort) agreed this corrective follow-up before implementation after a live 117-registration run generated 115 badges but Chrome did not accept the delayed synthetic ZIP download:

- The bulk path creates one object URL for the completed ZIP, uses it for a best-effort automatic download attempt, and retains that same URL for an explicit fallback. The existing shared helper remains unchanged for individual badge downloads.
- The public report owns the ready ZIP URL through a ref and one idempotent release function. The URL is revoked on replacement, real unmount, a new bulk run, access/session reset or replacement, allowlist removal, and badge-window closure. Cleanup must remain safe under React StrictMode.
- The ZIP filename is captured when generation completes and reused exactly; the fallback never regenerates badges or recomputes the filename from later event state.
- Completion wording says `Badge ZIP ready`, never claims the browser accepted a download, distinguishes unfetched badges in partial results, and directs the viewer to the explicit save action or browser downloads list.
- A semantic `Save badge ZIP` link is rendered outside the polite live-status region without stealing focus. It saves the already-generated ZIP from a direct user gesture.
- Focused Playwright must observe the best-effort automatic download, then require a second exact-filename download from the fallback link while proving no new rows RPC or badge-render requests occur. Existing zero-success, truncation, allowlist-change, deadline, and HTTP 410 no-file behavior remains intact.
- No migration, RPC, Edge Function, security-boundary, or JSZip compression-setting change is part of this corrective slice.
