# LUB Agent Handoff Notes

Keep this file short and overwrite it instead of appending a journal.

## Current Owner

- **No active slice** — CLAUDE-APPEAR-004 third pass (strict linkage) complete

## Current Slice

- `CLAUDE-APPEAR-004` — COMPLETE (all 3 passes) locally (2026-04-04)

Previously completed:
- `CLAUDE-APPEAR-002`, `COD-APPEAR-003`, `COD-JOIN-001`, `CLAUDE-TYPE-001`, `CLAUDE-SHADCN-002`, `COD-SHADCN-001`, `COD-DASH-001`, `CLAUDE-UI-004`, `COD-RUN-001`, `COD-BLD-001`, `COD-PDF-002`, `CLAUDE-UI-003`, `COD-PDF-001`, `COD-ADM-VCARD-001`, `COD-VAL-001`, `COD-HC-001`, `COD-PAY-001` — all complete

---

## What Changed Last — CLAUDE-APPEAR-004 third pass / strict linkage (2026-04-04)

### Goal
Replace all hardcoded color tokens (bg-white, bg-gray-*, text-gray-*, border-gray-*, bg-blue-*, focus:ring-blue-*, divide-gray-*, hover:bg-gray-*) with design-system CSS custom property tokens throughout the authenticated portal UI.

### What was built / changed
Batch token replacements applied across 30+ authenticated portal files:
- All `bg-white` → `bg-card` (surfaces), `bg-background` (page wrappers)
- All `bg-gray-50` / `bg-gray-100` → `bg-muted/50` / `bg-muted` (context-appropriate)
- All `text-gray-*` → `text-foreground` (body/label text) or `text-muted-foreground` (secondary text)
- All `border-gray-*` → `border-border`
- All `focus:ring-blue-500 focus:border-blue-500` → `focus:ring-ring focus:border-ring`
- All `bg-blue-*` buttons/badges/highlights → `bg-primary/10`, `bg-primary`, `text-primary`, `text-primary-foreground`
- All `hover:bg-gray-50` → `hover:bg-muted/30` or `hover:bg-muted/50`
- All `divide-gray-*` → `divide-border`
- All `min-h-screen bg-gray-50` wrappers → removed hardcoded bg

Preserved intentional semantic colors: status badge colors (green=active, red=rejected), avatar palette array, designation level colors (purple/blue/green/orange per level), toggle knob `bg-white rounded-full`, certificate type colors (amber for payment proof).

### Files changed
`src/components/MemberNav.tsx`, `src/components/Header.tsx`, `src/components/Layout.tsx`, `src/components/ExpandedMemberDetails.tsx`, `src/components/NormalizationPreviewModal.tsx`, `src/components/EditMemberModal.tsx`, `src/components/ViewApplicationModal.tsx`, `src/components/dashboard/QuickActionsPanel.tsx`, `src/components/admin/modals/AssignRoleModal.tsx`, `src/components/admin/modals/BlockUserModal.tsx`, `src/pages/AdminDesignationsManagement.tsx`, `src/pages/AdminDashboard.tsx`, `src/pages/AdminDashboardOverview.tsx`, `src/pages/AdminDeletedMembers.tsx`, `src/pages/AdminStateManagement.tsx`, `src/pages/AdminPendingCities.tsx`, `src/pages/AdminProfileSettings.tsx`, `src/pages/AdminLocationManagement.tsx`, `src/pages/AdminRegistrations.tsx`, `src/pages/AdminCityManagement.tsx`, `src/pages/admin/AdminUsers.tsx`, `src/pages/AdminDashboard/PaymentSettings.tsx`, `src/pages/MemberChangePassword.tsx`, `src/pages/MemberDashboard.tsx`, `src/pages/MemberReapply.tsx`, `src/pages/MemberEditProfile.tsx`, `src/pages/AdminDirectoryVisibility.tsx`, `src/pages/AdminFormFieldConfiguration.tsx`, `src/pages/AdminValidationSettings.tsx`, `src/pages/Join.tsx`

### Verification
- `npm run build` → PASS (built in ~9s, 0 errors)
- `npm run lint` → PASS (0 errors, 3 pre-existing warnings in shadcn primitives)

---

## Previous Completed — CLAUDE-APPEAR-002 (2026-04-03)

### Goal
Expand the Appearance settings page into a full design-system control panel, and ensure every admin/dashboard page and component is correctly wired to the design tokens rather than hardcoded styles.

### What was built / changed

#### 1. `src/lib/themeManager.ts`
New functions and constants added:
- **Font family**: `FONT_OPTIONS` (7 fonts incl. Segoe UI Variable, Inter, DM Sans, Outfit, Nunito, Poppins), `getFontFamily` / `setFontFamily` / `applyFontFamily` — sets `--font-body` CSS variable; Google Fonts injected dynamically.
- **Typography roles**: `TYPOGRAPHY_ROLES` (5 roles: Page Title, Section Heading, Body, Table Header, Caption), `TypographySettings`, `DEFAULT_TYPOGRAPHY`, `getTypographySettings` / `setTypographySettings` / `resetTypographySettings` / `applyTypographySettings` — controls `--typ-*-weight` and font-size via `--text-xl`, `--text-sm` etc.
- **Corner radius** (redesigned): `RADIUS_PRESETS` replaces `RADIUS_OPTIONS`; `getRadiusPx` / `setRadiusPx` / `applyRadiusPx` replace `getRadius` / `setRadius` / `applyRadius`. Storage now saves a plain pixel number (e.g. `"8"`). Old preset-name strings (`'balanced'` etc.) auto-migrate via `LEGACY_RADIUS_MAP`.
- **Table density**: `TABLE_DENSITY_OPTIONS` (Compact / Normal / Relaxed), `getTableDensity` / `setTableDensity` / `applyTableDensity` — sets `--table-header-py` and `--table-row-py`.
- **Table scrollbar size**: `getTableScrollbarSize` / `setTableScrollbarSize` / `applyTableScrollbarSize` — sets `--table-scrollbar-size` (0–16 px).
- **Table border / shadow**: already existed; unchanged.
- `applyStoredTheme()` updated to restore all of the above on startup.

#### 2. `src/index.css` — new CSS tokens and rules
New `:root` tokens added:
```css
--table-cell-px:         1.5rem;
--table-header-py:       0.75rem;
--table-row-py:          1rem;
--table-scrollbar-size:  6px;
```
New `@layer base` rules added:
- `table th:not([data-slot])` / `table td:not([data-slot])` — standardise native table cell padding via tokens, `!important`. The `:not([data-slot])` guard avoids touching shadcn Table head/cell elements.
- `.overflow-x-auto::-webkit-scrollbar` / `track` / `thumb` / `thumb:hover` — horizontal scrollbar sizing and colour via `--table-scrollbar-size` and `--border`.
- `div:has(> .overflow-x-auto > table)` added **alongside** the existing `div:has(> [data-slot="table-container"])` — this was the table shadow bug: native admin tables were never receiving `--table-shadow` because they don't use shadcn Table wrapper slots.
- `body { font-family: var(--font-body, ...) }` for font switching.
- Weight token rules for `h1`, `.text-section`, `.text-label`, `.text-xs`, `p/td/[data-slot="table-cell"]`.

#### 3. `src/pages/admin/AdminAppearanceSettings.tsx`
New sections added to the Appearance page:
- **Font Family card** — 7 font cards in a 2/3-col grid, each showing an "Ag" specimen and sample text rendered in that font stack; all Google Fonts preloaded on mount.
- **Typography card** — 5 role rows, each with a live preview box (inline-styled with current size + weight + active font), Size step buttons (S/M/L/XL), Weight step buttons (Regular/Medium/Semibold/Bold). "Reset all" button appears only when settings differ from defaults.
- **Corner Style card** (replaced) — live preview rectangle + slider (0–24 px) + number input + three quick-preset chips.
- **Table Style card** expanded — added Row Spacing (3 preset buttons) and Scrollbar Thickness (slider + number input with live preview bar).

#### 4. Typography audit — `<th>` elements
All native `<th>` elements across admin pages now use:
`text-label font-medium text-muted-foreground uppercase tracking-wider`

Files fixed this session:
- `src/pages/AdminCityManagement.tsx` — 6 `<th>` elements
- `src/pages/AdminDesignationsManagement.tsx` — 17 `<th>` elements
- `src/pages/AdminStateManagement.tsx` — 5 `<th>` elements
- `src/pages/admin/AdminUsers.tsx` — 6 `<th>` elements

Previously fixed in the same stream (prior context window):
- `src/pages/AdminDirectoryVisibility.tsx` — 3 native `<th>` elements
- `src/pages/AdminFormFieldConfiguration.tsx` — 5 native `<th>` elements
- `src/pages/MemberDashboard.tsx` — 2 card header `<h2>` elements
- All shared modal/component headings (ViewApplicationModal, AuditHistoryModal, EditMemberModal, ChangePasswordModal, ChangeCredentialModal, EditUserModal, BlockUserModal, DeleteUserModal, AssignRoleModal, RecentActivityList, SystemStatusPanel, QuickActionsPanel, ImageCropModal, FieldCorrectionStepper)

---

## Task for Codex — Full Hardcode Audit

**Claude has done what it can see from grep and targeted reads. The user wants a complete, exhaustive audit.**

Please go through **every page and every component** in the codebase and check for remaining hardcoded styles that should instead be using the design system tokens. Specifically look for:

### 1. Typography — text sizes and colors
Things to flag:
- `text-lg`, `text-xl`, `text-2xl`, `text-3xl` on headings/labels/content (should use `text-xl` for page titles or `text-section` for section headings)
- `text-gray-900`, `text-gray-800` on text content (should use `text-foreground`)
- `text-gray-600`, `text-gray-500` on body/label text (should use `text-muted-foreground`)
- `font-bold` on headings where `font-semibold` is the design system weight
- Any `text-sm font-medium text-gray-500 uppercase tracking-wide` on `<th>` — should be `text-label font-medium text-muted-foreground uppercase tracking-wider`

### 2. Table structure
- Native `<th>` cells not using `text-label font-medium text-muted-foreground uppercase tracking-wider`
- Native `<td>` cells with hardcoded `text-gray-700`, `text-gray-900` etc. — should use `text-foreground` or `text-muted-foreground`
- Table wrapper divs with hardcoded `shadow-sm` — the CSS token `--table-shadow` now controls this via `:has()` but if the wrapper has `overflow-hidden` it may clip the shadow; check and flag
- Table `<thead>` rows with `bg-gray-50` — should ideally use `bg-muted/50` or similar theme-aware class
- Any `divide-gray-200` or `border-gray-200` — should use `divide-border` or `border-border`

### 3. Cards and containers
- `bg-white` on cards — should use `bg-card` (dark mode safe)
- `bg-gray-50` on card backgrounds / section backgrounds — should use `bg-muted/50` or `bg-muted`
- Hardcoded `border-gray-200` — should use `border-border`
- `shadow-sm` hardcoded on table wrappers — the CSS variable now overrides this, but flag any that might be double-applying

### 4. Form fields / inputs
- Hardcoded `border-gray-300`, `border-gray-200` on `<input>`, `<select>`, `<textarea>` — should use `border-border` or shadcn `Input` component
- `focus:ring-blue-500`, `focus:border-blue-500` — should use `focus:ring-primary` or shadcn Input's built-in focus ring
- `rounded-lg` vs `rounded-[var(--radius)]` — inputs and buttons should respect the `--radius` token

### 5. Buttons
- Hardcoded `bg-blue-600 hover:bg-blue-700` inline action buttons (not using shadcn `Button`) — should use `bg-primary hover:bg-primary/90` or the shadcn Button component
- Hardcoded `text-white` on blue buttons — fine but flag for consistency if mixed with themed buttons

### 6. Badges / status pills
- Hardcoded `bg-yellow-100 text-yellow-800`, `bg-green-100 text-green-800`, `bg-red-100 text-red-800` for status badges — check if these exist outside of the intentional status indicator pattern

### 7. Spacing / padding
- Table cell padding (`px-6 py-3`, `px-6 py-4`) — these are now overridden by CSS tokens via `!important`, so visually they are standardised. But flag any cells with different padding (e.g. `px-4 py-2`, `px-3 py-1`) that would break the standard layout when density changes.

### Scope to check
All files under:
- `src/pages/Admin*.tsx`
- `src/pages/admin/*.tsx`
- `src/pages/Member*.tsx`
- `src/components/admin/**`
- `src/components/member/**`
- `src/components/dashboard/**`
- `src/components/*.tsx` (modals, shared components)

Public pages (`/`, `/members`, `/events`, `/news`, `/join`, `/signin`) are **intentionally excluded** — they are not part of the design system scope.

### Expected output from Codex
A list of remaining violations grouped by category, with file + line number, old value → suggested replacement. Then fix what can be safely batch-replaced without breaking functionality.

---

## Files In Play

- `src/lib/themeManager.ts` — unlocked
- `src/index.css` — unlocked
- `src/pages/admin/AdminAppearanceSettings.tsx` — unlocked
- All admin/member page and component files — unlocked for the audit

## Needs From User / Environment (still pending)

- Set `RESEND_FROM_ADDRESS` in the Supabase edge-function environment
- Apply `supabase/migrations/20260403123000_create_storage_buckets_for_public_files_and_member_photos.sql` if QR/document uploads are still not working

## Next Recommended Stream

- Codex: Complete the hardcode audit above and apply safe batch fixes
- Claude: `CLAUDE-UI-005` — Application settings hub (can run in parallel after audit)
