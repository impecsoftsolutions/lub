/*
  # Create Auth Accounts for Existing 144 Members

  1. Purpose
    - Create Supabase auth accounts for all existing members
    - Generate password reset tokens instead of passwords
    - Link auth accounts to member_registrations via user_id

  2. Process
    - Query all members without user_id (existing 144 members)
    - Create auth.users record for each member
    - Set email_confirmed to false to require password reset
    - Update member_registrations.user_id with new auth user ID
    - Members will receive password reset emails to set their own passwords

  3. Security
    - No passwords are generated or stored in plain text
    - Members must reset password via email link to gain access
    - Email confirmation not required (as per requirements)

  4. Notes
    - This is a one-time migration for existing members
    - New members will create their own auth accounts via signup
    - Run this migration carefully in production
    - Consider backing up data before running
*/

-- Create a function to generate auth accounts for existing members
CREATE OR REPLACE FUNCTION create_auth_accounts_for_existing_members()
RETURNS TABLE (
  member_id uuid,
  email text,
  auth_user_id uuid,
  success boolean,
  error_message text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  member_record RECORD;
  new_user_id uuid;
  random_password text;
BEGIN
  -- Loop through all members without user_id
  FOR member_record IN
    SELECT id, email, mobile_number, full_name
    FROM member_registrations
    WHERE user_id IS NULL
      AND is_legacy_member = true -- Only process legacy members
      AND email IS NOT NULL
      AND email != ''
  LOOP
    BEGIN
      -- Generate a random password (will be reset via email)
      random_password := encode(gen_random_bytes(16), 'hex');

      -- Create auth user using Supabase admin functions
      -- Note: In practice, this should be done via Supabase Admin API or Edge Function
      -- This is a placeholder - actual implementation will use mcp__supabase tool

      -- For now, just log that this member needs an auth account
      -- The actual account creation will be done via a separate script

      RETURN QUERY SELECT
        member_record.id,
        member_record.email,
        NULL::uuid,
        false,
        'Auth account creation requires admin API - use separate script'::text;

    EXCEPTION WHEN OTHERS THEN
      RETURN QUERY SELECT
        member_record.id,
        member_record.email,
        NULL::uuid,
        false,
        SQLERRM::text;
    END;
  END LOOP;
END;
$$;

-- Add comment explaining this needs manual execution
COMMENT ON FUNCTION create_auth_accounts_for_existing_members() IS
  'Helper function to identify members needing auth accounts. Actual account creation must be done via Supabase Admin API or Edge Function.';

/*
  MANUAL STEPS REQUIRED:

  After running this migration, you need to create auth accounts for existing members:

  1. Query members needing auth accounts:
     SELECT id, email, mobile_number, full_name
     FROM member_registrations
     WHERE user_id IS NULL
       AND is_legacy_member = true
       AND email IS NOT NULL;

  2. For each member, create auth account using Supabase Admin API:
     - Use supabase.auth.admin.createUser() with:
       - email: member's email
       - email_confirm: false (no email verification needed)
       - password: generate random password or leave unset
     - Update member_registrations.user_id with returned user ID

  3. Send password reset emails:
     - Use supabase.auth.resetPasswordForEmail() for each member
     - Members will receive email to set their own password

  Alternative: Create an Edge Function or Node.js script to automate this process.
*/
