# Global Sortable Table Header Contract

**Task:** `COD-GLOBAL-SORTABLE-HEADER-001`
**Agreed:** 2026-08-09
**Collaborators:** Codex + Claude Code CLI (`claude-opus-5`, high effort)

## Shared component

- Add `src/components/ui/sortable-table-header.tsx` exporting `SortableTableHeader`.
- The component renders the semantic `<th scope="col">` and a native `<button type="button">`.
- Inputs: a `ReactNode` label, direction (`asc`, `desc`, or `null`), sort callback, table-header class name, and optional button class name.
- The component exclusively owns:
  - `aria-sort`
  - keyboard/focus-visible treatment
  - pointer-cursor affordance
  - label/icon spacing
  - icon choice, size, and color
- Icons are intentionally compact and cannot be overridden by callers:
  - inactive: `ChevronsUpDown`, 10px, `text-muted-foreground/50`
  - ascending: `ChevronUp`, 10px, `text-foreground`
  - descending: `ChevronDown`, 10px, `text-foreground`

## Application scope

Replace every existing sortable table header while preserving each page's sort state and direction rules:

1. `src/pages/EventPublicReport.tsx`
2. `src/pages/AdminEventRegistrations.tsx`
3. `src/pages/AdminEvents.tsx`
4. `src/pages/AdminReportsPayments.tsx`
5. `src/pages/admin/AdminUsers.tsx`
6. `src/pages/AdminDesignationsManagement.tsx` (LUB Roles table)

Admin Users intentionally changes from a clickable `<th>` to the shared native button, adds the subtle inactive symbol, and moves the symbol beside the label. Existing width and hover-background header classes remain.

Admin Event Registrations gains consistent `aria-sort`. Its non-sortable Badge and Action columns remain plain headers.

LUB Roles keeps its `custom -> asc -> desc -> custom` behavior. Custom order maps to `direction=null` and uses the label `Role Name (Custom)`.

## Explicit exclusions

- Sort dropdowns/selects are not sortable table headers.
- Form-builder move-up/move-down buttons are reordering controls.
- Drag handles/custom row ordering controls are not sorting symbols.

These controls retain their existing icons and behavior.

## Validation

- Public report Playwright verifies sorting behavior and a computed 10px shared sort icon.
- Signed-in browser verification covers Admin Users and the LUB Roles three-state cycle.
- Run lint, production build, and the Phase 1 readonly command; report the existing auth-helper limitation accurately if it prevents admin-route coverage.
- Claude independently reviews the complete integrated diff and reports any remaining contract deviation.
