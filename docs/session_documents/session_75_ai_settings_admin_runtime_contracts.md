# Session 75 - AI Settings Admin Runtime Contracts

## Summary
Completed `COD-AI-SETTINGS-001` end-to-end with secure server-side contracts and admin UI wiring for normalization runtime AI settings.

Implemented:
- DB-backed AI runtime settings table (`member_normalization` singleton-style row)
- New permission codes: `settings.ai.view`, `settings.ai.manage`
- `_with_session` RPC wrappers for read/write
- Masked-key read behavior (raw API key never returned to browser)
- Public non-sensitive runtime profile RPC for provider/model/is_enabled only
- Admin settings page and route wiring
- Sidebar + Settings Hub links
- Optional runtime hint injection into normalization payload (`_ai_runtime`)

## Files Changed
- `supabase/migrations/20260412170000_add_ai_runtime_settings_admin_contracts.sql`
- `src/lib/supabase.ts`
- `src/lib/normalization.ts`
- `src/pages/AdminAISettings.tsx` (new)
- `src/pages/AdminSettingsHub.tsx`
- `src/components/admin/AppSidebar.tsx`
- `src/App.tsx`

## Validation Status
- `npm run db:migrations:audit` -> PASS
- `npm run db:migration:apply:single -- --version=20260412170000` -> PASS
- `npm run lint` -> PASS (0 errors / 3 expected warnings)
- `npm run build` -> PASS
- `npm run test:e2e:phase1:local` -> PASS (3 passed / 12 skipped)

## Remaining Risks
- Runtime edge function `normalize-member` may ignore `_ai_runtime` payload hint until explicitly consumed server-side.
- Existing `admin` role now has AI manage permission via migration; if tighter policy is desired later, reduce to super-admin only in a follow-up migration.

## Next Recommended Stream
- `CLAUDE-THEME-001`: Rename user-facing `Appearance` terminology to `Theme` across admin settings/navigation.
- `CLAUDE-VAL-DESC-001`: Add edit capability for validation-rule description text.
- `CLAUDE-SIDEBAR-LOGO-001`: Use sidebar logo as collapse trigger on hover.
