/*
  # Create lub_roles_master table

  1. New Tables
    - `lub_roles_master`
      - `id` (uuid, primary key, default gen_random_uuid())
      - `role_name` (text, unique, not null)
      - `is_active` (boolean, default true)
      - `created_at` (timestamp with timezone, default now())
      - `updated_at` (timestamp with timezone, default now())

  2. Security
    - Enable RLS on `lub_roles_master` table
    - Add policy for public SELECT access
    - Add policy for authenticated users to perform ALL actions

  3. Triggers
    - Add trigger to automatically update `updated_at` timestamp on row updates
*/

-- Create the lub_roles_master table
CREATE TABLE IF NOT EXISTS lub_roles_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_name text UNIQUE NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Create trigger function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_lub_roles_master_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'trg_lub_roles_master_updated'
  ) THEN
    CREATE TRIGGER trg_lub_roles_master_updated
      BEFORE UPDATE ON lub_roles_master
      FOR EACH ROW
      EXECUTE FUNCTION update_lub_roles_master_timestamp();
  END IF;
END $$;

-- Enable Row Level Security
ALTER TABLE lub_roles_master ENABLE ROW LEVEL SECURITY;

-- Policy: Public can SELECT (read)
CREATE POLICY IF NOT EXISTS "lub_roles_master_public_read"
  ON lub_roles_master
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Policy: Authenticated users can do ALL actions
CREATE POLICY IF NOT EXISTS "lub_roles_master_auth_all"
  ON lub_roles_master
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);