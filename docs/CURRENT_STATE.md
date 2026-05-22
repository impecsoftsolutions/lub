# LUB Web Portal - Current State

**Last updated:** 2026-05-22  
**Updated by:** Claude (094z — fix committee ordering and missing members on leadership contacts page)

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

**Active stream:** None. COD-DASHBOARD-LEADERSHIP-UX-ORDER-COMPLETENESS-094Z complete. Pending user instruction to commit/deploy.

---

## Last Verified

- **When:** 2026-05-22
- **What:** `COD-DASHBOARD-LEADERSHIP-UX-ORDER-COMPLETENESS-094Z` — (A) Fixed committee ordering: replaced hardcoded priority (president=0/secretary=1/others=99) with `lub_role_display_order` ascending from Roles Master; nulls fall back to role name alpha after ordered roles. (B) Fixed missing members: removed `isLeadershipRole()` filter from data load that was silently dropping all non-president/secretary roles (treasurer, vice president, joint secretary, etc.); expanded list now shows ALL state/district assignments matching filters; summary slots still resolve only president/secretary. (C) Added DEV-only count assertion in UnitCard (`import.meta.env.DEV`, no production noise).
- **Deploy/apply commands run:** None (pending user instruction to commit/push).
- **Result:** Lint PASS (0 errors / 3 warnings), Build PASS (659.99 kB admin chunk — slightly smaller due to removed dead code), Phase 1 readonly smoke PASS (3 passed / 12 skipped).
- **Runtime probes:** Pending — expanded list shows all committee roles, order matches Roles Master display_order, header count = rendered rows, role family filter still works, no kind badges, year/historical still functional.

## Previous Verified (094)

- **When:** 2026-05-22
- **What:** `COD-DASHBOARD-GENDER-UNITS-CITIES-LEADERSHIP-094` — dashboard metrics RPC, 4 new dashboard cards (Male Members, Female Members, Active District Units, Active Cities), new Leadership Contacts admin page, badge lookup moved before "About this Event" on public event pages.
- **Deploy/apply commands run:** `supabase db push --linked` — applied `20260522090000_admin_dashboard_metrics_with_session_094.sql` OK. `git push origin main` — Railway auto-deploy triggered.
- **Result:** Lint PASS (0 errors / 3 warnings), Build PASS.
- **Runtime probes:** Pending Codex verification — RPC returns correct counts, pending_registrations matches sidebar badge, dashboard cards load correctly, leadership contacts page renders, badge lookup appears before event description on public event page.

## Previous Verified (093x/093y)

- **When:** 2026-05-21
- **What:** `COD-DESIGNATIONS-ALTERNATE-CONTACT-LEADERSHIP-MOBILE-PHOTO-093` + hotfix `093x` + backfill `093y` — alternate contact mobile + optional photo snapshots on leadership page for alternate assignments. Hotfix corrects `is_deleted` → `is_active`. Backfill 093y re-populates `alternate_contact_mobile_snapshot` for assignments created after 093 migration (backfill had run before any alternate assignments existed). `Toast` z-index raised from `z-50` to `z-[9999]`. Removed editable Mobile and Photo URL inputs from Add Assignment modal (mobile auto-sourced from member registration via RPC COALESCE).
- **Deploy/apply commands run:** `supabase db push --linked` — applied 093, 093x, 093y OK.
- **Result:** Lint PASS (0 errors / 3 warnings), Build PASS.

## Previous Verified (092)

- **When:** 2026-05-20
- **What:** `COD-DESIGNATIONS-ALTERNATE-CONTACT-ROLE-ASSIGNMENT-092` — alternate contact role assignment in Admin Designations, with kind-aware search, badges, leadership page rendering.
- **Deploy/apply commands run:** `supabase db push --linked` — applied `20260520120000_member_lub_role_assignments_assignee_kind_092.sql` OK.
- **Result:** Lint PASS (0 errors / 3 warnings), Build PASS, Phase 1 readonly smoke PASS (3 passed / 12 skipped).
- **Runtime probes:** 7/7 PASS — schema columns accessible, existing rows defaulted to `main`, leadership RPC returns new columns, admin get RPC auth check works, assign RPC accepts new params, validation order correct.

## Previous Verified (091)

- **When:** 2026-05-20
- **What:** `COD-MEMBERS-REGISTRATION-SMART-SEARCH-ALL-FIELDS-091` — smart search across all member registration fields with AND-token matching in `get_admin_member_registrations`.
- **Deploy/apply commands run:** `supabase db push --linked` — applied `20260520110000_member_registrations_smart_search_091.sql` OK.
- **Result:** Lint PASS (0 errors / 3 warnings), Build PASS, Phase 1 readonly smoke PASS (3 passed / 12 skipped).
- **Runtime probes:** 7/7 PASS — "Kanakadurga" → 1 row (bug fixed), AND-token company+state → 4 rows, AND-token name+district → 1 row, garbage → 0 rows.

## Previous Verified (090)

- **When:** 2026-05-20
- **What:** `COD-ACTIVITIES-AI-EXCERPT-DESCRIPTION-DISTINCT-090` — deterministic excerpt/description lead-distinctness enforcement in `draft-activity-content`.
- **Deploy/apply commands run:** `supabase functions deploy draft-activity-content` — deployed successfully.
- **Result:** Lint PASS (0 errors / 3 warnings), Build PASS, Phase 1 readonly smoke PASS (3 passed / 12 skipped).
- **Synthetic tests:** 6/6 PASS (exact dup, extra clause, prefix, double-lead, already-distinct, Jaccard-rephrased).
- **Runtime probe:** RAMP/Guntur brief → excerpt and description leads distinct; date/location extraction intact.

## Previous Verified (089)

- **When:** 2026-05-20
- **What:** `COD-SHORT-URL-ENABLE-DISABLE-089` runtime closeout — all probes PASS.
- **Deploy/apply commands run:**
  - `supabase db push --linked` — applied both 088 + 089 migrations in sequence (OK)
  - `supabase functions deploy draft-activity-content` — deployed successfully (draft_share mode active)
- **Result:** Lint PASS (0 errors / 3 warnings), Build PASS, Phase 1 readonly smoke PASS (3 passed / 12 skipped).
- **Runtime probes:**
  - A (Activity first-load schema): `activities.short_url_code='ydjjzdw'`, `short_url_enabled=true` ✓
  - B (Event first-load schema): `events.short_url_code='rxzufva'`, `short_url_enabled=true` ✓
  - C (Disable): `set_activity_short_url_enabled_with_session(..., false)` → `{success:true, short_url_enabled:false}`; `resolve_activity_short_url('ydjjzdw')` → `{error_code:'short_url_disabled'}` ✓; same for event ✓
  - D (Re-enable, code preserved): `set_*_with_session(..., true)` → same code returned (`ydjjzdw` / `rxzufva`); resolver resolves correctly ✓ (no regeneration)
  - E (Refresh neutered): `refresh_activity_short_url_with_session(...)` → `{error_code:'short_url_refresh_disabled'}` ✓; same for event ✓

---

## Previous Verified (086)

- **When:** 2026-05-19
- **What:** `COD-EVENTS-ACTIVITY-EVENT-LINK-086` � Manual link from Activity to completed Event + public event-detail CTA to linked activity.
- **Deploy/apply commands run:** `supabase db push --linked` (applied `20260519124000_activity_event_link_and_public_past_event_activity_086.sql`).
- **Result:** Lint PASS (0 errors / 3 warnings), Build PASS, Phase 1 readonly smoke PASS (3 passed / 12 skipped).

Runtime notes:
- `create_activity_with_session` and `update_activity_with_session` now accept `source_event_id` linking with server-side validation:
  - only completed published/archived events (or actor-owned drafts) are eligible
  - one non-archived activity per event link is enforced
- `get_activity_by_id_with_session` now returns `source_event_id` + `source_event` metadata for Activity edit hydration.
- `get_event_by_slug` now returns `linked_activity` (published activity linked by `source_event_id`) for public rendering.
- `AdminActivityForm` now includes �Link this activity to a past event (optional)� selector and saves/unlinks on draft/publish.
- Event detail page now shows an �Event Activity� section with �Click here to see the activity� when the event is completed and a linked activity exists.
---

## Recently Closed Events Follow-ups

### 094y Event page registration-block-to-top + Leadership Contacts collapsible cards redesign

- Validation run 2026-05-22: Lint PASS (0 errors / 3 warnings), Build PASS, Phase 1 readonly smoke PASS (3 passed / 12 skipped). NOT yet committed or deployed (pending user instruction).
- **Part A — `src/pages/ActivityDetail.tsx`**: Entire registration block (heading, capacity strip, Aadhaar section, submit button — ~413 lines) moved to the top of the event content area, before "About this Event". `BadgeMobileLookup` placed immediately after the registration block. Reorder was done via Python `readlines()` + slice reassembly (not Edit, to avoid non-unique block matching on a 1664-line file). File went from 1664 to 1665 lines. No logic changed — pure section reorder.
- **Part B — `src/pages/AdminLeadershipContacts.tsx`**: Complete rewrite from flat sortable table to collapsible state/district unit cards. New sub-components: `SummarySlot` (label + name + mobile link), `MemberRow` (role + kind badge + year + period + name + tel + email), `UnitCard` (Collapsible wrapper). Collapsed view: unit title + member count + President summary slot + General Secretary summary slot. Expanded view: full committee sorted by committee year desc → role priority → name alpha. `resolveSummarySlot()` priority: latest year → active period (no end date) → most recently updated. President excludes "vice president". Secretary = "general secretary" OR "secretary general". Level filter simplified to all/state/district (national and city have no meaningful unit grouping). Uses `@radix-ui/react-collapsible` via shadcn. No new dependencies needed.

### 094 Dashboard metrics RPC + gender/units/cities cards + leadership contacts page + badge placement

- Migration applied 2026-05-22; pushed to live via `git push origin main`.
- **`20260522090000_admin_dashboard_metrics_with_session_094.sql`**: new `get_admin_dashboard_metrics_with_session(text) RETURNS jsonb` RPC. SECURITY DEFINER, `dashboard.view` permission gate, single query returning 12 metrics. `pending_registrations` uses same auth path as sidebar badge (fixes count mismatch).
- **`src/lib/supabase.ts`**: added `AdminDashboardMetrics` interface + `dashboardService.getMetricsWithSession`.
- **`src/hooks/useDashboardData.ts`**: replaced 8 parallel `supabase.from(...)` direct queries with single `dashboardService.getMetricsWithSession` RPC call. `DashboardMetrics` interface extended with `maleMembers`, `femaleMembers`, `activeDistrictUnits`, `activeCities`.
- **`src/pages/AdminDashboardOverview.tsx`**: added 4 new cards (Male Members blue, Female Members pink, Active District Units amber, Active Cities emerald). Cards reorganised into 2 grid rows.
- **`src/pages/AdminLeadershipContacts.tsx`**: new page. Loads all LUB role assignments, filters for roles containing "president"/"general secretary"/"secretary general", renders sortable table with Role, Name, Kind, Mobile (tel link), Email (mailto), Level, State, District, Year, Period columns. Filters: smart search, Level dropdown, Role family dropdown. Route: `/admin/dashboard/leadership-contacts`.
- **`src/App.tsx`**: added `<Route path="/admin/dashboard/leadership-contacts" element={<AdminLeadershipContacts />} />`.
- **`src/components/admin/AppSidebar.tsx`**: added `{ label: "Leadership Contacts", path: "/admin/dashboard/leadership-contacts" }` as second child under Dashboard section.
- **`src/pages/ActivityDetail.tsx`**: moved `BadgeMobileLookup` section from after the registration block to BEFORE "About this Event" — registered attendees now see it immediately on load without scrolling.

### 093 Alternate contact mobile + photo on leadership page (+ 093x hotfix)

- Migration applied 2026-05-20; hotfix 093x applied 2026-05-21. 6 runtime probes pending.
- Migration `20260520123000_alternate_contact_mobile_photo_leadership_093.sql`: adds `alternate_contact_mobile_snapshot` and `alternate_contact_photo_url_snapshot` (both nullable text) to `member_lub_role_assignments`. Backfills mobile from `member_registrations.alternate_mobile` for existing alternate rows (photo stays NULL). Recreates 5 RPCs: `admin_assign_member_lub_role` (13 args, new p_alternate_mobile/p_alternate_photo_url; mobile uses COALESCE(provided, member_registrations.alternate_mobile); photo uses NULLIF(provided,'')), `admin_assign_member_lub_role_with_session` (pass-through, 13 params), `admin_get_member_lub_role_assignments` (25 cols, search also includes alternate mobile snapshot), `admin_get_member_lub_role_assignments_with_session` (delegates), `get_public_leadership_assignments` (22 cols).
- **Hotfix `20260521000000_fix_assign_member_lub_role_is_deleted_093x.sql`:** The 093 migration had a latent bug — `admin_assign_member_lub_role` body referenced `member_registrations.is_deleted` (doesn't exist; table uses `is_active`). This caused every `Add Assignment` attempt to fail with `column "is_deleted" does not exist`. Fixed: `WHERE id = p_member_id AND (is_active IS NULL OR is_active = true)`. Also re-GRANTs and `NOTIFY pgrst`.
- **Toast fix `src/components/Toast.tsx`:** `z-50` raised to `z-[9999]` — modal backdrops also use z-50 and are rendered later in DOM; previously the modal sat on top of the toast, making all error/success toasts invisible while a modal was open.
- `src/lib/supabase.ts`: added `alternate_mobile` to `MemberRoleCandidate`; added `alternate_contact_mobile_snapshot`/`alternate_contact_photo_url_snapshot` to `MemberLubRoleAssignment` + `MemberLubRoleAssignmentRpcRow`; updated `getAllAssignments` mapping; updated `createAssignment` params + RPC call with `p_alternate_mobile`/`p_alternate_photo_url`; `searchMemberCandidates` now fetches `alternate_mobile` and includes it on alternate candidate rows.
- `AdminDesignationsManagement.tsx`: `assignmentForm` gains `alternate_photo_url`; alternate section shows read-only mobile (from selectedCandidate) + optional editable photo URL input; `handleAddAssignment` passes `alternate_mobile` from selectedCandidate and `alternate_photo_url` from form; `resetAssignmentForm` + clear button both reset `alternate_photo_url`; assignments table shows `alternate_contact_mobile_snapshot` (or '—') for alternate rows.
- `Leadership.tsx`: added both new snapshot fields to `LeadershipAssignment` + `GroupedRole.members`; `groupAssignmentsByRole` passes both; card rendering: alternate → `photoUrl = alternate_contact_photo_url_snapshot || null`; `mobileNumber = alternate_contact_mobile_snapshot` (never main member mobile for alternate); mobile link hidden when `mobileNumber` is null/empty.

### 092 Alternate contact role assignment in Admin Designations

- Runtime-closed on 2026-05-20.
- Migration `20260520120000_member_lub_role_assignments_assignee_kind_092.sql`: adds `assignee_kind` (NOT NULL DEFAULT 'main' CHECK ('main'|'alternate')) and `alternate_contact_name_snapshot` to `member_lub_role_assignments`. Replaces old unique constraint with `member_lub_role_assignments_unique_per_kind` index (includes `assignee_kind` so main+alternate can coexist). Recreates 5 RPCs: `admin_assign_member_lub_role` (11 args, new p_assignee_kind/p_alternate_contact_name, per-kind duplicate check), `admin_assign_member_lub_role_with_session` (pass-through), `admin_get_member_lub_role_assignments` (new columns in RETURNS TABLE/SELECT, search includes snapshot), `admin_get_member_lub_role_assignments_with_session` (delegates to updated base), `get_public_leadership_assignments` (new columns).
- `src/lib/supabase.ts`: added `MemberRoleCandidate` export; updated `MemberLubRoleAssignment` + `MemberLubRoleAssignmentRpcRow` with new fields; updated `getAllAssignments` mapping; updated `createAssignment` to pass `p_assignee_kind`/`p_alternate_contact_name`; added `searchMemberCandidates` (searches alternate_contact_name, expands to main+alternate candidate rows).
- `AdminDesignationsManagement.tsx`: search calls `searchMemberCandidates`; dropdown shows kind badges + secondary_text; selected card shows kind badge + alternate advisory; form tracks `assignee_kind`/`alternate_contact_name`; assignments table shows alternate name for alternate rows with "for [main]" subtitle.
- `Leadership.tsx`: alternate assignments use `alternate_contact_name_snapshot` as display name, `photoUrl=null` (never shows main member's photo for alternate), no gender prefix.

### 091 Admin Member Registrations smart search — all fields + AND-token matching

- Runtime-closed on 2026-05-20.
- Migration `20260520110000_member_registrations_smart_search_091.sql`: replaces 4-field OR-search in `get_admin_member_registrations` with `concat_ws` blob across 18 fields + AND-token matching via `unnest(string_to_array(…,' '))` + `bool_and(LIKE)`. Session wrapper unchanged (delegates automatically).
- `AdminRegistrations.tsx`: extends `MemberRegistration` interface with `company_address`, `city`, `brand_names`, `gst_number`, `pan_company`, `pin_code`, `alternate_contact_name`, `alternate_mobile`, `website`; replaces 4-field client-side filter with AND-token blob across 19 fields; adds 300 ms debounce via `useRef`; updates placeholder text.
- Bug fixed: searching "Kanakadurga" (company name) now returns results (was returning 0).

### 090 Activity AI excerpt/description distinct lead enforcement

- Runtime-closed on 2026-05-20.
- No migration. No service contract change. No frontend changes.
- `draft-activity-content` gains:
  - `isNearDuplicateLead` — lead-specific duplicate check (lower thresholds + Jaccard bag similarity at 0.62 to catch rephrased duplicates)
  - `stripRepeatedLeadFromDescription` — removes repeated first sentence(s) from description's opening paragraph, preserving the AI-generated excerpt
  - `enforceExcerptDescriptionDistinctness` — orchestrates: (1) strip from description first; (2) replace excerpt if description too short; (3) global sentence safety net; (4) guaranteed final assertion
  - Prompt rule added: "The opening sentence of excerpt and description must be different."

### 089 Short URL enable/disable toggle + permanence enforcement (Activities + Events)

- Runtime-closed on 2026-05-20. All migrations applied, all probes PASS.
- Migration `20260520100000_short_url_enable_disable_089.sql`: adds `short_url_enabled` to both tables; updates resolver RPCs to check flag; neuters refresh RPCs; adds `set_*_short_url_enabled_with_session` toggle RPCs; updates `get_activity_by_id_with_session` + `get_activity_by_slug` to include `short_url_enabled`; updates `get_event_by_id_with_session` to include both `short_url_code` and `short_url_enabled`.
- AdminActivityForm + AdminEventForm: Refresh button replaced with `role="switch"` Enable/Disable toggle; first-load code display fixed by hydrating directly from getById payload and skipping redundant ensure call; `shortActivityUrl`/`shortEventUrl` memos respect enabled flag.
- ActivityDetail: Share button respects `short_url_enabled` when choosing URL.
- No edge function changes in 089.

### 088 Activity short share URL + admin share panel + public Share button

- Runtime-closed on 2026-05-20. Migration applied, edge function deployed.
- Migration `20260520090000_activities_short_share_url_088.sql` adds `short_url_code`/`share_message` columns to `activities`, auto-generator trigger, backfill, `resolve_activity_short_url`, `ensure_activity_short_url_with_session`, `refresh_activity_short_url_with_session`, `save_activity_share_message_with_session` RPCs; updates `get_activity_by_slug` and `get_activity_by_id_with_session`.
- `/a/:code` route → `ActivityShortRedirect` → `resolveShortUrl` → redirect to `/events/:slug`. Wired in `App.tsx`.
- `draft-activity-content` edge function gains `draft_share` mode returning `{ share_message }` JSON.
- `AdminActivityForm`: share panel (published only) with Public URL, Short URL, AI Generate Message, Copy Message, WhatsApp Share controls (refresh removed in 089).
- `ActivityDetail`: Share button in metadata bar copies short message + short URL to clipboard (2.5 s "Copied!" feedback).

### 085 Auto-classify past/upcoming events + Activities-first layout + View Past Events link

- Closed in repo on 2026-05-20 (Claude).
- `isPast` helper replaced with `toMs`/`isPastEvent`/`isPastActivity`/`isPastItem` using `end_date_value` boundary in `Events.tsx`.
- Activities section moves to top when no upcoming events exist; "View Past Events" pill-link shown below Activities in `all`+no-search mode.
- No DB migration or RPC changes.

### 084 Activities AI date/location hotfix

- Closed in repo on 2026-05-19.
- `draft-activity-content` draft mode now returns `activity_date`, `start_at`, `end_at`, and `location` in addition to title/slug/excerpt/description.
- Added deterministic fallback parsing for common English date patterns such as `16 and 17 May 2026`, `16-17 May 2026`, and single-day dates; default time remains 10:00-17:00 when no time is present.
- Added venue/location fallback for lines like `Venue:` / `Location:` and common `held at ...` phrasing.
- Admin Activity form now applies returned date/location fields into `Start date & time`, `End date & time`, and `Location`.
- No DB migration. `supabase functions deploy draft-activity-content` is needed to activate this on the hosted Supabase edge function.

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

