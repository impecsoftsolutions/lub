/*
  # Enable Public Access to Company Designations

  ## Overview
  This migration enables public (anonymous) access to the company_designations table.
  This is required for the Directory page to properly display member designations
  when using JOIN operations in the query.

  ## Problem
  The Directory query uses a LEFT JOIN on company_designations table:
  ```
  company_designations!left(designation_name)
  ```

  Even though it's a LEFT JOIN, if the related table (company_designations) has
  RLS enabled and blocks anonymous access, the entire query fails.

  ## Solution
  Add a public read policy to company_designations table allowing anonymous users
  to view all designation names.

  ## Security
  - Designations are non-sensitive reference data (e.g., "CEO", "Manager", "Director")
  - Safe to expose publicly as they're used for display purposes
  - Write operations remain restricted to authenticated users with proper roles
*/

-- Enable RLS on company_designations if not already enabled
ALTER TABLE company_designations ENABLE ROW LEVEL SECURITY;

-- Drop any existing SELECT policies on company_designations
DROP POLICY IF EXISTS "Public can read company designations" ON company_designations;
DROP POLICY IF EXISTS "Allow public read of designations" ON company_designations;
DROP POLICY IF EXISTS "Anyone can view designations" ON company_designations;

-- Create public read policy for company_designations
-- This allows both anonymous and authenticated users to view all designations
CREATE POLICY "Public can read all designations"
  ON company_designations
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Note: Write policies (INSERT, UPDATE, DELETE) should remain restricted
-- Only admins with proper permissions should be able to modify designations
-- Those policies should already exist from previous migrations
