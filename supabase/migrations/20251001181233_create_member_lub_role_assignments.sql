/*
  # Create member_lub_role_assignments table

  1. New Tables
    - `member_lub_role_assignments`
      - `id` (uuid, primary key)
      - `member_id` (uuid, foreign key to member_registrations)
      - `role_id` (uuid, foreign key to lub_roles_master) - renamed from lub_role_id for consistency
      - `level` (text, organizational level: national, state, district, city)
      - `state` (text, optional - required for state/district/city levels)
      - `district` (text, optional - required for district/city levels)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on `member_lub_role_assignments` table
    - Add policy for authenticated users to read all assignments
    - Add policy for authenticated users to manage assignments

  3. Constraints
    - Unique constraint on member_id + role_id + level + state + district combination
    - Check constraint for valid level values
    - Foreign key constraints for member_id and role_id

  4. Indexes
    - Index on member_id for efficient member lookup
    - Index on role_id for efficient role lookup
    - Index on level for filtering by organizational level
*/

-- Create member_lub_role_assignments table
CREATE TABLE IF NOT EXISTS member_lub_role_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL,
  role_id uuid NOT NULL,
  level text NOT NULL CHECK (level IN ('national', 'state', 'district', 'city')),
  state text,
  district text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT fk_member_lub_assignments_member 
    FOREIGN KEY (member_id) 
    REFERENCES member_registrations(id) 
    ON DELETE CASCADE,
  CONSTRAINT fk_member_lub_assignments_role 
    FOREIGN KEY (role_id) 
    REFERENCES lub_roles_master(id) 
    ON DELETE CASCADE,
  CONSTRAINT unique_member_role_assignment 
    UNIQUE (member_id, role_id, level, state, district)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_member_lub_assignments_member_id 
  ON member_lub_role_assignments(member_id);

CREATE INDEX IF NOT EXISTS idx_member_lub_assignments_role_id 
  ON member_lub_role_assignments(role_id);

CREATE INDEX IF NOT EXISTS idx_member_lub_assignments_level 
  ON member_lub_role_assignments(level);

-- Enable RLS
ALTER TABLE member_lub_role_assignments ENABLE ROW LEVEL SECURITY;

-- Policy for authenticated users to read all assignments
CREATE POLICY "Authenticated users can read all member LUB role assignments"
  ON member_lub_role_assignments
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy for authenticated users to manage assignments
CREATE POLICY "Authenticated users can manage member LUB role assignments"
  ON member_lub_role_assignments
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_member_lub_assignments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER update_member_lub_assignments_updated_at_trigger
  BEFORE UPDATE ON member_lub_role_assignments
  FOR EACH ROW
  EXECUTE FUNCTION update_member_lub_assignments_updated_at();