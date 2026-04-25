# LUB Web Portal - Current State

**Last updated:** 2026-04-25
**Updated by:** Codex (`COD-ACTIVITIES-CLOUDFLARE-MEDIA-012` runtime closeout)

---

## Project

- **Repo:** `C:\webprojects\lub`
- **Latest deep handover:** `docs/session_documents/session_78_smart_upload_batch_005.md`
- **Project guide:** `docs/lub_web_portal_project_guide_for_claude_code.md`

---

## Current Baseline

| Check | Status |
|-------|--------|
| Build (`npm run build`) | PASS (2026-04-25, Codex runtime closeout) |
| Lint (`npm run lint`) | PASS - 0 errors, 3 expected warnings in shadcn primitives (2026-04-25, Codex runtime closeout) |
| Phase 1 destructive smoke | **15 passed** (verified 2026-03-13 baseline) |
| Phase 1 readonly smoke | PASS - 3 passed / 12 skipped (2026-04-25, Codex runtime closeout) |

Phase 1 destructive baseline remains the non-negotiable floor.

---

## Active Stream

**Active stream:** None.
**Current owner:** None
**Task board:** `docs/agent_coordination/TASK_BOARD.md`
**Current handoff state:** All Cloudflare Activities media runtime work is complete. Ready queue is open.

Most recently completed streams:
- **COD-ACTIVITIES-SLUG-SEARCH-014**: Closed after Codex added server-side Activities slug normalization/de-duplication and public Events smart search. Migration `20260425150000_activity_slug_uniqueness_and_search.sql` is applied; create/update now generate unique slugs by appending counters instead of returning duplicate-slug errors. Admin slug UI now shows canonical `/events/` and clarifies that changing a published slug breaks old direct links only, not listing visibility. Public `/events` now includes ranked search plus All/Featured/Upcoming/Past filters. Lint/build/Phase 1 readonly smoke PASS on 2026-04-25.
- **COD-ACTIVITIES-MEDIA-AI-FOLLOWUP-013**: Closed after Codex fixed the Activities gallery batch queue, added first-gallery-image cover fallback when no explicit cover is selected, and extended Activities source-document extraction to return selectable date/location candidates. `draft-activity-content` was redeployed with stronger extraction guidance: multi-day activities use the first activity day as `activity_date`, and multiple detected dates/locations are returned as options for the admin to choose. Lint/build/Phase 1 readonly smoke PASS on 2026-04-25.
- **COD-ACTIVITIES-CLOUDFLARE-MEDIA-012**: Closed after Codex runtime deployment and verification. Activities media now targets private Cloudflare R2 bucket `lub` for originals, Worker `lub-media` serves transformed variants on `media.lub.org.in`, and Supabase Edge Functions `activity-media-upload`, `activity-media-original-download`, and `activity-media-delete` are deployed. Migration `20260420130000_activities_cloudflare_media_support.sql` is applied. Live disposable probe passed: created a temporary Activity, uploaded cover and gallery originals through the Edge Function, verified Worker display variants, verified signed original downloads for cover and gallery, confirmed no-variant public requests return `400`, then deleted the temporary R2 objects and Activity. Setup guide: `docs/cloudflare_events_media_setup.md`.
- **COD-SMART-UPLOAD-GENDER-PRECEDENCE-011**: Closed after Codex implemented Smart Upload source-label cleanup and mismatch precedence for gender on `/join`. Extracted Aadhaar review data is now tracked independently from draft autofill state, the review explicitly states whether document data matches or overrides current account/form values, and `gender` is treated as a document-precedence field inside the registration flow. Final verified mismatch behavior: signup gender `female` + Aadhaar gender `male` shows `GENDER: Male` with `Document overrides current account/form value`, and continuing to the registration form sets `gender=male` while leaving the separate signup/account record untouched.
- **CLAUDE-SMART-UPLOAD-GENDER-010**: Closed after Codex deployed `extract-document` and live-browser-verified `/join` with the real Aadhaar sample. Final root cause was mixed: the backend extractor needed Aadhaar-specific gender hardening, and the review card still used draft-only Smart Upload state, which hid successfully extracted gender whenever it matched an existing form value. Codex fixed the remaining client bug by surfacing raw extracted fields into a separate review state. Final verified behavior: direct function invoke returns `gender: "male"`, the Extracted data review shows `GENDER: Male`, the false `Unable to extract gender` warning is gone, and continuing to the registration form preserves `gender=male`.
- **CLAUDE-ADMIN-ACCESS-REDIRECT-009**: Closed after Codex live browser verification. `AdminLayout` now distinguishes between `unauthenticated` and `authenticated-unauthorized`, sending unauthenticated users to `/signin` and authenticated non-admin users to `/dashboard`. The prior `/admin/*` <-> `/signin` loop is gone.
- **COD-EVENTS-ACTIVITIES-IA-001**: Closed after Codex browser verification. `/events` is now the canonical public feed, `/events/:slug` is the canonical detail route, `/activities` and `/activities/:slug` are compatibility redirects, public header/footer no longer show separate `Activities`, admin sidebar section is `Events & Activities`, and admin `View Public Page` now targets `/events/:slug`.
- **COD-ACTIVITIES-ACTIONS-MENU-005**: Closed after Codex live browser verification. Admin Activities row `Actions` dropdown opens visibly with all 5 items.
- **COD-ACTIVITIES-AI-EXTRACT-BTN-004**: Browser-verified complete. Uploading source documents no longer auto-triggers extraction; the explicit `Extract Content` button runs extraction and guided fields remain editable before `Generate Draft`.
- **COD-ACTIVITIES-HANDOFF-VERIFY-001**: Closed the previous Activities runtime handoff.

---

## Last Verified

- **When:** 2026-04-25
- **What:** `COD-ACTIVITIES-SLUG-SEARCH-014` implementation + runtime closeout
- **Result:** PASS for Activities slug de-duplication migration, public Events smart search, lint, build, and Phase 1 readonly smoke.
- **Commands:**
  ```
  npm run db:migrations:audit -> PASS
  npm run db:migration:apply:single -- --version=20260425150000 -> PASS
  npm run lint -> PASS (0 errors / 3 expected warnings)
  npm run build -> PASS
  npm run test:e2e:phase1:local -> PASS (3 passed / 12 skipped)
  ```

---

## In Progress / Dirty State

- Repo worktree is dirty from multiple prior slices and handoffs. Treat the current tree as collaborative state; do not revert unrelated changes.

## Deferred / Next Candidate Work

1. `COD-PUBLIC-001` (News half) - real News page blocked; no backend content source identified yet.
2. `COD-MSME-SHOWCASE-001` - MSME product showcase platform (needs product scoping with user).
3. `COD-MSME-ISSUES-001` - MSME issue intake, AI categorization, and representation workflow (needs product refinement).
4. `COD-MEMBERS-EXPORT-002` - low-priority export UX follow-ups only after higher-priority product work.
5. Multi-provider AI runtime - structural follow-up to make `normalize-member` and `draft-activity-content` support providers beyond OpenAI.

---

## Known Risks / Watch Items

- Public canonical route is now `/events`; `/activities` routes are compatibility redirects only.
- Activities slugs are unique server-side. Duplicate requested slugs are normalized and saved as `slug-1`, `slug-2`, etc.; changing a published slug breaks old direct detail links but does not remove the event from `/events`.
- Admin sidebar section label is `Events & Activities`; admin path `/admin/content/activities` is unchanged.
- Activities Cloudflare media support is live for new uploads. Originals are stored in private R2 bucket `lub`; public display uses Worker variants from `media.lub.org.in`; admin/editor original download uses signed URLs from Supabase Edge Functions.
- News page (`/news`) remains a placeholder; no real content source exists yet.
- The `draft-activity-content` edge function is live in both `draft` and `extract_fields` modes (OpenAI only).
- The no-permission negative branch for `draft-activity-content` was not live-probed with a real low-privilege session.
- Migration safety workflow remains mandatory: audit first, apply only targeted versions, verify after each apply.
- Activities settings are now live with `max_gallery_images = 20`.
- Activities gallery multi-select now processes the whole selected batch through the crop modal queue; if no explicit cover is selected, the first active gallery image becomes the saved cover fallback.
- Activities source-document extraction now asks AI for first-day activity dates plus selectable date/location options when multiple candidates are present.
- Phase 1 destructive smoke does not yet cover Activities form mutations.
- Join legacy settings page still exists by design until UAT sign-off on Builder and Studio workflows.
- Smart Upload now gives Aadhaar gender precedence over signup/account prefill within the member registration flow only; it does not silently rewrite the underlying account record.

---

## References

- Task board: `docs/agent_coordination/TASK_BOARD.md`
- Handoff notes: `docs/agent_coordination/HANDOFF_NOTES.md`
- Project guide: `docs/lub_web_portal_project_guide_for_claude_code.md`
- Latest deep handover: `docs/session_documents/session_78_smart_upload_batch_005.md`
