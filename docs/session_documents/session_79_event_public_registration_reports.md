# Session 79 - COD-EVENT-PUBLIC-REPORT-001

## Summary

Completed the public, password-protected registration report feature for Events across database, service, admin UI, public UI, and Playwright coverage.

The implementation was planned and reviewed with Claude Code CLI using the required `claude-opus-5` model at high effort. Codex and Claude froze the data/security/UI contract before coding in `docs/agent_coordination/EVENT_PUBLIC_REPORT_CONTRACT.md`. Claude implemented the owned UI slice after the backend contract landed, then independently reviewed the integrated result and reported `NO REMAINING DEVIATIONS`.

## Files Changed

New:

- `supabase/migrations/20260809100000_event_public_registration_reports.sql`
- `src/pages/EventPublicReport.tsx`
- `tests/e2e/event-public-report.spec.ts`
- `docs/agent_coordination/EVENT_PUBLIC_REPORT_CONTRACT.md`
- `docs/session_documents/session_79_event_public_registration_reports.md`

Modified:

- `src/lib/supabase.ts`
- `src/pages/AdminEventForm.tsx`
- `src/App.tsx`
- `docs/CURRENT_STATE.md`
- `docs/agent_coordination/TASK_BOARD.md`

## Agreed Contract and Collaboration

Before implementation, Codex presented the task and proposed architecture to Claude Code. The convergence discussion resolved:

- private secret/config storage instead of adding password data to publicly readable event rows
- 32-character opaque lowercase-hex report tokens
- bcrypt password hashing and a password-minted two-hour anonymous view token
- `_with_session` admin settings/update/regeneration/create RPCs
- an atomic event-plus-report creation wrapper
- a current dynamic field allowlist shared by admin and public reads
- explicit public JSON construction that cannot leak unselected columns
- India-local multi-day eligibility for `visit_date`
- badge-number selection through the latest badge row
- active-registration-only results
- 25/50/100/All page sizes, 50 default, and a 10,000-row All/download cap
- exact-visible-column CSV with BOM, RFC 4180 escaping, and spreadsheet-formula neutralization
- compatibility with the existing `/r/:code` event short-link route by dispatching 32-hex values to reports and all other values to the existing redirect

## Database and Security

The migration adds two private tables:

- `event_public_reports`
- `event_public_report_view_sessions`

Both have RLS enabled, no policies, and browser table grants revoked. A definer trigger provisions a report row for every newly created event. Existing events were backfilled with opaque tokens, conservative `full_name` plus `badge_code` selections, no password, and disabled status.

Admin operations use session-derived permission checks and never accept an actor UUID:

- `get_event_public_report_settings_with_session`
- `update_event_public_report_settings_with_session`
- `regenerate_event_public_report_token_with_session`
- `create_event_with_public_report_with_session`

The public password/read path uses:

- `open_public_event_report`
- `get_public_event_report_rows`

Important enforcement:

- passwords are bcrypt-hashed and never returned
- unknown tokens perform a dummy bcrypt check
- failed passwords are rate-limited with a 20-attempt / 10-minute lock
- public view sessions expire after two hours
- disabling or regenerating a report invalidates access
- every row request rechecks current enablement and the current admin allowlist
- only confirmed, pending, and waitlisted registrations are included
- cancelled registrations are excluded
- Aadhaar is never an eligible report field
- responses use explicit per-field JSON and include no event/report/RSVP IDs or internal status data

## Service and Admin UI

`src/lib/supabase.ts` now exposes typed report settings, field descriptors, public-access payloads, and row payloads. Event creation optionally uses the atomic report-aware create RPC. Separate service methods cover settings read/save, token regeneration, password opening, and paged public rows.

The event form now includes a Public registration report section:

- a copyable/openable per-event link
- token regeneration with confirmation
- one password field, plus generated-password/copy support
- a clear shown-once password message
- enable/disable control
- dynamic checkboxes for fields actually collected by the event
- badge number as an always-available selectable field
- sensitive-field and no-longer-collected guidance

New events receive a generated 10-character unambiguous password and conservative default fields. The event and enabled report are committed atomically. Existing events have a link but remain disabled until an admin sets a password and enables the report.

## Public UI

`src/pages/EventPublicReport.tsx` implements:

- a generic password gate that does not disclose metadata for a wrong password/token
- temporary lock and disabled/expired access states
- event title, venue, and India-formatted date/time header
- a responsive registration table
- 50 rows by default
- 25, 50, 100, and All page sizes
- deterministic pagination
- viewer field show/hide controls limited to the admin allowlist
- protection against hiding the final visible field
- all-record CSV download containing exactly the currently visible fields
- download refusal when the server reports truncation

The existing `/r/:code` route remains intact. A route dispatcher sends a 32-hex parameter to the report page and preserves the existing short-link behavior for other codes. Existing `/r/` noindex handling covers both.

## Runtime Verification

Migration `20260809100000_event_public_registration_reports.sql` was applied to the linked database.

Migration audit after application:

- local: 273
- remote: 273
- local-only: 0
- remote-only: 0

Live REST/runtime probes verified:

- invalid admin sessions are rejected
- unknown report tokens return only generic access denial
- invalid view tokens are rejected
- anonymous direct reads of private report tables receive HTTP 401
- atomic event creation creates/configures an enabled report
- an invalid-field atomic create rolls back without a partial event
- a public registration and issued badge appear in the report
- wrong passwords reveal no report data
- correct passwords mint access and return the expected total
- row JSON contains exactly the selected keys
- badge number is populated
- a non-allowed email request is rejected with `fields_changed`
- disabling the report invalidates the prior view token
- the temporary event and custom session were cleaned up

Linked database lint reported only two unrelated pre-existing function issues (`reset_user_password_debug` search path and an ambiguous `email` reference in `create_auth_accounts_for_existing_members`). No new report function issue was reported.

## Automated Verification

Commands run:

```text
npm run db:migrations:audit
npm run lint
npm run build
PHASE1_SMOKE_BASE_URL=http://127.0.0.1:5173 npx playwright test tests/e2e/event-public-report.spec.ts --project=chromium
npm run test:e2e:phase1:local
```

Results:

- migration audit: PASS (273 local / 273 remote)
- lint: PASS (0 errors / 3 established shadcn fast-refresh warnings)
- build: PASS
- focused public-report Playwright: PASS (1 test)
- Phase 1 readonly smoke: 3 failed / 12 skipped before reaching the report feature

The Phase 1 failures come from the existing auth helper still locating separate email and mobile inputs while the current sign-in page uses identifier plus password. Failure output showed the current password sign-in UI. This is a harness/auth-baseline mismatch, not evidence of an event-report regression; the historical destructive baseline remains 15 passed and was not reopened for this slice.

Focused Playwright covers:

- `noindex`
- wrong-password metadata isolation
- successful event header and venue rendering
- default page size 50
- 25/100/All selection
- offset-50 pagination
- absence of unallowed email/Aadhaar requests
- viewer field hiding
- CSV containing exactly visible columns
- UTF-8 BOM
- formula-injection neutralization

## Final Claude Review

A fresh read-only Claude Code CLI session inspected the frozen contract and all SQL, service, route, admin UI, public UI, and Playwright files using `claude-opus-5` at high effort.

Final result:

```text
NO REMAINING DEVIATIONS
```

The review found no material SQL security/data leak, cross-event isolation, permission/grant, bcrypt/view-token/lockout, pagination/field-boundary, TypeScript mapping, or UI contract defect. No corrective convergence round was required after the final review.

## Follow-up - Sortable headers and no-wrap cells

Completed `COD-EVENT-PUBLIC-REPORT-SORT-002` on 2026-08-09 as a focused continuation of this session.

The user requested sorting on report headers and removal of wrapping in table data cells. Codex and Claude Code CLI (`claude-opus-5`, high effort) reconverged before implementation and recorded the agreed details in `EVENT_PUBLIC_REPORT_CONTRACT.md`.

Implemented:

- server-side whole-result-set sorting through optional `p_sort_key` and `p_sort_direction`
- removal of the old four-argument RPC before creating the new signature, avoiding PostgREST overload ambiguity
- case-insensitive trimmed text ordering with blanks/nulls last and stable creation/id tie-breakers
- identical ordering for page selection and returned JSON aggregation
- sortable buttons on every visible header with ascending/descending icons and `aria-sort`
- page-one reset on sort changes
- sorted CSV downloads
- safe clearing/retry when a sorted field is hidden, removed, or rejected as stale
- `white-space: nowrap` on all body data cells, with full values preserved through horizontal scrolling

New migration:

- `supabase/migrations/20260809110000_sort_public_event_report_rows.sql`

Validation:

- migration applied to the linked database
- migration audit PASS: 274 local / 274 remote / no drift
- six-argument and default-argument live REST probes both resolve the RPC normally
- focused Playwright PASS, including sort direction, offset reset, stale-sort recovery, CSV sort parameters, and computed nowrap styling
- lint PASS: 0 errors / 3 established warnings
- production build PASS
- repository-wide TypeScript check still reports many established unrelated errors; no error references the public report page or new sort service arguments
- independent Claude Opus 5/high review: `NO REMAINING DEVIATIONS`

## Follow-up - Global compact sortable headers

Completed `COD-GLOBAL-SORTABLE-HEADER-001` on 2026-08-10.

The public report's sorting arrows prompted a site-wide inventory. Six sortable table-header surfaces existed, each with duplicated icons and presentation. Codex and Claude Code CLI (`claude-opus-5`, high effort) agreed and recorded a centralized contract in `docs/agent_coordination/GLOBAL_SORTABLE_HEADER_CONTRACT.md` before implementation.

Added:

- `src/components/ui/sortable-table-header.tsx`

The shared component owns:

- semantic `<th scope="col">` and native sort button markup
- ascending/descending/none `aria-sort`
- keyboard focus treatment
- pointer cursor
- label/icon spacing
- fixed non-overridable 10px icons and colors

Applied to:

- Public Event Registration Report
- Admin Event Registrations
- Admin Events
- Admin Payments Report
- Admin Users
- Admin LUB Roles

Unrelated sort selects, disclosure chevrons, form-builder move controls, and drag-reordering handles remain unchanged.

Validation:

- focused public-report Playwright PASS, including computed icon width/height of 10px
- signed-in Admin Users header check PASS: none -> ascending -> descending
- signed-in LUB Roles header check PASS: Custom -> ascending -> descending -> Custom
- repository inventory confirms every sortable table header consumes the shared component
- lint PASS: 0 errors / 3 established warnings
- production build PASS
- Phase 1 readonly: 3 failed / 12 skipped at the pre-existing stale sign-in helper before admin routes
- final Claude Opus 5/high review after centralizing pointer-cursor ownership: `NO REMAINING DEVIATIONS`

No database migration was required.

## Follow-up - Gender and Meal Preference summaries

Completed `COD-EVENT-PUBLIC-REPORT-SUMMARY-003` on 2026-08-12.

The public report now shows compact, responsive Gender and Meal Preference summaries when those fields are currently collected and included in the admin's public-report allowlist. Counts cover the complete active registration set and refresh with each normal report-row request, so they stay aligned with the current total rather than becoming stale after password entry.

Backend and security behavior:

- migration `20260812100000_public_event_report_registration_summaries.sql` replaces the existing six-argument rows RPC without changing its signature or grants
- corrective migration `20260812103000_public_event_report_summary_null_bucket_order.sql` pins the null/blank bucket after named values regardless of count, resolving the first independent review finding
- summaries are scoped to the view token's event and active RSVP statuses
- only current admin-allowed Gender/Meal Preference fields are aggregated
- case and surrounding whitespace are normalized before grouping
- null and blank answers share a `Not specified` bucket
- unauthorized fields are absent; authorized fields with zero active registrations return an empty item list

UI behavior:

- a `Registration summary` section appears between the event header and report controls
- each allowed field has a restrained summary group with humanized labels and counts
- an empty allowed group shows `No responses`
- viewer column hiding does not remove the corresponding admin-authorized summary
- no summary section renders when neither summary field is allowed

Ownership followed the agreed split: Codex implemented migration, service mapping, tests, runtime, and docs; Claude Code Opus 5/high implemented only the public report UI after the backend contract landed.

Validation:

- both migrations applied to the linked database; audit PASS at 276 local / 276 remote / no drift
- focused Playwright PASS: 3 tests, including a high-count null-bucket ordering contract check
- lint PASS: 0 errors / 3 established warnings
- production build PASS
- Phase 1 readonly before/after continues to stop at the pre-existing stale sign-in helper (3 failed / 12 skipped), before the report route

The first independent Claude review found that `NULLS LAST` only handled equal-count ties. Codex added and applied the corrective migration, strengthened the fixture with a highest-count null bucket, and aligned task-state documentation. Final Claude Code Opus 5/high re-review returned `NO REMAINING DEVIATIONS`.
