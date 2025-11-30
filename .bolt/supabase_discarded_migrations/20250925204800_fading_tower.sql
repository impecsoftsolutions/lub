/*
  # Create Designations Master System

  1. New Tables
    - `designations_master`
      - `id` (uuid, primary key)
      - `designation_name` (text, unique)
      - `is_active` (boolean, default true)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Changes to existing tables
    - Add `designation_id` column to `member_registrations` table
    - Add foreign key constraint linking to designations_master

  3. Security
    - Enable RLS on `designations_master` table
    - Add policies for public read access and authenticated admin write access

  4. Seed Data
    - Insert 15 initial designation values
*/

-- Create designations_master table
CREATE TABLE IF NOT EXISTS designations_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  designation_name text UNIQUE NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add designation_id column to member_registrations if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'member_registrations' AND column_name = 'designation_id'
  ) THEN
    ALTER TABLE member_registrations ADD COLUMN designation_id uuid;
  END IF;
END $$;

-- Enable RLS on designations_master
ALTER TABLE designations_master ENABLE ROW LEVEL SECURITY;

-- Create policies for designations_master
CREATE POLICY "Anyone can read active designations"
  ON designations_master
  FOR SELECT
  TO public
  USING (is_active = true);

CREATE POLICY "Authenticated users can read all designations"
  ON designations_master
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage designations"
  ON designations_master
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_designations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_designations_updated_at_trigger ON designations_master;
CREATE TRIGGER update_designations_updated_at_trigger
  BEFORE UPDATE ON designations_master
  FOR EACH ROW
  EXECUTE FUNCTION update_designations_updated_at();

-- Add foreign key constraint if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_member_registrations_designation'
  ) THEN
    ALTER TABLE member_registrations
    ADD CONSTRAINT fk_member_registrations_designation
    FOREIGN KEY (designation_id) REFERENCES designations_master(id);
  END IF;
END $$;

-- Seed initial designations
INSERT INTO designations_master (designation_name) VALUES
  ('Proprietor'),
  ('Partner'),
  ('Managing Partner'),
  ('Managing Director'),
  ('Director'),
  ('Joint Managing Director'),
  ('Operations'),
  ('President'),
  ('Vice President'),
  ('Chief Executive Officer'),
  ('Chief Financial Officer'),
  ('Chief Operating Officer'),
  ('General Manager'),
  ('Manager'),
  ('Chairman')
ON CONFLICT (designation_name) DO NOTHING;