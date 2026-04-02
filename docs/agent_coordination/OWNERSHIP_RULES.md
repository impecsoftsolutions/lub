# LUB Agent Ownership Rules

## Default Ownership

### Claude Code owns UI by default

- `src/pages/**`
- `src/components/**`
- layout
- interaction flow
- client-side UX wording
- visual polish

### Codex owns non-UI by default

- `src/lib/supabase.ts`
- `src/lib/customAuth.ts`
- `src/lib/memberAuth.ts`
- `src/lib/sessionManager.ts`
- `src/types/**` when tied to API or data changes
- `supabase/migrations/**`
- `tests/e2e/**`
- DB cleanup SQL
- runtime verification
- checkpoint docs that define technical truth

## Hard Rules

1. One slice has one implementation owner.
2. No parallel edits on the same slice unless `docs/agent_coordination/TASK_BOARD.md` explicitly splits it.
3. If Claude needs a migration, RPC, schema, or service-layer contract change, Claude stops and hands off to Codex.
4. If Codex needs non-trivial UX redesign, copy, layout decisions, or interaction redesign, Codex stops and hands off to Claude.
5. Codex may do tiny mechanical UI wiring only when it is unavoidable and not a design decision.
6. Meaningful UX changes still go back to Claude for review.

## Handoff Triggers

Handoff is required when:

- Claude needs a new migration or RPC
- Claude needs a change to `src/lib/supabase.ts` or auth/session behavior
- Codex needs a non-trivial UI redesign
- either agent hits a blocker outside its ownership boundary

## Completion Rules

A slice is not done until:

- code is complete
- owner has run the required checks
- `docs/CURRENT_STATE.md` is updated
- `docs/agent_coordination/TASK_BOARD.md` is updated
- `docs/agent_coordination/HANDOFF_NOTES.md` is updated if there is a live handoff
- a new `docs/session_documents/session_NN_...md` file is written for major stream completions

## Review Pattern

Preferred workflow:

1. owner implements
2. other agent reviews or audits
3. owner applies final fixes
4. checkpoint docs are updated

## Shared Invariants

- Do not regress the Phase 1 destructive baseline.
- Preserve the `_with_session` security direction.
- Do not introduce new client-supplied actor UUID flows.
- Do not redesign auth/session architecture casually.
