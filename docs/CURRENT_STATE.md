# LUB Web Portal - Current State

**Last updated:** 2026-05-03
**Updated by:** Codex (`COD-EVENTS-REGISTRATION-MEDIA-041` runtime closeout + `041X` hotfix)

---

## Project

- **Repo:** `C:\webprojects\lub`
- **Latest deep handover:** `docs/session_documents/session_78_smart_upload_batch_005.md`
- **Project guide:** `docs/lub_web_portal_project_guide_for_claude_code.md`

---

## Current Baseline

| Check | Status |
|-------|--------|
| Build (`npm run build`) | PASS (2026-05-03, COD-EVENTS-REGISTRATION-MEDIA-041) |
| Lint (`npm run lint`) | PASS - 0 errors, 3 expected warnings in shadcn primitives (2026-05-03, COD-EVENTS-REGISTRATION-MEDIA-041) |
| Phase 1 destructive smoke | **15 passed** (verified 2026-03-13 baseline) |
| Phase 1 readonly smoke | PASS - 3 passed / 12 skipped (2026-05-03, COD-EVENTS-REGISTRATION-MEDIA-041) |

Phase 1 destructive baseline remains the non-negotiable floor.

---

## Active Stream

**Active stream:** none (latest events runtime closeout finished)  
**Current owner:** Codex  
**Task board:** `docs/agent_coordination/TASK_BOARD.md` - single source of truth.

**Current handoff state:** `COD-EVENTS-REGISTRATION-MEDIA-041` is fully closed. Codex applied migration `supabase/migrations/20260507000000_events_registration_media_041.sql`, deployed `event-media-upload`, and completed runtime probes (per-day capacity/day selection, `visit_date_required`, single-day auto-assignment, registrations list load, asset upload/render/download, and permission denials). During closeout, a production defect was found in `delete_event_asset_with_session` (direct delete on `storage.objects` blocked by storage trigger). Codex added and applied hotfix migration `supabase/migrations/20260507001000_event_asset_delete_rpc_hotfix.sql`; delete RPC now removes asset rows and clears banner pointers without direct storage-table delete.

Most recently completed streams:
- **COD-EVENTS-REGISTRATION-MEDIA-041X**: Runtime hotfix for event asset delete RPC.
- **COD-EVENTS-REGISTRATION-MEDIA-041**: Events registration/media feature batch, runtime verified.
- **COD-EVENTS-AI-DATES-SHARE-040A-HOTFIX**: Date extraction + RSVP share panel hotfix, runtime verified.
- **COD-EVENTS-NEXT-040A**: RSVP field expansion + WhatsApp manual-trigger generation, runtime verified.
- **COD-EVENTS-RSVP-BRIDGE-MAPS-WHATSAPP-039**: RSVP + bridge + maps + WhatsApp, runtime verified.

---

## Last Verified

- **When:** 2026-05-03
- **What:** `COD-EVENTS-REGISTRATION-MEDIA-041` runtime closeout + `041X` hotfix
- **Result:** PASS for lint, build, and Phase 1 readonly smoke. Migration 041 applied, `event-media-upload` deployed, runtime probes passed for RSVP capacity/visit-date logic and media flow, and delete-RPC hotfix migration applied.
- **Commands:**
  ```
  npm run lint -> PASS (0 errors / 3 expected warnings)
  npm run build -> PASS
  npm run test:e2e:phase1:local -> PASS (3 passed / 12 skipped)
  ```

---

## In Progress / Dirty State

- Repo worktree is dirty from multiple prior slices and handoffs. Treat the current tree as collaborative state; do not revert unrelated changes.
- Commit-scope policy is active: stage and commit only explicit slice-manifest files; do not use broad staging (`git add .`) in this repo state.

## Deferred / Next Candidate Work

1. `COD-PUBLIC-001` (News half) - real News page blocked; no backend content source identified yet.
2. `COD-MSME-SHOWCASE-001` - MSME product showcase platform (needs product scoping with user).
3. `COD-MSME-ISSUES-001` - MSME issue intake, AI categorization, and representation workflow (needs product refinement).
4. `COD-MEMBERS-EXPORT-002` - low-priority export UX follow-ups only after higher-priority product work.
5. Multi-provider AI runtime - structural follow-up to make `normalize-member` and `draft-activity-content` support providers beyond OpenAI.

---

## References

- Task board: `docs/agent_coordination/TASK_BOARD.md`
- Handoff notes: `docs/agent_coordination/HANDOFF_NOTES.md`
- Project guide: `docs/lub_web_portal_project_guide_for_claude_code.md`
- Latest deep handover: `docs/session_documents/session_78_smart_upload_batch_005.md`
