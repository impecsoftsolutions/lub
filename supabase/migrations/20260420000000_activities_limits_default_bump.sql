-- =============================================================================
-- Migration: Bump activities max_gallery_images default seed value 10 -> 20
-- Slice: COD-ACTIVITIES-LIMITS-001 (CLAUDE-ACTIVITIES-BATCH-001)
-- =============================================================================
--
-- Background:
--   activity_settings was seeded by 20260418100000_activities_cms_foundation.sql
--   with max_gallery_images='10'. Product direction now raises the default to 20
--   so admins have headroom when uploading multi-file gallery sets.
--
-- Safety:
--   - Conditional UPDATE: only bump if the live value is still the seeded default
--     '10'. Any operator who has already manually customised this value (any
--     non-'10' value) is left untouched.
--   - Idempotent: re-running this migration after the bump is a no-op.
--   - No schema change. No RPC change. No permission change.
-- =============================================================================

UPDATE public.activity_settings
SET value      = '20',
    updated_at = NOW()
WHERE key = 'max_gallery_images'
  AND value = '10';

-- Verification (read-only)
SELECT key, value
FROM public.activity_settings
WHERE key IN ('max_gallery_images', 'max_youtube_links')
ORDER BY key;
