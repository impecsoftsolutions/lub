/*
  # Mark Existing Members as Legacy

  1. Changes
    - Mark all existing members (created before this migration) as legacy members
    - Sets is_legacy_member = true for all members created before migration timestamp
    - Approximately 144 members will be marked as legacy

  2. Purpose
    - Preserve existing members imported from the old system
    - Allow these members to maintain duplicate emails/mobile numbers
    - Establish clear cutoff between legacy and new registrations

  3. Important
    - This migration captures the current timestamp and marks all members before it
    - After this migration, all NEW registrations will have is_legacy_member = false
    - Legacy status should not be changed except by super admins
*/

-- Mark all existing members as legacy
-- This uses the migration execution time as the cutoff
UPDATE member_registrations
SET is_legacy_member = true
WHERE created_at < NOW()
  AND is_legacy_member = false;

-- Log the number of members marked as legacy
DO $$
DECLARE
  legacy_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO legacy_count
  FROM member_registrations
  WHERE is_legacy_member = true;

  RAISE NOTICE 'Marked % members as legacy', legacy_count;
END $$;
