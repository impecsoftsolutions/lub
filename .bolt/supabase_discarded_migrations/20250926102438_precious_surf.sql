/*
  # Fix member_lub_roles UNIQUE constraint

  This migration fixes the UNIQUE constraint on member_lub_roles table by:
  1. Dropping any existing bad constraint that might contain COALESCE
  2. Adding the correct UNIQUE constraint on raw columns only
  
  ## Changes
  - Drop any existing uniqueness constraint on member_lub_roles
  - Add proper UNIQUE constraint: (member_id, role_id, level, state, district)
  - No functions or expressions in the constraint
*/

-- Create the table if it doesn't exist (idempotent)
CREATE TABLE IF NOT EXISTS member_lub_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL,
  role_id uuid NOT NULL,
  level text NOT NULL,
  state text,
  district text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create the ENUM type if it doesn't exist
DO $$ BEGIN
  CREATE TYPE role_level AS ENUM ('National', 'State', 'District', 'City');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Alter the level column to use the enum if it's not already
DO $$ BEGIN
  ALTER TABLE member_lub_roles ALTER COLUMN level TYPE role_level USING level::role_level;
EXCEPTION
  WHEN OTHERS THEN null;
END $$;

-- Add foreign key constraints if they don't exist
DO $$ BEGIN
  ALTER TABLE member_lub_roles ADD CONSTRAINT fk_member_lub_roles_member 
    FOREIGN KEY (member_id) REFERENCES member_registrations(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE member_lub_roles ADD CONSTRAINT fk_member_lub_roles_role 
    FOREIGN KEY (role_id) REFERENCES lub_roles_master(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Drop any existing uniqueness constraints that might be problematic
DROP CONSTRAINT IF EXISTS member_lub_roles_member_id_role_id_level_state_district_key CASCADE;
DROP CONSTRAINT IF EXISTS uq_member_role_assignment CASCADE;
DROP CONSTRAINT IF EXISTS unique_member_role_scope CASCADE;

-- Add the correct UNIQUE constraint on raw columns only
ALTER TABLE member_lub_roles 
ADD CONSTRAINT uq_member_lub_role_scope 
UNIQUE (member_id, role_id, level, state, district);

-- Add CHECK constraint for level-specific requirements
DO $$ BEGIN
  ALTER TABLE member_lub_roles ADD CONSTRAINT chk_member_lub_roles_level_requirements
  CHECK (
    (level = 'National') OR
    (level = 'State' AND state IS NOT NULL) OR
    (level IN ('District', 'City') AND state IS NOT NULL AND district IS NOT NULL)
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Enable RLS if not already enabled
ALTER TABLE member_lub_roles ENABLE ROW LEVEL SECURITY;

-- Create RLS policies if they don't exist
DO $$ BEGIN
  CREATE POLICY "Allow authenticated users to read member LUB roles"
    ON member_lub_roles FOR SELECT
    TO authenticated
    USING (true);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "Allow admin users to manage member LUB roles"
    ON member_lub_roles FOR ALL
    TO authenticated
    USING (check_user_permission(state, district))
    WITH CHECK (check_user_permission(state, district));
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_member_lub_roles_member_id ON member_lub_roles(member_id);
CREATE INDEX IF NOT EXISTS idx_member_lub_roles_role_id ON member_lub_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_member_lub_roles_level ON member_lub_roles(level);
CREATE INDEX IF NOT EXISTS idx_member_lub_roles_state ON member_lub_roles(state);
CREATE INDEX IF NOT EXISTS idx_member_lub_roles_district ON member_lub_roles(district);

-- Create trigger for updated_at if it doesn't exist
CREATE OR REPLACE FUNCTION update_member_lub_roles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_member_lub_roles_updated_at ON member_lub_roles;
CREATE TRIGGER trg_member_lub_roles_updated_at
  BEFORE UPDATE ON member_lub_roles
  FOR EACH ROW
  EXECUTE FUNCTION update_member_lub_roles_updated_at();