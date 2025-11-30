/*
  # Migrate Admin Users from Supabase Auth

  1. Purpose
    - Extract existing admin users from auth.users
    - Create corresponding records in custom users table
    - Preserve user IDs for foreign key consistency

  2. Process
    - Find all users who have roles in user_roles table
    - Create user records with account_type = 'admin'
    - Set password_hash to trigger password reset
    - Mark accounts for password reset

  3. Notes
    - Admin users will need to reset their passwords
    - Email notifications should be sent separately
*/

-- Insert admin users from auth.users into custom users table
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
SELECT DISTINCT
  au.id,
  au.email,
  NULL, -- Admins don't have mobile numbers
  'PENDING_PASSWORD_RESET', -- Special marker for password reset required
  true, -- Email is verified in Supabase Auth
  false,
  'admin', -- Will be updated to 'both' if they're also members
  'password_pending',
  true,
  au.created_at,
  now()
FROM auth.users au
INNER JOIN user_roles ur ON ur.user_id = au.id
WHERE NOT EXISTS (
  -- Avoid duplicates if migration is run multiple times
  SELECT 1 FROM users u WHERE u.id = au.id
);

-- Log migration results
DO $$
DECLARE
  migrated_count integer;
BEGIN
  SELECT COUNT(*) INTO migrated_count FROM users WHERE password_hash = 'PENDING_PASSWORD_RESET';
  RAISE NOTICE 'Migrated % admin users from Supabase Auth', migrated_count;
END $$;

-- Add comment
COMMENT ON TABLE users IS
  'Unified authentication table. Admin users migrated from auth.users need password reset.';
