/*
  # Add is_legacy_member Column to member_registrations

  1. New Columns
    - `is_legacy_member` (boolean, default false, not null)
      - Marks members imported from the old system
      - Legacy members are exempt from uniqueness constraints on email and mobile
      - Allows preserving historical data with duplicates

  2. Purpose
    - Differentiate between legacy imported members and new registrations
    - Enable partial unique constraints that only apply to non-legacy members
    - Maintain data integrity while respecting historical data

  3. Notes
    - All existing members will be marked as legacy in a separate migration
    - New members registering through the website will have is_legacy_member = false
    - This field should not be editable by users, only by super admins
*/

-- Add is_legacy_member column with default false
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'member_registrations' AND column_name = 'is_legacy_member'
  ) THEN
    ALTER TABLE member_registrations
    ADD COLUMN is_legacy_member boolean DEFAULT false NOT NULL;
  END IF;
END $$;

-- Add index for efficient queries on is_legacy_member
CREATE INDEX IF NOT EXISTS idx_member_registrations_is_legacy_member
ON member_registrations(is_legacy_member);

-- Add comment explaining the purpose of this field
COMMENT ON COLUMN member_registrations.is_legacy_member IS
  'Indicates if this member was imported from the old system. Legacy members are exempt from unique email/mobile constraints.';
