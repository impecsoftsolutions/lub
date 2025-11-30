/*
  # Create User Roles System

  1. New Tables
    - `user_roles`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `role` (text, role type)
      - `state` (text, nullable for state-level roles)
      - `district` (text, nullable for district-level roles)
      - `is_member_linked` (boolean, if user is also a LUB member)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on `user_roles` table
    - Add policies for role-based access control
    - Add constraints for valid roles and geographic scope

  3. Functions
    - Helper functions for role checking and access control
*/

-- Create user_roles table
CREATE TABLE IF NOT EXISTS user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL,
  state text,
  district text,
  is_member_linked boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add constraints for valid roles
ALTER TABLE user_roles ADD CONSTRAINT valid_roles 
CHECK (role IN (
  'super_admin',
  'state_president', 
  'state_general_secretary',
  'district_president',
  'district_general_secretary', 
  'it_division_head',
  'accounts_head'
));

-- Add constraint to ensure state is provided for state-level roles
ALTER TABLE user_roles ADD CONSTRAINT state_required_for_state_roles
CHECK (
  (role IN ('state_president', 'state_general_secretary') AND state IS NOT NULL) OR
  (role NOT IN ('state_president', 'state_general_secretary'))
);

-- Add constraint to ensure district is provided for district-level roles
ALTER TABLE user_roles ADD CONSTRAINT district_required_for_district_roles
CHECK (
  (role IN ('district_president', 'district_general_secretary') AND district IS NOT NULL AND state IS NOT NULL) OR
  (role NOT IN ('district_president', 'district_general_secretary'))
);

-- Create unique constraint to prevent duplicate role assignments
CREATE UNIQUE INDEX IF NOT EXISTS unique_user_role_scope 
ON user_roles (user_id, role, COALESCE(state, ''), COALESCE(district, ''));

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles (user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles (role);
CREATE INDEX IF NOT EXISTS idx_user_roles_state ON user_roles (state);
CREATE INDEX IF NOT EXISTS idx_user_roles_district ON user_roles (district);

-- Enable RLS
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Super admins can see all roles
CREATE POLICY "Super admins can manage all user roles"
  ON user_roles
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur 
      WHERE ur.user_id = auth.uid() 
      AND ur.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur 
      WHERE ur.user_id = auth.uid() 
      AND ur.role = 'super_admin'
    )
  );

-- State-level admins can see roles in their state
CREATE POLICY "State admins can manage roles in their state"
  ON user_roles
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur 
      WHERE ur.user_id = auth.uid() 
      AND ur.role IN ('state_president', 'state_general_secretary')
      AND ur.state = user_roles.state
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur 
      WHERE ur.user_id = auth.uid() 
      AND ur.role IN ('state_president', 'state_general_secretary')
      AND ur.state = user_roles.state
    )
  );

-- Users can see their own roles
CREATE POLICY "Users can see their own roles"
  ON user_roles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Create helper function to check user permissions
CREATE OR REPLACE FUNCTION check_user_permission(
  target_state text DEFAULT NULL,
  target_district text DEFAULT NULL
) RETURNS boolean AS $$
DECLARE
  user_role_record RECORD;
BEGIN
  -- Get user's highest role
  SELECT role, state, district INTO user_role_record
  FROM user_roles 
  WHERE user_id = auth.uid()
  ORDER BY 
    CASE role
      WHEN 'super_admin' THEN 1
      WHEN 'state_president' THEN 2
      WHEN 'state_general_secretary' THEN 3
      WHEN 'district_president' THEN 4
      WHEN 'district_general_secretary' THEN 5
      WHEN 'it_division_head' THEN 6
      WHEN 'accounts_head' THEN 7
      ELSE 99
    END
  LIMIT 1;

  -- If no role found, deny access
  IF user_role_record IS NULL THEN
    RETURN false;
  END IF;

  -- Super admin has access to everything
  IF user_role_record.role = 'super_admin' THEN
    RETURN true;
  END IF;

  -- State-level roles can access their state
  IF user_role_record.role IN ('state_president', 'state_general_secretary') THEN
    RETURN user_role_record.state = target_state OR target_state IS NULL;
  END IF;

  -- District-level roles can access their district
  IF user_role_record.role IN ('district_president', 'district_general_secretary') THEN
    RETURN user_role_record.state = target_state AND user_role_record.district = target_district;
  END IF;

  -- IT Division and Accounts heads - check their specific permissions
  IF user_role_record.role IN ('it_division_head', 'accounts_head') THEN
    -- If they have state assigned, they can access that state
    IF user_role_record.state IS NOT NULL THEN
      RETURN user_role_record.state = target_state OR target_state IS NULL;
    END IF;
    -- If no state assigned, they have no geographic restrictions (super admin level)
    RETURN true;
  END IF;

  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update member_registrations RLS to use role-based access
DROP POLICY IF EXISTS "Allow authenticated read for member registrations" ON member_registrations;

CREATE POLICY "Role-based access for member registrations"
  ON member_registrations
  FOR SELECT
  TO authenticated
  USING (
    check_user_permission(state, district) OR
    -- Allow users to see their own registration
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- Allow role-based updates for member registrations
CREATE POLICY "Role-based updates for member registrations"
  ON member_registrations
  FOR UPDATE
  TO authenticated
  USING (check_user_permission(state, district))
  WITH CHECK (check_user_permission(state, district));