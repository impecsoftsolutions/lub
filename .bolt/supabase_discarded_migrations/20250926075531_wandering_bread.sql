/*
  # Create company_designations table

  1. New Tables
    - `company_designations`
      - `id` (uuid, primary key, default gen_random_uuid())
      - `designation_name` (text, unique, not null)
      - `is_active` (boolean, default true)
      - `created_at` (timestamp with timezone, default now())
      - `updated_at` (timestamp with timezone, default now())

  2. Security
    - Enable RLS on `company_designations` table
    - Add policy for public SELECT access
    - Add policy for authenticated users to perform ALL actions

  3. Triggers
    - Add trigger to automatically update `updated_at` timestamp on row updates
*/

-- Create the company_designations table
CREATE TABLE IF NOT EXISTS company_designations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  designation_name text UNIQUE NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_company_designations_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER trg_company_designations_updated
  BEFORE UPDATE ON company_designations
  FOR EACH ROW
  EXECUTE FUNCTION update_company_designations_timestamp();

-- Enable Row Level Security
ALTER TABLE company_designations ENABLE ROW LEVEL SECURITY;

-- Policy for public SELECT access
CREATE POLICY "company_designations_public_select"
  ON company_designations
  FOR SELECT
  TO public
  USING (true);

-- Policy for authenticated users to perform ALL actions
CREATE POLICY "company_designations_auth_all"
  ON company_designations
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);