# LUB Agent Task Board

Use this file as the strict shared queue between Codex and Claude Code.

Rules:
- One implementation slice has one owner.
- Claude owns UI-first slices by default.
- Codex owns backend/data/runtime slices by default.
- Do not start a new slice until `In Progress` is updated.
- Move a task to `Blocked` instead of improvising across ownership boundaries.

## Ready

| ID | Title | Owner | Scope | Files / Domains | Dependency / Blocker |
|----|-------|-------|-------|-----------------|----------------------|
| COD-VAL-001 | Validation-consumption cleanup audit and first safe slice | Codex | Validation logic consistency across existing forms and shared validation usage | `src/lib/**`, validation hooks, selected forms, maybe `src/types/**` | None |
| COD-BLD-001 | Review non-blocking build warnings | Codex | Vite chunk-size warning and `sessionManager` mixed import graph warning | build config, `src/lib/sessionManager.ts`, import graph only | None |

## In Progress

| ID | Title | Owner | Scope | Files / Domains | Dependency / Blocker |
|----|-------|-------|-------|-----------------|----------------------|
| None | - | - | - | - | - |

## Blocked

| ID | Title | Owner | Scope | Files / Domains | Dependency / Blocker |
|----|-------|-------|-------|-----------------|----------------------|
| None | - | - | - | - | - |

## Done This Week

| ID | Title | Owner | Scope | Files / Domains | Dependency / Blocker |
|----|-------|-------|-------|-----------------|----------------------|
| COD-HC-001 | Hardcode cleanup - org profile website + smoke credentials | Codex | Added `organization_website` migration and type wiring, removed personal smoke creds from active scripts, added gitignored local smoke admin config path, updated welcome-email fallback and send-email config handling | `supabase/migrations/20260403110000_add_organization_website_to_profile.sql`, `src/lib/supabase.ts`, `src/lib/emailService.ts`, `supabase/functions/send-email/index.ts`, `tests/e2e/helpers/auth.ts`, `package.json` | Complete. `npm run lint`, `npm run build`, and `npm run test:e2e:phase1:local` pass. |
| COD-PAY-001 | Payment settings admin cleanup | Codex | Added storage-bucket migration for uploads, added session-wrapped payment-settings delete RPC, and exposed Delete inside payment-settings edit mode | `supabase/migrations/20260403123000_create_storage_buckets_for_public_files_and_member_photos.sql`, `supabase/migrations/20260403133000_add_delete_payment_settings_with_session.sql`, `src/pages/AdminDashboard/PaymentSettings.tsx` | Complete. `npm run lint` and `npm run build` pass. |
| COD-DATA-001 | Signup state persistence and Join prefill | Codex | Persist signup state, extend auth/session payload, prefill Join state | `supabase/migrations/**`, `src/lib/memberAuth.ts`, `src/types/auth.types.ts`, `src/pages/SignUp.tsx`, `src/pages/Join.tsx` | Completed in commit `8cacbac` |
| CLAUDE-UI-001 | Shared workflow scaffolding adoption | Claude | Startup docs and shared checkpoint process | `CLAUDE.md`, repo workflow usage | Existing shared docs in repo |
| CLAUDE-UI-002 | Consume org profile in UI + fix Manage Locations route (Batch 1 + Batch 2) | Claude | Footer (org name/email/website/year), SignIn (support email), AdminProfileSettings (website field), AdminStateManagement (route fix) | `src/hooks/useOrganisationProfile.ts`, `src/components/Footer.tsx`, `src/pages/SignIn.tsx`, `src/pages/AdminProfileSettings.tsx`, `src/pages/AdminStateManagement.tsx` | Complete. `npm run lint` and `npm run build` pass. |
