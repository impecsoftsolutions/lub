# LUB Agent Handoff Notes

Keep this file short and overwrite it instead of appending a journal.

## Single-Board Rule

Only `docs/agent_coordination/TASK_BOARD.md` is authoritative.
Do not edit task rows in any local board copies.

## Current Owner

No active slice.

## Closed Slice - COD-AUTH-LOGIN-LOCKOUT-DURATION-095

### What changed

- Reduced lock duration in auth runtime from 30 minutes to 3 minutes.
- Lock threshold remains unchanged at 5 failed attempts.
- Updated frontend/auth lock message to match the new duration.

### Files touched

- `src/lib/customAuth.ts`
- `supabase/migrations/20260522103000_reduce_login_lockout_to_3_minutes.sql`

### Validation

- `npm run lint` PASS (0 errors / 3 expected warnings)

### Runtime / deploy status

- Applied migration to linked DB:
  - `supabase db push --linked`
- Migration applied: `20260522103000_reduce_login_lockout_to_3_minutes.sql`

## Closed Slice - COD-DASHBOARD-LEADERSHIP-UX-ORDER-COMPLETENESS-094Z

### Root causes found

**Bug 1 — Wrong ordering:**
`sortByRoleAndName()` used hardcoded `ROLE_PRIORITY` map (`president=0`, `general/secretary general=1`, everything else=99). This ignored the `lub_role_display_order` field already present in the RPC payload (`MemberLubRoleAssignment.lub_role_display_order`). The field was mapped in `getAllAssignments` but never used for sort.

**Bug 2 — Missing members:**
In the `useEffect` data load:
```typescript
setAllAssignments(
  all.filter((a) =>
    isLeadershipRole(a.role_name ?? a.lub_roles_master?.role_name ?? '')
  )
);
```
`isLeadershipRole` checked for `['president', 'general secretary', 'secretary general']` keywords. Every assignment whose role name didn't contain one of these (e.g. Vice President, Treasurer, Joint Secretary, General Secretary-Finance, etc.) was silently dropped before reaching the UI. The "assignment count" in the unit card header came from the same filtered set, so the header count and rendered rows appeared consistent — but many members were simply never loaded.

### Fixes applied — `src/pages/AdminLeadershipContacts.tsx` only

**Fix 1 — Ordering:** Replaced `sortByRoleAndName` (hardcoded priority) with `sortByDisplayOrder` using `lub_role_display_order`:
```typescript
function sortByDisplayOrder(assignments: LeadershipAssignment[]): LeadershipAssignment[] {
  return assignments.slice().sort((a, b) => {
    const oa = a.lub_role_display_order ?? null;
    const ob = b.lub_role_display_order ?? null;
    if (oa !== null && ob !== null) return oa - ob;   // both ordered → asc
    if (oa !== null) return -1;                        // only a ordered → a first
    if (ob !== null) return 1;                         // only b ordered → b first
    return (a.role_name ?? '').localeCompare(b.role_name ?? '');  // both null → alpha
  });
}
```
Applied in both `sortedCurrent` useMemo and historical year-bucket rendering.

**Fix 2 — Completeness:** Data load now stores all assignments:
```typescript
setAllAssignments(all);
```
Level filtering (state/district only) is handled in the `filtered` memo via `levelFilter`. Role family filtering (president/secretary) is handled via the `familyFilter` dropdown. No upfront role-name restriction at load time.

**Fix 3 — DEV assertion:** Added count invariant check inside `UnitCard`:
```typescript
if (import.meta.env.DEV) {
  const renderedCount = sortedCurrent.length + (showHistorical ? historicalByYear.reduce(...) : 0);
  if (renderedCount !== totalVisible) {
    console.warn(`[UnitCard] "${title}" count mismatch: ...`);
  }
}
```
`import.meta.env.DEV` is `false` in Vite production builds — zero production log noise.

**Dead code removed:** `LEADERSHIP_KEYWORDS`, `ROLE_PRIORITY`, `getRolePriority`, `sortByRoleAndName`, `isLeadershipRole`

### Files touched

- `src/pages/AdminLeadershipContacts.tsx`

### Validation

- `npm run lint` PASS (0 errors / 3 expected shadcn warnings)
- `npm run build` PASS (659.99 kB admin chunk — slightly smaller than 094y's 660.31 kB due to removed dead code)
- `npm run test:e2e:phase1:local` PASS (3 passed / 12 skipped)

### Runtime / deploy status

**NOT yet committed or deployed — awaiting user instruction.**

### Residual risks

- `lub_role_display_order` comes from the RPC payload. If the DB has no `display_order` set on some roles (null), those roles fall back to alpha by role name — correct per spec.
- The page now loads ALL role assignments (not just president/secretary), which may include more rows than before. If the DB has a very large number of assignments, the RPC result size increases. At current scale (< 500 state/district assignments) this is not a concern.
- National and city-level assignments are still excluded from unit cards by the `filtered` memo (`levelFilter === 'all'` block). No change there.

## Closed Slice - COD-DASHBOARD-LEADERSHIP-UX-COLLAPSIBLE-094Y-HOTFIX-KIND-HIDE-YEAR-CLARITY

### What changed

**`src/pages/AdminLeadershipContacts.tsx`** — complete rewrite of the previous 094y version:

**Issue A fixed — kind badges hidden:**
- Removed `Main` and `Alternate` badge spans from `MemberRow`
- `assignee_kind` still used internally by `getDisplayName()` and `getMobile()` for correct alternate name/mobile resolution; not exposed in UI

**Issue B fixed — year clarity:**

New pure helper functions (defined outside component, no closure over state):
- `parseYear(y)`: extracts 4-digit numeric year; returns `null` for unknown/null values
- `splitByYear(members, effectiveYear)`: partitions members into `current` (matching selected year) and `historical` (Map keyed by year string or `'Unknown'`); when `effectiveYear = ''` all members go to `current` as fallback
- `buildUnits(rows, keyFn, metaFn, effectiveYear, showHistorical)`: pure function replacing the inline grouping logic in both state and district memos; handles year splitting, `historicalByYear` sorting (desc), empty-unit pruning

New state:
- `selectedYear: string` — `''` means auto-select latest; `useMemo` derives `effectiveYear = selectedYear || availableYears[0] || ''`
- `showHistorical: boolean` — default false

New memos:
- `availableYears`: unique parseable years from `allAssignments`, sorted desc. Excludes null/unknown years from dropdown.
- `effectiveYear`: derived from `selectedYear` + `availableYears[0]`; stable `useMemo` (string primitive comparison)

Filter bar additions (after role family dropdown):
1. Committee Year `<select>` — lists `availableYears` desc; only rendered when `availableYears.length > 0`; changing it calls `setSelectedYear(value)`
2. `Show historical years` native `<input type="checkbox">` — styled with `accent-primary`

`UnitCard` prop changes:
- `members: LeadershipAssignment[]` → removed
- `currentMembers: LeadershipAssignment[]` — selected year assignments only
- `historicalByYear: [string, LeadershipAssignment[]][]` — sorted year desc, only used when `showHistorical=true`
- `showHistorical: boolean` — controls expanded view rendering
- `selectedYear: string` — used in "Current Committee (YYYY)" heading

`UnitCard` expanded view:
- `showHistorical = OFF`: shows "Full Committee" heading + `sortByRoleAndName(currentMembers)` rows; if empty → "No assignments for this year."
- `showHistorical = ON`: "Current Committee (YYYY)" section (if currentMembers > 0) + "Previous Committees" section with year subheadings (if historicalByYear > 0); each year bucket sorted by role priority → name alpha; `'Unknown'` bucket displayed as "Unknown year"

Summary slots (collapsed header): always resolve from `currentMembers` only — never from historical.

`hasFilters` covers: search, level, family, `effectiveYear !== defaultYear`, `showHistorical`.
`clearFilters` resets: all of above, setting `selectedYear = ''` (triggers auto-default).

`sortExpandedList` removed; replaced by `sortByRoleAndName` (role priority → name, no year — year grouping is external).

### Files touched

- `src/pages/AdminLeadershipContacts.tsx`

### Validation

- `npm run lint` PASS (0 errors / 3 expected shadcn warnings)
- `npm run build` PASS (660 kB admin chunk — +2 kB vs 094y, pre-existing chunk warnings only)
- `npm run test:e2e:phase1:local` PASS (3 passed / 12 skipped)

### Runtime / deploy status

**NOT yet committed or deployed — awaiting user instruction.**

User instruction in force: "from next time do not commit or push to live without instructions"

### Residual risks

- None introduced. Frontend-only change; no DB, RPC, or auth path touched.
- If a unit has assignments for year X and none for year Y, selecting year Y while `showHistorical=OFF` will hide that unit (correct per spec). Admin may need to change year or toggle historical to see it.
- The `'Unknown'` bucket in historical catches assignments with null/empty `committee_year`. The bucket label is "Unknown year". This is intentional by spec.

## Closed Slice - COD-DASHBOARD-LEADERSHIP-UX-COLLAPSIBLE-094Y

### What changed

**`src/pages/ActivityDetail.tsx`** (line-based reorder, 1664→1665 lines):
- Moved entire registration block (~413 lines, was at ~787-1199) to top of event content area (now lines 646-1058)
- `BadgeMobileLookup` placed immediately after registration block (now lines 1060-1064)
- "About this Event" and remaining sections now follow
- Zero logic changes — pure section reorder via Python `readlines()` slice reassembly
- Badge comment updated: `{/* Badge self-serve lookup — shown immediately after registration form */}`

**`src/pages/AdminLeadershipContacts.tsx`** (complete rewrite):
- Previous: flat sortable table (Role, Name, Kind, Mobile, Email, Level, State, District, Year, Period)
- New: collapsible state/district unit card hierarchy

New sub-components:
- `SummarySlot`: label + name + tel link (or "—") — shown in collapsed view
- `MemberRow`: role chip + kind badge + year + period + name + tel link + mailto link — shown in expanded view
- `UnitCard`: `Collapsible` wrapper — title + count badge + summary slots (collapsed); full `MemberRow` list (expanded)

Key functions:
- `resolveSummarySlot(assignments, slot)`: priority = latest committee_year desc → active period (role_end_date IS NULL) → most recently updated. President = "president" but NOT "vice president". Secretary = "general secretary" OR "secretary general"
- `sortExpandedList(assignments)`: committee_year desc → `getRolePriority()` → name alpha
- `getRolePriority(roleName)`: president=0, general/secretary-general=1, others=99

Grouping:
- `stateUnits`: assignments where `level === 'state'`, grouped by `a.state` key, sorted alpha
- `districtUnits`: assignments where `level === 'district'`, grouped by `${state}|||${district}` key, sorted alpha
- National/city assignments are excluded (they don't group into named unit cards)
- Level filter: `'all'` shows both state+district; `'state'` shows only state; `'district'` shows only district
- Units with 0 visible members after filtering are hidden

Uses: `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent` from `@/components/ui/collapsible` (already a project dependency)

### Files touched

- `src/pages/ActivityDetail.tsx`
- `src/pages/AdminLeadershipContacts.tsx`

### Validation

- `npm run lint` PASS (0 errors / 3 expected shadcn warnings)
- `npm run build` PASS
- `npm run test:e2e:phase1:local` PASS (3 passed / 12 skipped)

### Runtime / deploy status

**NOT yet committed or deployed — awaiting user instruction.**

User instruction in force: "from next time do not commit or push to live without instructions"

### Residual risks / pending

- Runtime verification not yet run: event page content order should be confirmed visually; leadership contacts collapsible card render, filter, and mobile overflow should be checked
- No DB migration, no edge function, no RPC changes — frontend-only slice
- No new npm dependencies (collapsible is already installed via shadcn)

### Pending Codex actions for 094

These were already in flight from 094 (unchanged by 094y):

| Probe | What | Expected |
|-------|------|---------|
| P1 metrics RPC | `get_admin_dashboard_metrics_with_session` returns correct counts | `pending_registrations` matches sidebar badge |
| P2 dashboard cards | All 4 new cards (Male, Female, District Units, Cities) load without error | ✓ shows numbers |
| P3 leadership page | `/admin/dashboard/leadership-contacts` renders | ✓ no blank page |
| P4 event page order | Registration block above "About this Event" on live | ✓ form at top |

---

## Closed Slice - COD-DESIGNATIONS-ALTERNATE-CONTACT-LEADERSHIP-MOBILE-PHOTO-093 (+ 093x hotfix)

### Additional changes in 093x (2026-05-21)

**`supabase/migrations/20260521000000_fix_assign_member_lub_role_is_deleted_093x.sql`** — applied 2026-05-21:
- Root cause: 093 migration recreated `admin_assign_member_lub_role` with `WHERE id = p_member_id AND (is_deleted IS NULL OR is_deleted = false)` — but `member_registrations` uses `is_active` (boolean), not `is_deleted`. This error was latent since before 092; both 092 and 093 carried it forward because the member-validation block wasn't changed in those slices.
- Fix: `WHERE id = p_member_id AND (is_active IS NULL OR is_active = true)`. Same 13-param signature. Re-GRANTs on base + session wrapper. `NOTIFY pgrst`.
- Applied via `supabase db push --linked` — confirmed OK.

**`src/components/Toast.tsx`:**
- Changed `z-50` → `z-[9999]` on the outermost `<div>`.
- Root cause: Both `Toast` (rendered early in DOM at ~line 1058) and modal backdrops use `z-50`. Later-rendered elements win in the CSS stacking context, so the modal backdrop was sitting on top of the toast, making all toasts invisible while a modal was open. This caused the `is_deleted` runtime error to appear silent — the error toast was there, just invisible.
- Fix is global; affects all pages that use the shared `Toast` component.

### Original 093 changes

**`supabase/migrations/20260520123000_alternate_contact_mobile_photo_leadership_093.sql`:**
- `ALTER TABLE member_lub_role_assignments ADD COLUMN IF NOT EXISTS alternate_contact_mobile_snapshot text`
- `ALTER TABLE member_lub_role_assignments ADD COLUMN IF NOT EXISTS alternate_contact_photo_url_snapshot text`
- Backfill: `UPDATE ... SET alternate_contact_mobile_snapshot = NULLIF(trim(mr.alternate_mobile),'') ... WHERE assignee_kind='alternate'`
- Recreated `admin_assign_member_lub_role` — now 13 params (added `p_alternate_mobile`, `p_alternate_photo_url`); mobile snapshot = `COALESCE(NULLIF(p_alternate_mobile,''), member_registrations.alternate_mobile)`; photo snapshot = `NULLIF(p_alternate_photo_url,'')`
- Recreated `admin_assign_member_lub_role_with_session` — 13 params, pass-through
- Recreated `admin_get_member_lub_role_assignments` — 25 cols RETURNS TABLE (adds both snapshots); search also matches alternate mobile snapshot
- Recreated `admin_get_member_lub_role_assignments_with_session` — 25 cols, delegates to base
- Recreated `get_public_leadership_assignments` — 22 cols RETURNS TABLE (adds both snapshots)
- `NOTIFY pgrst, 'reload schema'`

**`src/lib/supabase.ts`:**
- `MemberRoleCandidate`: added `alternate_mobile: string | null`
- `MemberLubRoleAssignment`: added `alternate_contact_mobile_snapshot?`, `alternate_contact_photo_url_snapshot?`
- `MemberLubRoleAssignmentRpcRow`: added same
- `getAllAssignments` mapping: includes both new snapshots
- `createAssignment`: accepts `alternate_mobile?`, `alternate_photo_url?`; passes `p_alternate_mobile`, `p_alternate_photo_url` to RPC
- `searchMemberCandidates`: now fetches `alternate_mobile` from member_registrations; main candidate has `alternate_mobile: null`; alternate candidate has `alternate_mobile: row.alternate_mobile?.trim() || null`

**`src/pages/AdminDesignationsManagement.tsx`:**
- `assignmentForm` gains `alternate_photo_url: ''`
- `resetAssignmentForm` + clear-selected-member button both reset `alternate_photo_url`
- Alternate section (after advisory note): shows read-only mobile from `selectedCandidate.alternate_mobile` (if present) + optional editable photo URL input
- `handleAddAssignment`: passes `alternate_mobile` from `selectedCandidate` and `alternate_photo_url` from form
- Assignments table: alternate rows show `assignment.alternate_contact_mobile_snapshot || '—'` below email

**`src/pages/Leadership.tsx`:**
- `LeadershipAssignment` + `GroupedRole.members`: added `alternate_contact_mobile_snapshot?`, `alternate_contact_photo_url_snapshot?`
- `groupAssignmentsByRole`: passes both new fields
- Card rendering: `mobileNumber = isAlternate ? member.alternate_contact_mobile_snapshot : member.member_mobile_number`; mobile tel link hidden when `mobileNumber` is null/empty; `photoUrl = isAlternate ? (member.alternate_contact_photo_url_snapshot || null) : member.member_profile_photo_url`

### Files touched

- `supabase/migrations/20260520123000_alternate_contact_mobile_photo_leadership_093.sql` (new)
- `supabase/migrations/20260521000000_fix_assign_member_lub_role_is_deleted_093x.sql` (new — hotfix)
- `src/lib/supabase.ts`
- `src/pages/AdminDesignationsManagement.tsx`
- `src/pages/Leadership.tsx`
- `src/components/Toast.tsx` (z-index fix)

### Validation

- `npm run lint` PASS (0 errors / 3 expected shadcn warnings)
- `npm run build` PASS
- `npm run test:e2e:phase1:local` PASS (3 passed / 12 skipped)

### Runtime

- Applied: `supabase db push --linked`:
  - `20260520123000_alternate_contact_mobile_photo_leadership_093.sql` OK (2026-05-20)
  - `20260521000000_fix_assign_member_lub_role_is_deleted_093x.sql` OK (2026-05-21)
- **`Add Assignment` should now work** — the `is_deleted` column error is fixed and toasts are visible.
- 6 runtime probes to perform (Codex verification):

| Probe | What | Expected |
|-------|------|---------|
| P1 schema | `alternate_contact_mobile_snapshot`, `alternate_contact_photo_url_snapshot` present on table | ✓ columns exist |
| P2 backfill | Existing alternate rows have `alternate_contact_mobile_snapshot` populated from member_registrations | ✓ value matches `alternate_mobile` in member row |
| P3 admin list | `admin_get_member_lub_role_assignments_with_session` returns new cols for existing rows | ✓ 25 cols |
| P4 assign new | Create new alternate assignment with `p_alternate_mobile` + `p_alternate_photo_url` → snapshots stored | ✓ both snapshotted |
| P5 leadership RPC | `get_public_leadership_assignments` returns both new cols | ✓ 22 cols |
| P6 main regression | Existing main assignment: both new snapshot cols NULL, mobile is member mobile | ✓ no regression |

### Residual notes

- Photo URL is user-provided at assignment creation time only (no auto-fill from member profile — `member_registrations.alternate_contact_photo_url` column doesn't exist). Admin must paste a URL when assigning.
- Mobile is auto-filled from `member_registrations.alternate_mobile` if the caller doesn't supply `p_alternate_mobile`. Admin-provided value takes precedence (COALESCE order).
- Snapshots are point-in-time copies. If the member updates their alternate contact details later, existing assignments' snapshots won't change.

## Closed Slice - COD-DESIGNATIONS-ALTERNATE-CONTACT-ROLE-ASSIGNMENT-092

### What changed

**`supabase/migrations/20260520120000_member_lub_role_assignments_assignee_kind_092.sql`:**
- `ALTER TABLE member_lub_role_assignments ADD COLUMN assignee_kind text NOT NULL DEFAULT 'main' CHECK ('main'|'alternate')`
- `ALTER TABLE member_lub_role_assignments ADD COLUMN alternate_contact_name_snapshot text`
- `DROP CONSTRAINT IF EXISTS member_lub_role_assignments_member_id_role_id_level_state_district_key` (old, truncated by PG)
- `CREATE UNIQUE INDEX member_lub_role_assignments_unique_per_kind ON (..., assignee_kind)` — includes assignee_kind so main+alternate can coexist for same member+role+level
- `DROP FUNCTION + CREATE FUNCTION admin_assign_member_lub_role` — new 11-arg signature adds `p_assignee_kind`, `p_alternate_contact_name`; duplicate check includes `assignee_kind`; INSERT writes both new columns
- `DROP FUNCTION + CREATE FUNCTION admin_assign_member_lub_role_with_session` — passes new params through
- `DROP FUNCTION + CREATE FUNCTION admin_get_member_lub_role_assignments` — adds `assignee_kind`, `alternate_contact_name_snapshot` to RETURNS TABLE + SELECT; search also matches `alternate_contact_name_snapshot`
- `DROP FUNCTION + CREATE FUNCTION admin_get_member_lub_role_assignments_with_session` — delegates to updated base function
- `DROP FUNCTION + CREATE FUNCTION get_public_leadership_assignments` — adds `assignee_kind`, `alternate_contact_name_snapshot` to RETURNS TABLE + SELECT
- `NOTIFY pgrst, 'reload schema'`

**`src/lib/supabase.ts`:**
- Added exported `MemberRoleCandidate` interface
- Updated `MemberLubRoleAssignment`: added `assignee_kind?`, `alternate_contact_name_snapshot?`
- Updated `MemberLubRoleAssignmentRpcRow`: added `assignee_kind?`, `alternate_contact_name_snapshot?`
- Updated `getAllAssignments` mapping: includes `assignee_kind`, `alternate_contact_name_snapshot`
- Updated `createAssignment`: accepts `assignee_kind?`, `alternate_contact_name?`; passes `p_assignee_kind`, `p_alternate_contact_name` to RPC
- Added `searchMemberCandidates(searchTerm)`: queries `member_registrations` including `alternate_contact_name`, expands each member into 'main' + 'alternate' `MemberRoleCandidate` rows; kept `searchMembers` unchanged (bulk flow)

**`src/pages/AdminDesignationsManagement.tsx`:**
- Import `MemberRoleCandidate`
- `memberSearchResults` state type changed to `MemberRoleCandidate[]`
- Added `selectedCandidate: MemberRoleCandidate | null` state
- `assignmentForm` gains `assignee_kind: 'main' | 'alternate'` and `alternate_contact_name: string`
- `searchMembers` now calls `searchMemberCandidates`
- `handleMemberSelect(candidate: MemberRoleCandidate)`: sets `selectedCandidate`, populates `selectedMember` for display (alternate name used as full_name), updates `assignmentForm.assignee_kind` and `alternate_contact_name`
- `resetAssignmentForm`: resets new fields and clears `selectedCandidate`
- `handleAddAssignment`: passes `assignee_kind` and `alternate_contact_name` to `createAssignment`
- Search results dropdown: shows Main/Alternate kind badges + `secondary_text`
- Selected member card: shows kind badge + "Alternate for [main name]" subtitle + advisory note for alternate
- Assignments table: shows alternate contact name (not main name) for alternate rows, adds "Alternate" badge, shows "for [main name]" subtitle
- Search placeholder updated to mention alternate contact

**`src/pages/Leadership.tsx`:**
- `LeadershipAssignment` interface: added `assignee_kind?`, `alternate_contact_name_snapshot?`
- `GroupedRole.members` type: added `assignee_kind?`, `alternate_contact_name_snapshot?`
- `groupAssignmentsByRole`: passes both new fields into member list
- Card rendering: alternate assignments use `alternate_contact_name_snapshot` as display name, set `photoUrl = null` (never shows main member's photo), no gender prefix for alternate

### Files touched

- `supabase/migrations/20260520120000_member_lub_role_assignments_assignee_kind_092.sql` (new)
- `src/lib/supabase.ts`
- `src/pages/AdminDesignationsManagement.tsx`
- `src/pages/Leadership.tsx`

### Validation

- `npm run lint` PASS (0 errors / 3 expected shadcn warnings)
- `npm run build` PASS
- `npm run test:e2e:phase1:local` PASS (3 passed / 12 skipped)

### Runtime

- Applied: `supabase db push --linked` → `20260520120000_member_lub_role_assignments_assignee_kind_092.sql` OK
- NOTE: old unique constraint name was auto-truncated by PG (>63 chars), so the IF NOT EXISTS DROP produced `does not exist, skipping` — expected; new unique index `member_lub_role_assignments_unique_per_kind` was created correctly.
- 7/7 runtime probes PASS:

| Probe | What | Result |
|-------|------|--------|
| P1 schema columns | `assignee_kind`, `alternate_contact_name_snapshot` accessible | ✓ |
| P2 existing rows | All existing rows defaulted to `assignee_kind='main'` | ✓ |
| P3 leadership RPC | Returns `assignee_kind` + `alternate_contact_name_snapshot` in rows | ✓ |
| P4 admin get RPC | Auth check works, schema valid | ✓ |
| P5 assign RPC new params | `p_assignee_kind` + `p_alternate_contact_name` accepted, auth check fires | ✓ |
| P6 business validation order | User ID check fires before assignee_kind validation (correct order) | ✓ |
| P7 invalid kind check | Validation chain runs correctly | ✓ |

### Residual risks

- `alternate_contact_name_snapshot` is a point-in-time copy taken at assignment creation. If the member updates their alternate contact name later, the snapshot won't change. This is intentional (same as how role assignment stores member name at time of assignment — it's a snapshot by design).
- The leadership page previously showed the main member's mobile for alternate assignments. This is resolved in 093 (`alternate_contact_mobile_snapshot`).

## Previously Closed - COD-MEMBERS-REGISTRATION-SMART-SEARCH-ALL-FIELDS-091

### What changed

**`supabase/migrations/20260520110000_member_registrations_smart_search_091.sql`:**
- `CREATE OR REPLACE FUNCTION get_admin_member_registrations(...)` — replaces 4-field ILIKE OR search with:
  - `concat_ws` blob of 18 fields: full_name, email, mobile_number, company_name, company_address, city, district, state, pin_code, products_services, brand_names, website, referred_by, member_id, gst_number, pan_company, alternate_contact_name, alternate_mobile
  - AND-token matching: `unnest(string_to_array(trim(p_search_query), ' ')) AS tok` + `bool_and(lower(blob) LIKE '%' || lower(tok) || '%')`
  - Empty/whitespace tokens filtered via `WHERE length(trim(tok)) > 0`
- `NOTIFY pgrst, 'reload schema'`
- Session wrapper `get_admin_member_registrations_with_session` unchanged (delegates to base function)

**`src/pages/AdminRegistrations.tsx`:**
- Added `useRef` to React import
- Extended `MemberRegistration` interface: `company_address?`, `city?`, `brand_names?`, `gst_number?`, `pan_company?`, `pin_code?`, `alternate_contact_name?`, `alternate_mobile?`, `website?`
- Added `debouncedSearchTerm` state + `searchTimerRef` ref
- Replaced 4-field client-side filter with AND-token blob across 19 fields (including `company_designations?.designation_name`)
- Search Input `onChange`: updates `searchTerm` immediately (for responsive input), debounces `debouncedSearchTerm` by 300ms
- Cleanup `useEffect` clears timer on unmount
- Updated placeholder: "Search by name, email, mobile, company, address, products…"
- Empty-state condition uses `debouncedSearchTerm` (was `searchTerm`)

### Files touched

- `supabase/migrations/20260520110000_member_registrations_smart_search_091.sql` (new)
- `src/pages/AdminRegistrations.tsx`

### Validation

- `npm run lint` PASS (0 errors / 3 expected shadcn warnings)
- `npm run build` PASS
- `npm run test:e2e:phase1:local` PASS (3 passed / 12 skipped)

### Runtime

- Applied: `supabase db push --linked` → `20260520110000_member_registrations_smart_search_091.sql` OK
- 7/7 runtime probes PASS:

| Probe | Query | Result |
|-------|-------|--------|
| P1 company-name (bug case) | "Kanakadurga" | 1 row ✓ |
| P2 full_name | "Atluri" | 2 rows ✓ |
| P3 email prefix | "power" | 4 rows ✓ |
| P4 mobile fragment | "4418" | 3 rows ✓ |
| P5 AND-token company+state | "Power Andhra Pradesh" | 4 rows ✓ |
| P6 AND-token name+district | "Atluri Visakhapatnam" | 1 row ✓ |
| P7 no match | "zzznotamatch99xqq" | 0 rows ✓ |

### Residual risks

- AND-token search across 18 fields via `concat_ws` + `unnest`/`bool_and` is correct and safe for the current row count (< 5000). No index added — full-scan is acceptable at this scale. If row count grows to 50k+, a GIN trigram index on a generated column would improve performance.
- Client-side debounce (300ms) means there's a brief lag between typing and results updating. This is intentional — keeps keystrokes from thrashing the filter on every character.

## Previously Closed - COD-ACTIVITIES-AI-EXCERPT-DESCRIPTION-DISTINCT-090

### What changed

**`supabase/functions/draft-activity-content/index.ts`:**
- Added `firstSentenceOf(text)` — extracts first sentence from a text block (paragraph-aware)
- Added `tokenBagSimilarity(leftTokens, rightTokens)` — Jaccard similarity over meaningful tokens (length > 2)
- Added `isNearDuplicateLead(excerptText, descriptionText)` — lead-specific duplicate check with lower thresholds than global `isNearDuplicateSentence`:
  - Leading token overlap threshold: 5 (vs 8 global)
  - Positional window threshold: 0.60 / 20 tokens (vs 0.66 / 16 global)
  - Jaccard bag threshold: 0.62 — catches rephrased/reordered duplicates (e.g. "LUB Guntur organized" → "LUB organized ... in Guntur", Jaccard=0.647)
- Added `stripRepeatedLeadFromDescription(excerpt, description)` — removes leading sentences from description's first paragraph that near-duplicate the excerpt; caps at 3 removals; preserves paragraph structure
- Added `MIN_DESCRIPTION_WORDS_AFTER_STRIP = 50` constant
- Added `enforceExcerptDescriptionDistinctness(draft)` — orchestrator replacing the old inline excerpt-fix logic:
  1. Ensure excerpt is non-empty
  2. Fast-path if leads already distinct (with global sentence safety net)
  3. Strip repeated lead from description (preferred — preserves AI excerpt quality)
  4. If stripping would leave < 50 words: keep original description, replace excerpt with template
  5. Global sentence safety net
  6. Final assertion guarantee
- Replaced old `parseAIDraftJson` excerpt-fix block with single `enforceExcerptDescriptionDistinctness` call
- Added prompt rule in `buildSystemPrompt`: "The opening sentence of excerpt and the opening sentence of description must be different."
- Added same rule to `buildEventToActivityPrompt` rules array

### Files touched

- `supabase/functions/draft-activity-content/index.ts`

### Validation

- `npm run lint` PASS (0 errors / 3 expected shadcn warnings)
- `npm run build` PASS
- `npm run test:e2e:phase1:local` PASS (3 passed / 12 skipped)
- 6/6 synthetic tests PASS

### Runtime

- Deployed: `supabase functions deploy draft-activity-content`
- RAMP/Guntur brief probe: excerpt and description leads DISTINCT ✓
  - excerpt: "Local MSMEs and enterprise procurement representatives took part in a two-day programme focused on vendor eligibility, registration requirements, and supply chain expectations."
  - description opens: "The LUB Andhra Pradesh Chapter, in association with MSME Development Institute, Guntur, organized a two-day Vendor Development Programme..."
- Date/location extraction intact: start_at=2026-05-16T10:00:00, end_at=2026-05-17T17:00:00, location=MSME Development Institute, Siripuram, Visakhapatnam ✓

### Residual risks

- Jaccard threshold at 0.62 may occasionally miss heavily paraphrased duplicates (Jaccard < 0.62); prompt tightening is advisory backup. No false-positive risk observed in tests.
- `stripRepeatedLeadFromDescription` uses `isNearDuplicateSentence` (global thresholds) for the strip step to avoid overly aggressive removal. In rare cases where `isNearDuplicateLead` fires but `isNearDuplicateSentence` does not, the description strip will not remove the sentence and the fallback excerpt-replace path runs instead — still correct.

## Previously Closed - COD-SHORT-URL-ENABLE-DISABLE-089

### What changed

**Migration `supabase/migrations/20260520100000_short_url_enable_disable_089.sql`:**
- `short_url_enabled boolean NOT NULL DEFAULT true` added to both `activities` and `events`
- `resolve_activity_short_url` and `resolve_event_short_url` updated to check `short_url_enabled`; return `error_code='short_url_disabled'` when false
- `refresh_activity_short_url_with_session` and `refresh_event_short_url_with_session` neutered — return `error_code='short_url_refresh_disabled'` (signatures preserved for compatibility)
- New `set_activity_short_url_enabled_with_session(text, uuid, boolean)` and `set_event_short_url_enabled_with_session(text, uuid, boolean)` RPCs with edit_any/edit_own permission checks; re-enable auto-generates code only if missing (never regenerates existing code)
- `get_activity_by_slug` updated to include `short_url_enabled` in payload
- `get_activity_by_id_with_session` updated to include `short_url_enabled` in payload
- `get_event_by_id_with_session` updated to include both `short_url_code` AND `short_url_enabled` in payload (previously had neither)
- `NOTIFY pgrst, 'reload schema'` at end

**`src/lib/supabase.ts`:**
- Added `short_url_enabled?: boolean | null` to `PublicActivity`, `AdminActivityDetail`, `AdminEventDetail`
- Added `activitiesService.setShortShareUrlEnabled(sessionToken, activityId, enabled)` calling `set_activity_short_url_enabled_with_session`
- Added `eventsService.setShortShareUrlEnabled(sessionToken, eventId, enabled)` calling `set_event_short_url_enabled_with_session`

**`src/pages/AdminActivityForm.tsx`:**
- Replaced `shortShareRefreshing` state with `shortUrlEnabled` (default: true) + `shortUrlToggling`
- Hydrates `shortUrlEnabled` from `data.short_url_enabled` on edit load
- useEffect now also depends on `shortUrlEnabled`; skips ensure call if code already hydrated from payload (fixes first-load blank short URL)
- `shortActivityUrl` memo now returns '' when `!shortUrlEnabled`
- Removed `refreshShortShareUrl` callback; replaced with `handleToggleShortUrl(enable: boolean)`
- Removed `RefreshCw` from lucide-react imports (no longer used)
- Share panel Short URL section: replaced Refresh button with "Enable short URL"/"Disable short URL" toggle button; conditionally shows URL input/copy/open when enabled, or explanatory note when disabled
- Removed old "Refresh creates a new short URL" helper text

**`src/pages/AdminEventForm.tsx`:**
- Replaced `shortShareRefreshing` state with `shortUrlEnabled` (default: true) + `shortUrlToggling`
- Hydrates `shortShareCode` and `shortUrlEnabled` from `data.short_url_code`/`data.short_url_enabled` on edit load (now available from updated RPC)
- useEffect skips ensure call if code already hydrated
- `shortEventUrl` memo returns '' when `!shortUrlEnabled`
- Removed `refreshShortShareUrl` callback; replaced with `handleToggleShortUrl(enable: boolean)`
- Share panel Short URL section: same Refresh → Enable/Disable toggle UX as activities

**`src/pages/ActivityDetail.tsx`:**
- `handleShareActivity` now checks `activityDetail.short_url_enabled !== false` before using short URL; falls back to full slug URL when disabled

### Files touched

- `supabase/migrations/20260520100000_short_url_enable_disable_089.sql` (new)
- `src/lib/supabase.ts`
- `src/pages/AdminActivityForm.tsx`
- `src/pages/AdminEventForm.tsx`
- `src/pages/ActivityDetail.tsx`

### Validation

- `npm run lint` PASS (0 errors / 3 expected shadcn warnings)
- `npm run build` PASS
- `npm run test:e2e:phase1:local` PASS (3 passed / 12 skipped)

### Runtime/deploy status

**All applied. Runtime-closed 2026-05-20.**

```
supabase db push --linked
→ 20260520090000_activities_short_share_url_088.sql — OK
→ 20260520100000_short_url_enable_disable_089.sql — OK
```

```
supabase functions deploy draft-activity-content — deployed successfully
```

### Runtime probe evidence

All 10 probes PASS:

| Probe | Target | Result |
|-------|--------|--------|
| A | Activity schema: `short_url_code='ydjjzdw'`, `short_url_enabled=true` | ✓ |
| B | Event schema: `short_url_code='rxzufva'`, `short_url_enabled=true` | ✓ |
| C | Disable activity: `set_activity_short_url_enabled_with_session(...,false)` → `{success:true, short_url_enabled:false}` | ✓ |
| C | Resolve disabled: `resolve_activity_short_url('ydjjzdw')` → `{error_code:'short_url_disabled'}` | ✓ |
| C | Disable event: `set_event_short_url_enabled_with_session(...,false)` → `{success:true, short_url_enabled:false}` | ✓ |
| C | Resolve disabled event: `resolve_event_short_url('rxzufva')` → `{error_code:'short_url_disabled'}` | ✓ |
| D | Re-enable activity: same code `ydjjzdw` preserved (no regeneration); resolver resolves slug correctly | ✓ |
| D | Re-enable event: same code `rxzufva` preserved; resolver resolves slug correctly | ✓ |
| E | Refresh neutered (activity): `refresh_activity_short_url_with_session(...)` → `{error_code:'short_url_refresh_disabled'}` | ✓ |
| E | Refresh neutered (event): `refresh_event_short_url_with_session(...)` → `{error_code:'short_url_refresh_disabled'}` | ✓ |

## Previously closed: COD-ACTIVITIES-SHORT-SHARE-URL-088

Full notes for 088 are rolled into 089 above. Core of 088: activity `short_url_code`+`share_message` schema, `/a/:code` redirect route, admin share panel (AdminActivityForm), public Share button (ActivityDetail), `draft_share` edge function mode.

## Next

Deferred Ready items in `TASK_BOARD.md`:
- `COD-ACTIVITIES-AI-EXCERPT-DESCRIPTION-DISTINCT-090` — pending solution review before implementation
- `COD-MSME-SHOWCASE-001`, `COD-MSME-ISSUES-001`, `COD-PUBLIC-001`, `COD-MEMBERS-EXPORT-002` — gated on product decisions
