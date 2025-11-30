/*
  # Add Member Management Columns to member_registrations

  1. New Columns
    - `is_active` (boolean) - Controls visibility in public directory
    - `deactivated_at` (timestamptz) - When member was deactivated
    - `deactivated_by` (uuid) - Admin who deactivated the member
    - `rejection_reason` (text) - Reason for rejection if status is rejected
    - `last_modified_by` (uuid) - Last admin who modified the record
    - `last_modified_at` (timestamptz) - Last modification timestamp

  2. Default Values
    - is_active defaults to true (all existing members remain active)
    - Other fields default to null

  3. Purpose
    - Enable show/hide functionality for members
    - Track rejection reasons for transparency
    - Maintain audit trail of modifications
*/

-- Add is_active column with default true
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'member_registrations' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE member_registrations ADD COLUMN is_active boolean DEFAULT true NOT NULL;
  END IF;
END $$;

-- Add deactivated_at column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'member_registrations' AND column_name = 'deactivated_at'
  ) THEN
    ALTER TABLE member_registrations ADD COLUMN deactivated_at timestamptz;
  END IF;
END $$;

-- Add deactivated_by column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'member_registrations' AND column_name = 'deactivated_by'
  ) THEN
    ALTER TABLE member_registrations ADD COLUMN deactivated_by uuid;
  END IF;
END $$;

-- Add rejection_reason column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'member_registrations' AND column_name = 'rejection_reason'
  ) THEN
    ALTER TABLE member_registrations ADD COLUMN rejection_reason text;
  END IF;
END $$;

-- Add last_modified_by column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'member_registrations' AND column_name = 'last_modified_by'
  ) THEN
    ALTER TABLE member_registrations ADD COLUMN last_modified_by uuid;
  END IF;
END $$;

-- Add last_modified_at column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'member_registrations' AND column_name = 'last_modified_at'
  ) THEN
    ALTER TABLE member_registrations ADD COLUMN last_modified_at timestamptz;
  END IF;
END $$;

-- Add index for is_active for efficient queries
CREATE INDEX IF NOT EXISTS idx_member_registrations_is_active ON member_registrations(is_active);
