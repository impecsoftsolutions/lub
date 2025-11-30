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
    - Add policy for super_admin bypass

  3. Constraints
    - Unique constraint on (member_id, role_id, level, state, district)
    - Check constraints for level-specific requirements
*/

-- Create enum for role levels
CREATE TYPE lub_role_level AS ENUM ('National', 'State', 'District', 'City');

-- Create member_lub_roles table
CREATE TABLE IF NOT EXISTS member_lub_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES member_registrations(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES lub_roles_master(id) ON DELETE RESTRICT,
  level lub_role_level NOT NULL,
  state text,
  district text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Simple UNIQUE constraint without functions
  UNIQUE (member_id, role_id, level, state, district),
  
  -- Check constraints for level-specific requirements
  CONSTRAINT state_required_for_state_level 
    CHECK (level != 'State' OR state IS NOT NULL),
  CONSTRAINT district_required_for_district_level 
    CHECK (level != 'District' OR (state IS NOT NULL AND district IS NOT NULL)),
  CONSTRAINT city_required_for_city_level 
    CHECK (level != 'City' OR (state IS NOT NULL AND district IS NOT NULL))
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_member_lub_roles_member_id ON member_lub_roles(member_id);
CREATE INDEX IF NOT EXISTS idx_member_lub_roles_role_id ON member_lub_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_member_lub_roles_level ON member_lub_roles(level);
CREATE INDEX IF NOT EXISTS idx_member_lub_roles_state ON member_lub_roles(state);
CREATE INDEX IF NOT EXISTS idx_member_lub_roles_district ON member_lub_roles(district);

-- Create updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_member_lub_roles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER update_member_lub_roles_updated_at_trigger
  BEFORE UPDATE ON member_lub_roles
  FOR EACH ROW
  EXECUTE FUNCTION update_member_lub_roles_updated_at();

-- Enable Row Level Security
ALTER TABLE member_lub_roles ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to read all member LUB roles
CREATE POLICY "Allow authenticated users to read member LUB roles"
  ON member_lub_roles
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Allow authenticated users with geographic permissions to manage roles
CREATE POLICY "Allow geographic role management"
  ON member_lub_roles
  FOR ALL
  TO authenticated
  USING (check_user_permission(state, district))
  WITH CHECK (check_user_permission(state, district));

-- Policy: Allow super_admin to manage all roles
CREATE POLICY "Allow super_admin full access to member LUB roles"
  ON member_lub_roles
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'super_admin'
    )
  );