/*
  # Add user_id Column to member_registrations

  1. New Columns
    - `user_id` (uuid, nullable, foreign key to auth.users)
      - Links member registration to Supabase auth account
      - Nullable to support existing members without auth accounts
      - Enables member login and dashboard access

  2. Purpose
    - Connect member registrations with authentication system
    - Enable members to login and view their application status
    - Support member profile management and re-applications

  3. Security
    - Foreign key constraint ensures data integrity
    - RLS policies control access based on user_id
*/

-- Add user_id column with foreign key constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'member_registrations' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE member_registrations
    ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add index for efficient user_id lookups
CREATE INDEX IF NOT EXISTS idx_member_registrations_user_id
ON member_registrations(user_id);

-- Add comment explaining the purpose
COMMENT ON COLUMN member_registrations.user_id IS
  'Links this registration to a Supabase auth user account. Enables member login and dashboard access.';
