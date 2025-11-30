/*
  # Create Pending Cities Master Table

  1. New Tables
    - `pending_cities_master`
      - `id` (uuid, primary key) - Unique identifier
      - `city_name` (text, not null) - Normalized city name in Title Case
      - `state_id` (uuid, foreign key) - Reference to states_master
      - `district_id` (uuid, foreign key) - Reference to districts_master
      - `status` (text, not null) - Status: 'pending', 'approved', 'rejected'
      - `submitted_by` (uuid, foreign key) - User who submitted (nullable for bulk imports)
      - `submission_source` (text) - Source: 'registration_form', 'bulk_import', 'admin_entry'
      - `reviewed_by` (uuid, foreign key) - Admin who reviewed (nullable)
      - `reviewed_at` (timestamptz) - When reviewed (nullable)
      - `rejection_reason` (text) - Reason if rejected (nullable)
      - `merged_into_city_id` (uuid, foreign key) - If merged, the target city ID (nullable)
      - `notes` (text) - Additional notes (nullable)
      - `created_at` (timestamptz, default now())
      - `updated_at` (timestamptz, default now())

  2. Security
    - Enable RLS on `pending_cities_master` table
    - Add policy for authenticated users to insert new cities from registration
    - Add policy for admins to view all pending cities
    - Add policy for admins to update/review cities
    - Add policy for all users to view approved cities

  3. Indexes
    - Index on status for filtering
    - Index on city_name for searching
    - Index on district_id for filtering by district
    - Unique index on (city_name, district_id) for approved cities to prevent duplicates
*/

-- Create the pending_cities_master table
CREATE TABLE IF NOT EXISTS pending_cities_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_name text NOT NULL,
  state_id uuid REFERENCES states_master(id),
  district_id uuid REFERENCES districts_master(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  submitted_by uuid REFERENCES auth.users(id),
  submission_source text DEFAULT 'registration_form' CHECK (submission_source IN ('registration_form', 'bulk_import', 'admin_entry')),
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  rejection_reason text,
  merged_into_city_id uuid REFERENCES pending_cities_master(id),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_pending_cities_status ON pending_cities_master(status);
CREATE INDEX IF NOT EXISTS idx_pending_cities_name ON pending_cities_master(city_name);
CREATE INDEX IF NOT EXISTS idx_pending_cities_district ON pending_cities_master(district_id);

-- Create unique constraint for approved cities to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_cities_unique_approved 
  ON pending_cities_master(city_name, district_id) 
  WHERE status = 'approved';

-- Enable RLS
ALTER TABLE pending_cities_master ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can view approved cities
CREATE POLICY "Anyone can view approved cities"
  ON pending_cities_master
  FOR SELECT
  USING (status = 'approved');

-- Policy: Authenticated users can insert new cities
CREATE POLICY "Authenticated users can insert cities"
  ON pending_cities_master
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Policy: Admins can view all cities
CREATE POLICY "Admins can view all cities"
  ON pending_cities_master
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Policy: Admins can update cities
CREATE POLICY "Admins can update cities"
  ON pending_cities_master
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Policy: Admins can delete cities
CREATE POLICY "Admins can delete cities"
  ON pending_cities_master
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );
