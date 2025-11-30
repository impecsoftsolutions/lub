/*
  # Add yogish@gmail.com as Super Admin

  1. Changes
    - Adds yogish@gmail.com to portal_super_admins table
    - This grants super admin privileges to this email address
    - User will need to sign up/login with this email to access admin dashboard

  2. Security
    - Email is added to the super admin whitelist
    - Once user signs up with this email, they automatically get super admin access
    - They can then manage the system, including other admin users
*/

-- Add yogish@gmail.com to portal_super_admins table
INSERT INTO portal_super_admins (email)
VALUES ('yogish@gmail.com')
ON CONFLICT (email) DO NOTHING;

-- If the user already exists in auth.users, add their role
-- Otherwise, this will be added automatically when they sign up
DO $$
DECLARE
    admin_user_id uuid;
BEGIN
    -- Check if user exists in auth.users
    SELECT id INTO admin_user_id
    FROM auth.users
    WHERE email = 'yogish@gmail.com';

    -- If user exists, add their super_admin role
    IF admin_user_id IS NOT NULL THEN
        INSERT INTO user_roles (user_id, role, state, district, is_member_linked)
        VALUES (admin_user_id, 'super_admin', NULL, NULL, false)
        ON CONFLICT (user_id, role, COALESCE(state, ''), COALESCE(district, ''))
        DO NOTHING;

        RAISE NOTICE 'Super admin role assigned to existing user: %', admin_user_id;
    ELSE
        RAISE NOTICE 'User yogish@gmail.com will get super admin access when they sign up';
    END IF;
END $$;
