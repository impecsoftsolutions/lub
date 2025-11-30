/*
  # Create member_lub_roles table

  1. New Tables
    - `member_lub_roles`
      - `id` (uuid, primary key)
      - `member_id` (uuid, references member_registrations.id)
      - `role_id` (uuid, references lub_roles_master.id)
      - `level` (text, check constraint for allowed values)
      - `state` (text, optional)
      - `district` (text, optional)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Constraints
    - Unique constraint on member_id, role_id, level, state, district
    - Check constraint for level values
    - Foreign key constraints with proper cascade rules

  3. Security
    - Enable RLS on `member_lub_roles` table
    - Add policy for authenticated users with permission check

  4. Triggers
    - Auto-update trigger for updated_at timestamp
*/

-- Create the member_lub_roles table
CREATE TABLE IF NOT EXISTS member_lub_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL,
  role_id uuid NOT NULL,
  level text NOT NULL,
  state text,
  district text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Foreign key constraints
  CONSTRAINT fk_member_lub_roles_member_id 
    FOREIGN KEY (member_id) 
    REFERENCES member_registrations(id) 
    ON DELETE CASCADE,
    
  CONSTRAINT fk_member_lub_roles_role_id 
    FOREIGN KEY (role_id) 
    REFERENCES lub_roles_master(id) 
    ON DELETE RESTRICT,
    
  -- Check constraint for allowed level values
  CONSTRAINT chk_member_lub_roles_level 
    CHECK (level IN ('National', 'State', 'District', 'City')),
    
  -- Unique constraint to prevent duplicate role assignments
  CONSTRAINT unique_member_role_assignment 
    UNIQUE (member_id, role_id, level, COALESCE(state, ''), COALESCE(district, ''))
);

-- Create trigger function for updating updated_at timestamp
CREATE OR REPLACE FUNCTION update_member_lub_roles_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'trg_member_lub_roles_updated'
  ) THEN
    CREATE TRIGGER trg_member_lub_roles_updated
      BEFORE UPDATE ON member_lub_roles
      FOR EACH ROW
      EXECUTE FUNCTION update_member_lub_roles_timestamp();
  END IF;
END $$;

-- Enable Row Level Security
ALTER TABLE member_lub_roles ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users with permission check
CREATE POLICY "member_lub_roles_auth_with_permission"
  ON member_lub_roles
  FOR ALL
  TO authenticated
  USING (check_user_permission(state, district))
  WITH CHECK (check_user_permission(state, district));