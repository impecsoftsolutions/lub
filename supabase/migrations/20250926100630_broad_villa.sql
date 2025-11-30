/*
  # Create company_designations table

  1. New Tables
    - `company_designations`
      - `id` (uuid, primary key)
      - `designation_name` (text, unique, not null)
      - `is_active` (boolean, default true)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on `company_designations` table
    - Add policy for public to read active designations
    - Add policy for authenticated users to manage all designations
*/

CREATE TABLE IF NOT EXISTS company_designations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  designation_name text UNIQUE NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE company_designations ENABLE ROW LEVEL SECURITY;

-- Policy for public to read active designations (for dropdowns)
CREATE POLICY "Public can read active company designations"
  ON company_designations
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- Policy for authenticated users to read all designations
CREATE POLICY "Authenticated users can read all company designations"
  ON company_designations
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy for authenticated users to manage designations
CREATE POLICY "Authenticated users can manage company designations"
  ON company_designations
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_company_designations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER update_company_designations_updated_at_trigger
  BEFORE UPDATE ON company_designations
  FOR EACH ROW
  EXECUTE FUNCTION update_company_designations_updated_at();