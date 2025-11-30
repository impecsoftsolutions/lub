/*
  # Create member_lub_roles table

  1. New Tables
    - `member_lub_roles`
      - `id` (uuid, primary key)
      - `member_id` (uuid, foreign key to member_registrations)
      - `role_id` (uuid, foreign key to lub_roles_master)
      - `level` (enum: National, State, District, City)
      - `state` (text, optional)
      - `district` (text, optional)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on `member_lub_roles` table
    - Add policies for authenticated users with geographic restrictions
    - Add super_admin bypass policy

  3. Constraints
    - UNIQUE constraint on (member_id, role_id, level, state, district)
    - CHECK constraints for level-specific requirements
*/

-- Create enum for role levels
CREATE TYPE role_level AS ENUM ('National', 'State', 'District', 'City');

-- Create member_lub_roles table
CREATE TABLE IF NOT EXISTS member_lub_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES member_registrations(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES lub_roles_master(id) ON DELETE CASCADE,
  level role_level NOT NULL,
  state text,
  district text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Simple UNIQUE constraint without any functions
  UNIQUE (member_id, role_id, level, state, district),
  
  -- CHECK constraints for level-specific requirements
  CHECK (
    (level = 'National') OR
    (level = 'State' AND state IS NOT NULL) OR
    (level IN ('District', 'City') AND state IS NOT NULL AND district IS NOT NULL)
  )
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_member_lub_roles_member_id ON member_lub_roles(member_id);
CREATE INDEX IF NOT EXISTS idx_member_lub_roles_role_id ON member_lub_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_member_lub_roles_level ON member_lub_roles(level);
CREATE INDEX IF NOT EXISTS idx_member_lub_roles_state ON member_lub_roles(state);
CREATE INDEX IF NOT EXISTS idx_member_lub_roles_district ON member_lub_roles(district);

-- Enable Row Level Security
ALTER TABLE member_lub_roles ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to read based on geographic permissions
CREATE POLICY "member_lub_roles_select" ON member_lub_roles
  FOR SELECT TO authenticated
  USING (
    -- Super admin can see everything
    EXISTS (
      SELECT 1 FROM user_roles ur 
      WHERE ur.user_id = auth.uid() 
      AND ur.role = 'super_admin'
    )
    OR
    -- Geographic permission check
    check_user_permission(state, district)
  );

-- Policy: Allow authenticated users to insert based on geographic permissions
CREATE POLICY "member_lub_roles_insert" ON member_lub_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    -- Super admin can insert anything
    EXISTS (
      SELECT 1 FROM user_roles ur 
      WHERE ur.user_id = auth.uid() 
      AND ur.role = 'super_admin'
    )
    OR
    -- Geographic permission check
    check_user_permission(state, district)
  );

-- Policy: Allow authenticated users to update based on geographic permissions
CREATE POLICY "member_lub_roles_update" ON member_lub_roles
  FOR UPDATE TO authenticated
  USING (
    -- Super admin can update anything
    EXISTS (
      SELECT 1 FROM user_roles ur 
      WHERE ur.user_id = auth.uid() 
      AND ur.role = 'super_admin'
    )
    OR
    -- Geographic permission check
    check_user_permission(state, district)
  )
  WITH CHECK (
    -- Super admin can update to anything
    EXISTS (
      SELECT 1 FROM user_roles ur 
      WHERE ur.user_id = auth.uid() 
      AND ur.role = 'super_admin'
    )
    OR
    -- Geographic permission check for new values
    check_user_permission(state, district)
  );

-- Policy: Allow authenticated users to delete based on geographic permissions
CREATE POLICY "member_lub_roles_delete" ON member_lub_roles
  FOR DELETE TO authenticated
  USING (
    -- Super admin can delete anything
    EXISTS (
      SELECT 1 FROM user_roles ur 
      WHERE ur.user_id = auth.uid() 
      AND ur.role = 'super_admin'
    )
    OR
    -- Geographic permission check
    check_user_permission(state, district)
  );

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_member_lub_roles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_member_lub_roles_updated_at_trigger
  BEFORE UPDATE ON member_lub_roles
  FOR EACH ROW
  EXECUTE FUNCTION update_member_lub_roles_updated_at();