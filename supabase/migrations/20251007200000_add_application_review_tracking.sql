/*
  # Add Application Review Tracking to member_registrations

  1. New Columns
    - `first_viewed_at` (timestamptz) - When admin first viewed the application
    - `first_viewed_by` (uuid) - Admin who first viewed the application
    - `reviewed_count` (integer) - Number of times application was viewed

  2. Purpose
    - Track when admins view pending applications
    - Enable analytics on review process
    - Identify applications that have been viewed but not actioned

  3. Default Values
    - All fields default to null for existing records
    - reviewed_count defaults to 0
*/

-- Add first_viewed_at column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'member_registrations' AND column_name = 'first_viewed_at'
  ) THEN
    ALTER TABLE member_registrations ADD COLUMN first_viewed_at timestamptz;
  END IF;
END $$;

-- Add first_viewed_by column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'member_registrations' AND column_name = 'first_viewed_by'
  ) THEN
    ALTER TABLE member_registrations ADD COLUMN first_viewed_by uuid;
  END IF;
END $$;

-- Add reviewed_count column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'member_registrations' AND column_name = 'reviewed_count'
  ) THEN
    ALTER TABLE member_registrations ADD COLUMN reviewed_count integer DEFAULT 0 NOT NULL;
  END IF;
END $$;

-- Add index for first_viewed_at for efficient queries
CREATE INDEX IF NOT EXISTS idx_member_registrations_first_viewed_at ON member_registrations(first_viewed_at);

-- Add index for reviewed applications queries
CREATE INDEX IF NOT EXISTS idx_member_registrations_reviewed_status ON member_registrations(status, first_viewed_at);
