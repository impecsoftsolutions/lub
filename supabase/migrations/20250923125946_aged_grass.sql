/*
  # Assign Super Admin Role to admin@lub.org.in

  1. Security
    - Find existing user by email in auth.users
    - Insert super_admin role into user_roles table
    - Set appropriate permissions for super admin access

  2. Changes
    - Assigns super_admin role to admin@lub.org.in
    - Ensures admin dashboard access is restored
    - Creates user_roles entry with proper configuration
*/

-- Find the user ID for admin@lub.org.in and insert super admin role
DO $$
DECLARE
    admin_user_id uuid;
BEGIN
    -- Get the user ID for admin@lub.org.in from auth.users
    SELECT id INTO admin_user_id 
    FROM auth.users 
    WHERE email = 'admin@lub.org.in';
    
    -- Check if user exists
    IF admin_user_id IS NOT NULL THEN
        -- Insert super admin role if it doesn't already exist
        INSERT INTO user_roles (user_id, role, state, district, is_member_linked)
        VALUES (admin_user_id, 'super_admin', NULL, NULL, false)
        ON CONFLICT (user_id, role, COALESCE(state, ''), COALESCE(district, '')) 
        DO NOTHING;
        
        RAISE NOTICE 'Super admin role assigned to user: %', admin_user_id;
    ELSE
        RAISE NOTICE 'User with email admin@lub.org.in not found in auth.users table';
    END IF;
END $$;