# LUB Agent Handoff Notes

Keep this file short and overwrite it instead of appending a journal.

## Single-Board Rule

Only `docs/agent_coordination/TASK_BOARD.md` is authoritative.
Do not edit task rows in any local board copies.

## Current Owner

No active slice.

## Closed Slice - COD-ACTIVITIES-AI-EXCERPT-DESCRIPTION-DISTINCT-090

### What changed

**`supabase/functions/draft-activity-content/index.ts`:**
- Added `firstSentenceOf(text)` — extracts first sentence from a text block (paragraph-aware)
- Added `tokenBagSimilarity(leftTokens, rightTokens)` — Jaccard similarity over meaningful tokens (length > 2)
- Added `isNearDuplicateLead(excerptText, descriptionText)` — lead-specific duplicate check with lower thresholds than global `isNearDuplicateSentence`:
  - Leading token overlap threshold: 5 (vs 8 global)
  - Positional window threshold: 0.60 / 20 tokens (vs 0.66 / 16 global)
  - Jaccard bag threshold: 0.62 — catches rephrased/reordered duplicates (e.g. "LUB Guntur organized" → "LUB organized ... in Guntur", Jaccard=0.647)
- Added `stripRepeatedLeadFromDescription(excerpt, description)` — removes leading sentences from description's first paragraph that near-duplicate the excerpt; caps at 3 removals; preserves paragraph structure
- Added `MIN_DESCRIPTION_WORDS_AFTER_STRIP = 50` constant
- Added `enforceExcerptDescriptionDistinctness(draft)` — orchestrator replacing the old inline excerpt-fix logic:
  1. Ensure excerpt is non-empty
  2. Fast-path if leads already distinct (with global sentence safety net)
  3. Strip repeated lead from description (preferred — preserves AI excerpt quality)
  4. If stripping would leave < 50 words: keep original description, replace excerpt with template
  5. Global sentence safety net
  6. Final assertion guarantee
- Replaced old `parseAIDraftJson` excerpt-fix block with single `enforceExcerptDescriptionDistinctness` call
- Added prompt rule in `buildSystemPrompt`: "The opening sentence of excerpt and the opening sentence of description must be different."
- Added same rule to `buildEventToActivityPrompt` rules array

### Files touched

- `supabase/functions/draft-activity-content/index.ts`

### Validation

- `npm run lint` PASS (0 errors / 3 expected shadcn warnings)
- `npm run build` PASS
- `npm run test:e2e:phase1:local` PASS (3 passed / 12 skipped)
- 6/6 synthetic tests PASS

### Runtime

- Deployed: `supabase functions deploy draft-activity-content`
- RAMP/Guntur brief probe: excerpt and description leads DISTINCT ✓
  - excerpt: "Local MSMEs and enterprise procurement representatives took part in a two-day programme focused on vendor eligibility, registration requirements, and supply chain expectations."
  - description opens: "The LUB Andhra Pradesh Chapter, in association with MSME Development Institute, Guntur, organized a two-day Vendor Development Programme..."
- Date/location extraction intact: start_at=2026-05-16T10:00:00, end_at=2026-05-17T17:00:00, location=MSME Development Institute, Siripuram, Visakhapatnam ✓

### Residual risks

- Jaccard threshold at 0.62 may occasionally miss heavily paraphrased duplicates (Jaccard < 0.62); prompt tightening is advisory backup. No false-positive risk observed in tests.
- `stripRepeatedLeadFromDescription` uses `isNearDuplicateSentence` (global thresholds) for the strip step to avoid overly aggressive removal. In rare cases where `isNearDuplicateLead` fires but `isNearDuplicateSentence` does not, the description strip will not remove the sentence and the fallback excerpt-replace path runs instead — still correct.

## Previously Closed - COD-SHORT-URL-ENABLE-DISABLE-089

### What changed

**Migration `supabase/migrations/20260520100000_short_url_enable_disable_089.sql`:**
- `short_url_enabled boolean NOT NULL DEFAULT true` added to both `activities` and `events`
- `resolve_activity_short_url` and `resolve_event_short_url` updated to check `short_url_enabled`; return `error_code='short_url_disabled'` when false
- `refresh_activity_short_url_with_session` and `refresh_event_short_url_with_session` neutered — return `error_code='short_url_refresh_disabled'` (signatures preserved for compatibility)
- New `set_activity_short_url_enabled_with_session(text, uuid, boolean)` and `set_event_short_url_enabled_with_session(text, uuid, boolean)` RPCs with edit_any/edit_own permission checks; re-enable auto-generates code only if missing (never regenerates existing code)
- `get_activity_by_slug` updated to include `short_url_enabled` in payload
- `get_activity_by_id_with_session` updated to include `short_url_enabled` in payload
- `get_event_by_id_with_session` updated to include both `short_url_code` AND `short_url_enabled` in payload (previously had neither)
- `NOTIFY pgrst, 'reload schema'` at end

**`src/lib/supabase.ts`:**
- Added `short_url_enabled?: boolean | null` to `PublicActivity`, `AdminActivityDetail`, `AdminEventDetail`
- Added `activitiesService.setShortShareUrlEnabled(sessionToken, activityId, enabled)` calling `set_activity_short_url_enabled_with_session`
- Added `eventsService.setShortShareUrlEnabled(sessionToken, eventId, enabled)` calling `set_event_short_url_enabled_with_session`

**`src/pages/AdminActivityForm.tsx`:**
- Replaced `shortShareRefreshing` state with `shortUrlEnabled` (default: true) + `shortUrlToggling`
- Hydrates `shortUrlEnabled` from `data.short_url_enabled` on edit load
- useEffect now also depends on `shortUrlEnabled`; skips ensure call if code already hydrated from payload (fixes first-load blank short URL)
- `shortActivityUrl` memo now returns '' when `!shortUrlEnabled`
- Removed `refreshShortShareUrl` callback; replaced with `handleToggleShortUrl(enable: boolean)`
- Removed `RefreshCw` from lucide-react imports (no longer used)
- Share panel Short URL section: replaced Refresh button with "Enable short URL"/"Disable short URL" toggle button; conditionally shows URL input/copy/open when enabled, or explanatory note when disabled
- Removed old "Refresh creates a new short URL" helper text

**`src/pages/AdminEventForm.tsx`:**
- Replaced `shortShareRefreshing` state with `shortUrlEnabled` (default: true) + `shortUrlToggling`
- Hydrates `shortShareCode` and `shortUrlEnabled` from `data.short_url_code`/`data.short_url_enabled` on edit load (now available from updated RPC)
- useEffect skips ensure call if code already hydrated
- `shortEventUrl` memo returns '' when `!shortUrlEnabled`
- Removed `refreshShortShareUrl` callback; replaced with `handleToggleShortUrl(enable: boolean)`
- Share panel Short URL section: same Refresh → Enable/Disable toggle UX as activities

**`src/pages/ActivityDetail.tsx`:**
- `handleShareActivity` now checks `activityDetail.short_url_enabled !== false` before using short URL; falls back to full slug URL when disabled

### Files touched

- `supabase/migrations/20260520100000_short_url_enable_disable_089.sql` (new)
- `src/lib/supabase.ts`
- `src/pages/AdminActivityForm.tsx`
- `src/pages/AdminEventForm.tsx`
- `src/pages/ActivityDetail.tsx`

### Validation

- `npm run lint` PASS (0 errors / 3 expected shadcn warnings)
- `npm run build` PASS
- `npm run test:e2e:phase1:local` PASS (3 passed / 12 skipped)

### Runtime/deploy status

**All applied. Runtime-closed 2026-05-20.**

```
supabase db push --linked
→ 20260520090000_activities_short_share_url_088.sql — OK
→ 20260520100000_short_url_enable_disable_089.sql — OK
```

```
supabase functions deploy draft-activity-content — deployed successfully
```

### Runtime probe evidence

All 10 probes PASS:

| Probe | Target | Result |
|-------|--------|--------|
| A | Activity schema: `short_url_code='ydjjzdw'`, `short_url_enabled=true` | ✓ |
| B | Event schema: `short_url_code='rxzufva'`, `short_url_enabled=true` | ✓ |
| C | Disable activity: `set_activity_short_url_enabled_with_session(...,false)` → `{success:true, short_url_enabled:false}` | ✓ |
| C | Resolve disabled: `resolve_activity_short_url('ydjjzdw')` → `{error_code:'short_url_disabled'}` | ✓ |
| C | Disable event: `set_event_short_url_enabled_with_session(...,false)` → `{success:true, short_url_enabled:false}` | ✓ |
| C | Resolve disabled event: `resolve_event_short_url('rxzufva')` → `{error_code:'short_url_disabled'}` | ✓ |
| D | Re-enable activity: same code `ydjjzdw` preserved (no regeneration); resolver resolves slug correctly | ✓ |
| D | Re-enable event: same code `rxzufva` preserved; resolver resolves slug correctly | ✓ |
| E | Refresh neutered (activity): `refresh_activity_short_url_with_session(...)` → `{error_code:'short_url_refresh_disabled'}` | ✓ |
| E | Refresh neutered (event): `refresh_event_short_url_with_session(...)` → `{error_code:'short_url_refresh_disabled'}` | ✓ |

## Previously closed: COD-ACTIVITIES-SHORT-SHARE-URL-088

Full notes for 088 are rolled into 089 above. Core of 088: activity `short_url_code`+`share_message` schema, `/a/:code` redirect route, admin share panel (AdminActivityForm), public Share button (ActivityDetail), `draft_share` edge function mode.

## Next

Deferred Ready items in `TASK_BOARD.md`:
- `COD-ACTIVITIES-AI-EXCERPT-DESCRIPTION-DISTINCT-090` — pending solution review before implementation
- `COD-MSME-SHOWCASE-001`, `COD-MSME-ISSUES-001`, `COD-PUBLIC-001`, `COD-MEMBERS-EXPORT-002` — gated on product decisions
