/*
  # Add is_legacy_member Column to deleted_members

  1. New Columns
    - `is_legacy_member` (boolean, default false, not null)
      - Maintains consistency with member_registrations table
      - Preserves legacy status when members are soft-deleted
      - Essential for complete audit trail

  2. Purpose
    - Ensure deleted_members table mirrors member_registrations structure
    - Preserve legacy member flag for historical tracking
    - Maintain data integrity across active and deleted records

  3. Notes
    - This field should be copied from member_registrations during soft delete
    - Allows proper restoration of legacy status if member is undeleted
*/

-- Add is_legacy_member column with default false
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deleted_members' AND column_name = 'is_legacy_member'
  ) THEN
    ALTER TABLE deleted_members
    ADD COLUMN is_legacy_member boolean DEFAULT false NOT NULL;
  END IF;
END $$;

-- Add index for efficient queries on is_legacy_member
CREATE INDEX IF NOT EXISTS idx_deleted_members_is_legacy_member
ON deleted_members(is_legacy_member);

-- Add comment explaining the purpose of this field
COMMENT ON COLUMN deleted_members.is_legacy_member IS
  'Indicates if this member was imported from the old system. Preserved from member_registrations during soft delete.';
