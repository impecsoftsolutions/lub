# LUB Web Portal - Codex Startup Instructions

## Read These First (in order)

1. `docs/CURRENT_STATE.md` - lightweight rolling checkpoint (what changed, what's next)
2. `docs/agent_coordination/TASK_BOARD.md` - strict shared queue and slice ownership
3. Latest deep handover referenced by `docs/CURRENT_STATE.md`
4. `docs/lub_web_portal_project_guide_for_claude_code.md` - full project architecture and orientation

Do not skip step 1. It is the fastest way to know where the project currently stands.

## Workflow Conventions

### Before starting any task
- Read `docs/CURRENT_STATE.md`
- Read `docs/agent_coordination/TASK_BOARD.md`
- Read `src/lib/supabase.ts` before changing any domain
- Check `supabase/migrations/` for the relevant domain's SQL before writing frontend code
- Inspect the relevant page/component/service before proposing changes

### Domain ownership per session
- One agent owns one implementation slice end-to-end at a time
- Do not concurrently edit the same domain/files as another agent unless explicitly coordinated
- Slices cross page + service layer + SQL migration + Playwright - own all four for your slice
- Codex owns backend/data/runtime by default:
  - `src/lib/supabase.ts`
  - auth/session behavior
  - SQL migrations
  - data model changes
  - Playwright/runtime verification
  - DB cleanup SQL
- Claude owns UI by default:
  - `src/pages/**`
  - `src/components/**`
  - layout
  - interaction flow
  - client-side UX wording
  - visual polish
- If a slice is mixed and unclear, default owner is Codex.
- Follow `docs/agent_coordination/OWNERSHIP_RULES.md` for handoff triggers.

### Security direction
- Privileged admin/browser writes must use `_with_session` RPC wrappers
- Wrapper takes `p_session_token`; server derives actor and enforces permissions server-side
- Do NOT replace hardened `_with_session` paths with direct `.from(...).update/insert/delete` browser writes
- Client-supplied actor UUIDs are the legacy/weaker pattern - avoid introducing new ones

### Phase 1 baseline
- Do NOT reopen completed Phase 1 work without fresh failing evidence
- Current Playwright baseline: **15 passed**
- Spec: `tests/e2e/phase1-production-smoke.spec.ts`
- Preserve the baseline; run `npm run test:e2e:phase1:local` before and after changes in covered domains

### Migrations
- Do not assume a migration is applied just because the SQL file exists in repo
- Confirm actual DB application when working in a domain with new migrations

### Validation
- Two separate validation layers exist - do not conflate them (see project guide section 10)
- Validation changes should be small safe slices, not broad refactors

## End of Session
- Update `docs/CURRENT_STATE.md` - overwrite the relevant sections, do not append a journal
- Update `docs/agent_coordination/TASK_BOARD.md`
- Update `docs/agent_coordination/HANDOFF_NOTES.md` if handing off or blocking
- For major stream completions, create a new `docs/session_documents/session_NN_...md`

## Key Commands
```
npm run dev                              # start dev server
npm run build                            # production build
npm run lint                             # ESLint check
npm run test:e2e:phase1:local            # read-only smoke run
npm run test:e2e:phase1:local:destructive # full destructive suite
```
