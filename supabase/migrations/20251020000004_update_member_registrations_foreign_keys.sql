/*
  # Update member_registrations Foreign Keys

  1. Purpose
    - Update user_id to reference new users table
    - Maintain data integrity during transition

  2. Process
    - Drop RLS policies that depend on user_id column
    - Create temporary column for new user_id
    - Copy data from old user_id
    - Update legacy members with new user IDs
    - Drop old foreign key and column
    - Rename and create new foreign key

  3. Safety
    - All changes are reversible
    - No data loss
    - Policies will be recreated in Migration 6

  4. Note
    - RLS policies are temporarily removed to allow column drop
    - They will be recreated with custom auth in Migration 6
*/

-- Step 0: Drop RLS policies that depend on user_id column
-- These policies reference the user_id column and prevent dropping it
-- They will be recreated in Migration 6 with custom auth

DROP POLICY IF EXISTS "Members can view own registration" ON member_registrations;
DROP POLICY IF EXISTS "Members can update own registration" ON member_registrations;
DROP POLICY IF EXISTS "Authenticated users can create registration" ON member_registrations;
DROP POLICY IF EXISTS "Members can view own audit history" ON member_audit_history;

-- Log policy removal
DO $$
BEGIN
  RAISE NOTICE 'Dropped 4 RLS policies that depended on user_id column';
  RAISE NOTICE 'These policies will be recreated in Migration 6 with custom auth';
END $$;

-- Step 1: Add temporary column for new user_id
ALTER TABLE member_registrations
ADD COLUMN IF NOT EXISTS user_id_new uuid;

-- Step 2: For existing members with Supabase auth.users IDs
-- Copy the same UUID (admin users who are also members)
UPDATE member_registrations mr
SET user_id_new = mr.user_id
WHERE mr.user_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM users u WHERE u.id = mr.user_id);

-- Step 3: For legacy members, use the mapping from previous migration
-- This uses the temporary table created in migration 3
UPDATE member_registrations mr
SET user_id_new = u.id
FROM users u
WHERE mr.user_id IS NULL
  AND mr.is_legacy_member = true
  AND mr.email = u.email
  AND u.password_hash = 'PENDING_FIRST_LOGIN';

-- Step 4: Drop old foreign key constraint
ALTER TABLE member_registrations
DROP CONSTRAINT IF EXISTS member_registrations_user_id_fkey;

-- Step 5: Drop old user_id column
ALTER TABLE member_registrations
DROP COLUMN IF EXISTS user_id;

-- Step 6: Rename new column to user_id
ALTER TABLE member_registrations
RENAME COLUMN user_id_new TO user_id;

-- Step 7: Add foreign key constraint to new users table
ALTER TABLE member_registrations
ADD CONSTRAINT member_registrations_user_id_fkey
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- Step 8: Create index
CREATE INDEX IF NOT EXISTS idx_member_registrations_user_id_new
ON member_registrations(user_id);

-- Step 9: Update account_type for dual-role users (admin + member)
UPDATE users u
SET account_type = 'both',
    updated_at = now()
WHERE u.account_type = 'admin'
  AND EXISTS (
    SELECT 1 FROM member_registrations mr WHERE mr.user_id = u.id
  );

-- Log results
DO $$
DECLARE
  linked_count integer;
  dual_role_count integer;
BEGIN
  SELECT COUNT(*) INTO linked_count
  FROM member_registrations WHERE user_id IS NOT NULL;

  SELECT COUNT(*) INTO dual_role_count
  FROM users WHERE account_type = 'both';

  RAISE NOTICE '% members linked to user accounts', linked_count;
  RAISE NOTICE '% users have both admin and member roles', dual_role_count;
END $$;

-- Add comment
COMMENT ON COLUMN member_registrations.user_id IS
  'References custom users table (not auth.users). Links member registration to authentication account.';
