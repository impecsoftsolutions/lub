/*
  # Add Member ID Column for Certificate Numbers

  ## Overview
  Adds an admin-only member_id field to store certificate numbers manually entered by admins.

  ## Changes

  1. Schema Changes
    - Add `member_id` column to `member_registrations` table
      - Type: TEXT (allows flexible ID formats)
      - Nullable: YES (optional field)
      - Unique: YES (no duplicate certificate numbers)
    - Add `member_id` column to `deleted_members` table
      - Maintains consistency when members are archived
    - Create index for efficient searching and uniqueness checking

  2. Important Notes
    - Member IDs are certificate numbers printed on official certificates
    - Only admins can view and edit this field
    - Each member must have a unique ID (if set)
    - Field is optional - not all members may have IDs yet
    - Changes are tracked in audit history
*/

-- Add member_id column to member_registrations table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'member_registrations' AND column_name = 'member_id'
  ) THEN
    ALTER TABLE member_registrations
    ADD COLUMN member_id TEXT NULL UNIQUE;
  END IF;
END $$;

-- Add member_id column to deleted_members table for consistency
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deleted_members' AND column_name = 'member_id'
  ) THEN
    ALTER TABLE deleted_members
    ADD COLUMN member_id TEXT NULL;
  END IF;
END $$;

-- Create index for efficient searching
CREATE INDEX IF NOT EXISTS idx_member_registrations_member_id
  ON member_registrations(member_id)
  WHERE member_id IS NOT NULL;

-- Add comment to document the field
COMMENT ON COLUMN member_registrations.member_id IS
  'Admin-only field for certificate number. Must be unique if set. Only visible to admins.';
