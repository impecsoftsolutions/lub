/*
  # Create User Accounts for Legacy Members

  1. Purpose
    - Create user accounts for 144 legacy members
    - Set password_hash to PENDING_FIRST_LOGIN
    - Link to member_registrations later via user_id

  2. Process
    - Find all members without user_id (legacy members)
    - Create user records with account_type = 'member'
    - Generate new UUIDs for user accounts
    - Store mapping for later foreign key updates

  3. Security
    - Members must verify identity on first login
    - Password set after security question verification
*/

-- Create temporary table to store old member IDs and new user IDs
CREATE TEMP TABLE member_user_mapping (
  member_id uuid,
  new_user_id uuid,
  email text,
  mobile_number text
);

-- Insert user accounts for legacy members
WITH legacy_members AS (
  SELECT
    id as member_id,
    email,
    mobile_number,
    full_name,
    created_at
  FROM member_registrations
  WHERE user_id IS NULL
    AND is_legacy_member = true
    AND email IS NOT NULL
    AND email != ''
)
INSERT INTO users (
  id,
  email,
  mobile_number,
  password_hash,
  email_verified,
  mobile_verified,
  account_type,
  account_status,
  is_active,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(), -- Generate new UUID for user
  lm.email,
  lm.mobile_number,
  'PENDING_FIRST_LOGIN', -- Special marker for first-time login
  false, -- Email not verified yet
  false, -- Mobile not verified yet
  'member',
  'password_pending',
  true,
  lm.created_at,
  now()
FROM legacy_members lm
WHERE NOT EXISTS (
  -- Avoid duplicates based on email
  SELECT 1 FROM users u WHERE u.email = lm.email
)
RETURNING id, email, mobile_number;

-- Store mapping for later use
INSERT INTO member_user_mapping (member_id, new_user_id, email, mobile_number)
SELECT
  mr.id,
  u.id,
  u.email,
  u.mobile_number
FROM member_registrations mr
INNER JOIN users u ON u.email = mr.email
WHERE mr.user_id IS NULL
  AND mr.is_legacy_member = true
  AND u.password_hash = 'PENDING_FIRST_LOGIN';

-- Log migration results
DO $$
DECLARE
  member_count integer;
BEGIN
  SELECT COUNT(*) INTO member_count FROM users WHERE password_hash = 'PENDING_FIRST_LOGIN';
  RAISE NOTICE 'Created user accounts for % legacy members', member_count;
  RAISE NOTICE 'Members will set passwords on first login after security verification';
END $$;

-- Keep mapping table for next migration
-- (Will be used in Migration 4 to update foreign keys)
