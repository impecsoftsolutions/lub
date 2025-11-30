/*
  # Create lub_roles_master table

  1. New Tables
    - `lub_roles_master`
      - `id` (uuid, primary key)
      - `role_name` (text, unique, not null)
      - `is_active` (boolean, default true)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on `lub_roles_master` table
    - Add policy for public to read active roles
    - Add policy for authenticated users to manage all roles
*/

CREATE TABLE IF NOT EXISTS lub_roles_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_name text UNIQUE NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE lub_roles_master ENABLE ROW LEVEL SECURITY;

-- Policy for public to read active roles (for dropdowns)
CREATE POLICY "Public can read active lub roles"
  ON lub_roles_master
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- Policy for authenticated users to read all roles
CREATE POLICY "Authenticated users can read all lub roles"
  ON lub_roles_master
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy for authenticated users to manage roles
CREATE POLICY "Authenticated users can manage lub roles"
  ON lub_roles_master
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_lub_roles_master_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER update_lub_roles_master_updated_at_trigger
  BEFORE UPDATE ON lub_roles_master
  FOR EACH ROW
  EXECUTE FUNCTION update_lub_roles_master_updated_at();