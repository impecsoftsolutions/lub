/*
  # Replace Unique Constraints with Partial Unique Indexes

  1. Changes
    - Drop existing unique_email and unique_mobile constraints
    - Create partial unique index on email (only for non-legacy members)
    - Create partial unique index on mobile_number (only for non-legacy members)

  2. Purpose
    - Allow legacy members (is_legacy_member = true) to have duplicate emails/mobiles
    - Enforce uniqueness only for new members (is_legacy_member = false)
    - Maintain data integrity for new registrations while preserving legacy data

  3. How Partial Indexes Work
    - Partial indexes include a WHERE clause that filters which rows are indexed
    - Only rows where is_legacy_member = false are included in the unique index
    - Legacy members (is_legacy_member = true) are excluded from the index
    - This allows duplicates for legacy members but prevents them for new members

  4. Security
    - Database-level enforcement ensures no application bugs can bypass this rule
    - Uniqueness is guaranteed at the lowest level (PostgreSQL)
    - Works regardless of how data is inserted (app, admin panel, direct SQL)
*/

-- Drop existing unique constraints if they exist
DO $$
BEGIN
  -- Drop unique_email constraint
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'unique_email'
    AND conrelid = 'member_registrations'::regclass
  ) THEN
    ALTER TABLE member_registrations DROP CONSTRAINT unique_email;
    RAISE NOTICE 'Dropped unique_email constraint';
  END IF;

  -- Drop unique_mobile constraint
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'unique_mobile'
    AND conrelid = 'member_registrations'::regclass
  ) THEN
    ALTER TABLE member_registrations DROP CONSTRAINT unique_mobile;
    RAISE NOTICE 'Dropped unique_mobile constraint';
  END IF;
END $$;

-- Create partial unique index on email for non-legacy members
-- This ensures only new members must have unique emails
CREATE UNIQUE INDEX IF NOT EXISTS idx_member_registrations_email_unique_non_legacy
ON member_registrations(email)
WHERE is_legacy_member = false;

-- Create partial unique index on mobile_number for non-legacy members
-- This ensures only new members must have unique mobile numbers
CREATE UNIQUE INDEX IF NOT EXISTS idx_member_registrations_mobile_unique_non_legacy
ON member_registrations(mobile_number)
WHERE is_legacy_member = false;

-- Add comments explaining these indexes
COMMENT ON INDEX idx_member_registrations_email_unique_non_legacy IS
  'Enforces unique email addresses for non-legacy members only. Legacy members can have duplicate emails.';

COMMENT ON INDEX idx_member_registrations_mobile_unique_non_legacy IS
  'Enforces unique mobile numbers for non-legacy members only. Legacy members can have duplicate mobile numbers.';

-- Log the change
DO $$
DECLARE
  legacy_count INTEGER;
  non_legacy_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO legacy_count
  FROM member_registrations
  WHERE is_legacy_member = true;

  SELECT COUNT(*) INTO non_legacy_count
  FROM member_registrations
  WHERE is_legacy_member = false;

  RAISE NOTICE 'Partial unique indexes created successfully';
  RAISE NOTICE 'Legacy members (exempt from uniqueness): %', legacy_count;
  RAISE NOTICE 'Non-legacy members (must be unique): %', non_legacy_count;
END $$;
