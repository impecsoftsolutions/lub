# shadcn/ui + Tailwind v4 Migration Plan

## Context

The LUB portal currently uses plain Tailwind v3 with hand-crafted classes on every page. This creates inconsistent spacing, different-looking buttons, manual colour juggling, and a large maintenance burden as the app grows.

Migrating to shadcn/ui + Tailwind v4 means:
- Every button, table, badge, card, input and dialog looks the same automatically
- Theme colours live in one CSS file — one change updates everything everywhere
- Professional, accessible component library used by thousands of production apps

---

## UI kit source path

```
C:\webprojects\ui-kit-package\shadcnuikit\
```

This folder lives **outside** the LUB repo. It is a reference warehouse only — not a runtime dependency. Components are **copied from it** into `src/components/ui/`. Once copied, the project has no dependency on this folder. Future projects follow the same pattern.

---

## Key facts from audit

| Item | Finding |
|------|---------|
| Current Tailwind | 3.4.1 |
| Standalone `transform` class usage | **None found** — no extra v3→v4 work needed |
| Custom CSS in index.css | 2 animation utilities — carry over unchanged |
| Vite version | 5.4.2 — compatible with Tailwind v4 Vite plugin |
| Vendor components | 57 UI components, all pure React, just need `"use client"` removed |
| `lib/utils.ts` in vendor | Has one Next.js import (`Metadata`) — strip it, keep `cn()` |
| `nav-main.tsx` / `app-sidebar.tsx` | Use `next/link` and `usePathname` — swap for React Router equivalents |
| Theme choice | **Ocean Breeze** (blue/teal tones) — matches existing `bg-blue-600` branding |

---

## What to copy from the UI kit

```
C:\webprojects\ui-kit-package\shadcnuikit\
  components/ui/          ← 57 components — copy the 18 listed in Phase 3
  components/layout/sidebar/
    app-sidebar.tsx       ← adapt (next/link → Link, usePathname → useLocation)
    nav-main.tsx          ← adapt same way
    nav-user.tsx          ← adapt same way
  app/globals.css         ← CSS variable base (copy the :root block)
  app/themes.css          ← 8 theme presets (copy just Ocean Breeze block)
  lib/utils.ts            ← copy cn() and avatar helpers only (strip Metadata import)
  hooks/use-mobile.tsx    ← copy as-is
```

---

## Migration phases

### Phase 1 — Install dependencies and set up Tailwind v4 (Codex-owned)

**Why Codex:** touches `package.json` and build config — Codex domain.

1. Replace `tailwindcss: ^3.4.1` with `tailwindcss: ^4.1`, add `@tailwindcss/vite` (devDep)
2. Remove `autoprefixer` from devDeps — not needed in v4
3. Delete `tailwind.config.js` — not used in v4
4. Update `postcss.config.js` — remove tailwindcss/autoprefixer entries (or delete the file)
5. Update `vite.config.ts`:
   ```ts
   import tailwindcss from '@tailwindcss/vite'
   import path from 'path'
   // plugins: [react(), tailwindcss()]
   // resolve: { alias: { '@': path.resolve(__dirname, './src') } }
   ```
6. Update `tsconfig.json` — add inside `compilerOptions`:
   ```json
   "baseUrl": ".",
   "paths": { "@/*": ["./src/*"] }
   ```
7. Install runtime peer deps:
   `clsx`, `tailwind-merge`, `class-variance-authority`,
   `@radix-ui/react-slot`, `@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`,
   `@radix-ui/react-select`, `@radix-ui/react-separator`, `@radix-ui/react-tooltip`,
   `@radix-ui/react-tabs`, `@radix-ui/react-avatar`, `@radix-ui/react-scroll-area`,
   `@radix-ui/react-collapsible`, `tailwindcss-animate`
8. Run `npm install` and `npm run build` — expect CSS errors from `src/index.css` (still has v3 directives, Claude fixes in Phase 2). Vite itself must not crash.

Do NOT touch `src/index.css` or any `src/` component files — Claude owns those.

---

### Phase 2 — CSS theme setup (Claude-owned, after Phase 1 lands)

**File:** `src/index.css`

1. Replace `@tailwind base`, `@tailwind components`, `@tailwind utilities` with `@import "tailwindcss"`
2. Add `@plugin "tailwindcss-animate"` line
3. Paste the `:root { }` CSS variable block from `C:\webprojects\ui-kit-package\shadcnuikit\app\globals.css` (base colour scale + semantic tokens)
4. Paste the **Ocean Breeze** theme block from `C:\webprojects\ui-kit-package\shadcnuikit\app\themes.css`
5. Keep the two existing custom animation utilities (`.animate-slideDown`, `.animate-fade-in-up`)

**File:** `index.html`

6. Add `data-theme-preset="ocean-breeze"` attribute to the `<body>` tag

---

### Phase 3 — Copy and adapt pure UI components (Claude-owned)

**Target:** `src/components/ui/`
**Source:** `C:\webprojects\ui-kit-package\shadcnuikit\components\ui\`

Copy these 18 priority files:
`button.tsx`, `badge.tsx`, `card.tsx`, `table.tsx`, `input.tsx`, `label.tsx`,
`select.tsx`, `textarea.tsx`, `dialog.tsx`, `dropdown-menu.tsx`, `separator.tsx`,
`skeleton.tsx`, `tooltip.tsx`, `tabs.tsx`, `avatar.tsx`, `sidebar.tsx`, `sheet.tsx`, `scroll-area.tsx`

For each copied file:
1. Remove `"use client"` directive at the top
2. Keep `@/` path aliases — Vite alias is configured in Phase 1

Also:
- Create `src/lib/utils.ts` (cn() + generateAvatarFallback — no Next.js imports)
- Copy `C:\webprojects\ui-kit-package\shadcnuikit\hooks\use-mobile.tsx` → `src/hooks/use-mobile.tsx`

---

### Phase 4 — Adapt and replace AdminLayout sidebar (Claude-owned)

**Source:** `C:\webprojects\ui-kit-package\shadcnuikit\components\layout\sidebar\`

1. Create `src/components/admin/AppSidebar.tsx` — adapted from `app-sidebar.tsx`:
   - Remove `"use client"`
   - `import Link from 'next/link'` → `import { Link } from 'react-router-dom'`
   - `import { usePathname } from 'next/navigation'` → `import { useLocation } from 'react-router-dom'`
   - Replace `pathname === item.url` → `location.pathname === item.url`
   - Replace vendor navItems with LUB's actual admin navigation items
   - Keep `<SidebarProvider>`, `<Sidebar>`, `<SidebarHeader>`, `<SidebarContent>`, `<SidebarFooter>`

2. Update `src/components/admin/AdminLayout.tsx`:
   - Wrap with `<SidebarProvider>`
   - Render `<AppSidebar />` on the left
   - Render `<SidebarInset>` for main content area

---

### Phase 5 — Replace admin page components incrementally (Claude-owned)

1. **AdminRegistrations.tsx** — shadcn `<Table>`, `<Badge variant>`, `<DropdownMenu>`
2. **AdminDashboardOverview.tsx** — shadcn `<Card>` + `<CardHeader>` + `<CardContent>`
3. **AdminUserManagement.tsx** — `<Table>`, `<Badge>`, `<Dialog>`
4. **AdminPendingCities.tsx** / **AdminCityManagement.tsx** — `<Table>`, `<Button>`, `<Badge>`
5. **ViewApplicationModal.tsx** — shadcn `<Dialog>` or `<Sheet>`
6. **All form pages** — shadcn `<Input>`, `<Select>`, `<Textarea>`, `<Label>`

The existing `PageHeader` component (`src/components/ui/PageHeader.tsx`) stays — no replacement needed.

---

## Sequencing

| Phase | Owner | Depends on |
|-------|-------|-----------|
| Phase 1 — npm deps + Tailwind v4 + Vite config | Codex | Nothing — start now |
| Phase 2 — CSS theme (index.css + index.html) | Claude | Phase 1 landed |
| Phase 3 — Copy UI components + utils | Claude | Phase 1 landed |
| Phase 4 — Adapt AdminLayout sidebar | Claude | Phase 3 done |
| Phase 5 — Replace page components | Claude | Phase 3 done |

Phases 2 and 3 can run in the same Claude session immediately after Codex lands Phase 1.

---

## Files changed summary

| File | Action | Owner |
|------|--------|-------|
| `package.json` | Upgrade tailwind, add @tailwindcss/vite, add radix/clsx/twmerge deps | Codex |
| `vite.config.ts` | Add tailwindcss vite plugin + @/ alias | Codex |
| `tailwind.config.js` | Delete | Codex |
| `postcss.config.js` | Simplify or delete | Codex |
| `tsconfig.json` | Add @/* path alias | Codex |
| `index.html` | Add `data-theme-preset="ocean-breeze"` to `<body>` | Claude |
| `src/index.css` | Replace directives + paste CSS token variables | Claude |
| `src/lib/utils.ts` | NEW — cn() utility | Claude |
| `src/hooks/use-mobile.tsx` | NEW — copy from ui-kit | Claude |
| `src/components/ui/*.tsx` | NEW — 18 priority components copied from ui-kit | Claude |
| `src/components/admin/AppSidebar.tsx` | NEW — adapted from ui-kit (React Router, LUB nav items) | Claude |
| `src/components/admin/AdminLayout.tsx` | Replace manual sidebar with SidebarProvider + AppSidebar | Claude |
| `src/pages/Admin*.tsx` (5 pages) | Replace table/badge/button/dialog with shadcn equivalents | Claude |

---

## Verification after each phase

1. `npm run build` — must pass with 0 errors
2. `npm run lint` — must pass with 0 warnings
3. Visual: `/admin/registrations` — table rows, badges, dropdown use Ocean Breeze colours
4. Visual: sidebar collapses correctly on smaller screens
5. `npm run test:e2e:phase1:local` — must remain at **15 passed**
