/*
  # Add Review Tracking and Profile Photo Columns to Deleted Members Table

  ## Overview
  Adds missing columns from member_registrations to deleted_members table to fix deletion errors.

  ## Problem
  The deleted_members table is missing columns that exist in member_registrations:
  - first_viewed_at (timestamptz) - When admin first viewed the application
  - first_viewed_by (uuid) - Admin who first viewed the application
  - reviewed_count (integer) - Number of times application was viewed
  - profile_photo_url (text) - URL to member's profile photo

  When attempting to delete a member, the softDeleteMember function tries to copy all fields
  from member_registrations to deleted_members, which fails with error:
  "Could not find the 'first_viewed_at' column of 'deleted_members' in the schema cache"

  ## Changes

  1. Schema Additions
    - Add `first_viewed_at` column (timestamptz, nullable)
    - Add `first_viewed_by` column (uuid, nullable)
    - Add `reviewed_count` column (integer, default 0, not null)
    - Add `profile_photo_url` column (text, nullable)

  2. Indexes
    - Create index on first_viewed_at for efficient queries
    - Matches indexes in member_registrations table

  3. Documentation
    - Add column comments explaining purpose and usage
    - Maintain consistency with member_registrations documentation

  ## Purpose
  - Enables successful soft delete operations without schema errors
  - Maintains complete data integrity when archiving members
  - Ensures deleted_members table structure matches member_registrations
  - Preserves application review tracking data in archived records

  ## Notes
  - Migration is idempotent and safe to run multiple times
  - All new columns are nullable except reviewed_count (defaults to 0)
  - Existing deleted_members records will have null values for review tracking fields
*/

-- Add first_viewed_at column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deleted_members' AND column_name = 'first_viewed_at'
  ) THEN
    ALTER TABLE deleted_members ADD COLUMN first_viewed_at timestamptz;
    COMMENT ON COLUMN deleted_members.first_viewed_at IS
      'Timestamp when an admin first viewed this member''s application. Nullable - may be null for members who were never viewed.';
  END IF;
END $$;

-- Add first_viewed_by column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deleted_members' AND column_name = 'first_viewed_by'
  ) THEN
    ALTER TABLE deleted_members ADD COLUMN first_viewed_by uuid;
    COMMENT ON COLUMN deleted_members.first_viewed_by IS
      'User ID of the admin who first viewed this member''s application. Nullable - may be null for members who were never viewed.';
  END IF;
END $$;

-- Add reviewed_count column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deleted_members' AND column_name = 'reviewed_count'
  ) THEN
    ALTER TABLE deleted_members ADD COLUMN reviewed_count integer DEFAULT 0 NOT NULL;
    COMMENT ON COLUMN deleted_members.reviewed_count IS
      'Number of times this member''s application was viewed by admins. Defaults to 0 for members who were never viewed.';
  END IF;
END $$;

-- Add profile_photo_url column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deleted_members' AND column_name = 'profile_photo_url'
  ) THEN
    ALTER TABLE deleted_members ADD COLUMN profile_photo_url text;
    COMMENT ON COLUMN deleted_members.profile_photo_url IS
      'URL to the member''s profile photo stored in Supabase storage. Nullable - not all members have profile photos.';
  END IF;
END $$;

-- Add index for first_viewed_at for efficient queries
CREATE INDEX IF NOT EXISTS idx_deleted_members_first_viewed_at
  ON deleted_members(first_viewed_at);

-- Add composite index for review status queries
CREATE INDEX IF NOT EXISTS idx_deleted_members_reviewed_status
  ON deleted_members(status, first_viewed_at);

-- Update table comment to reflect completeness
COMMENT ON TABLE deleted_members IS
  'Stores soft-deleted member records with complete data preservation. Schema matches member_registrations table including review tracking and profile photo fields to ensure accurate archival without data loss.';
