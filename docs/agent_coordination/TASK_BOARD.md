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
| CLAUDE-UI-005 | Application settings hub in Settings | Claude | Add a global/app-wide settings area inside Settings for portal-level configuration that does not belong to a narrower admin subsection | settings page(s), settings navigation, shared settings UX copy/layout, related frontend wiring | Exact setting categories still need to be defined before implementation |

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
| COD-DASH-001 | Fix dashboard Active Admin Users metric | Codex | Align the dashboard card with real admin-capable users by counting active, non-frozen `users` rows with `account_type` in `admin`/`both` instead of counting `user_roles` rows | `src/hooks/useDashboardData.ts`, dashboard metric semantics | Complete. `npm run build` passes. `npm run lint` is currently blocked by unrelated errors under `vendor/shadcnuikit`. |
| CLAUDE-UI-004 | Stripe-style redesign for authenticated portal surfaces | Claude | Batch 1 admin chrome, Batch 2 AdminRegistrations table redesign, Batch 3 member portal restyle with MemberNav | `src/components/admin/AdminLayout.tsx`, `src/components/dashboard/DashboardCard.tsx`, `src/pages/AdminDashboardOverview.tsx`, `src/pages/AdminRegistrations.tsx`, `src/components/MemberNav.tsx`, `src/pages/MemberDashboard.tsx`, `src/pages/MemberViewProfile.tsx`, `src/pages/MemberSettings.tsx` | Complete. Lint 0/0, build PASS across all three batches. |
| COD-RUN-001 | Investigate focus-return refresh swallowing first click | Codex | Fixed the cross-page focus-refresh issue by changing permission refresh on window focus from a loading-state reset to a background refresh | `src/contexts/PermissionContext.tsx` | Complete. `npm run lint` and `npm run build` pass. |
| COD-BLD-001 | Review non-blocking build warnings | Codex | Removed the `sessionManager` mixed dynamic/static import warning by making `customAuth` use a static import; left the large main chunk warning deferred because it needs broader route/code-splitting work | `src/lib/customAuth.ts`, build output review | Complete. `npm run lint` and `npm run build` pass. Main chunk-size warning remains as a documented optimization concern. |
| COD-PDF-002 | Refine member PDF export pagination and page layout | Codex | Tightened `ViewApplicationModal` PDF export to strict A4 pages, whole-section pagination, 2 cm margins, and a last-page-only footer | `src/components/ViewApplicationModal.tsx` | Complete. `npm run lint` and `npm run build` pass. |
| CLAUDE-UI-003 | Member detail view (all statuses) + PDF export | Claude | View Details button for all statuses (members.view gated); Download PDF button in ViewApplicationModal; professional PDF with LUB logo, org name, all member sections; jsPDF + html2canvas via dynamic import | `src/pages/AdminRegistrations.tsx`, `src/components/ViewApplicationModal.tsx` | Complete - lint 0/0, build PASS. PDF libs in separate lazy chunks. |
| COD-PDF-001 | Add jspdf + html2canvas to package.json | Codex | Installed PDF libraries to unblock UI PDF export work; dynamic-import-only constraint remains mandatory | `package.json`, `package-lock.json` | Complete. `npm run lint` and `npm run build` pass. |
| COD-ADM-VCARD-001 | Remove Member vCard Generator from portal | Codex | Removed the admin registrations vCard generator UI, dead page logic, live frontend `members.export` usage, and the standalone helper file | `src/pages/AdminRegistrations.tsx`, `src/lib/vCardGenerator.ts`, coordination docs | Complete. `npm run lint` and `npm run build` pass. |
| COD-VAL-001 | Validation-consumption cleanup audit and first safe slice | Codex | Audited Join vs Member Edit validation consumption and fixed the first safe inconsistency: custom-city mode in Member Edit no longer also requires the standard city field | `src/pages/MemberEditProfile.tsx`, validation hooks/usage audit | Complete. `npm run lint` and `npm run build` pass. |
| COD-HC-001 | Hardcode cleanup - org profile website + smoke credentials | Codex | Added `organization_website` migration and type wiring, removed personal smoke creds from active scripts, added gitignored local smoke admin config path, updated welcome-email fallback and send-email config handling | `supabase/migrations/20260403110000_add_organization_website_to_profile.sql`, `src/lib/supabase.ts`, `src/lib/emailService.ts`, `supabase/functions/send-email/index.ts`, `tests/e2e/helpers/auth.ts`, `package.json` | Complete. `npm run lint`, `npm run build`, and `npm run test:e2e:phase1:local` pass. |
| COD-PAY-001 | Payment settings admin cleanup | Codex | Added storage-bucket migration for uploads, added session-wrapped payment-settings delete RPC, and exposed Delete inside payment-settings edit mode | `supabase/migrations/20260403123000_create_storage_buckets_for_public_files_and_member_photos.sql`, `supabase/migrations/20260403133000_add_delete_payment_settings_with_session.sql`, `src/pages/AdminDashboard/PaymentSettings.tsx` | Complete. `npm run lint` and `npm run build` pass. |
