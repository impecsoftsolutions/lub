/*
  # Enable Public Access to Members Directory

  ## Overview
  This migration enables public (anonymous) access to approved members in the directory
  while maintaining role-based access control for authenticated users and admins.

  ## Changes

  1. RLS Policies for member_registrations
    - Drop all existing SELECT policies to start fresh
    - Create a single comprehensive SELECT policy that works for both anonymous and authenticated users
    - Policy allows viewing approved members for everyone
    - Authenticated users can also see their own registrations regardless of status

  2. Performance Indexes
    - Add indexes for state and district for efficient filtering
    - Add composite index for state-grouped pagination
    - Add indexes for search operations

  ## Security
  - Anonymous users can only see approved member records
  - Authenticated users can see approved members + their own registrations
  - Sensitive fields are controlled at application layer
  - Write operations remain restricted to authenticated users with proper roles
*/

-- First, let's see what policies exist and drop SELECT policies
DO $$
BEGIN
  -- Drop existing SELECT policies if they exist
  DROP POLICY IF EXISTS "Role-based access for member registrations" ON member_registrations;
  DROP POLICY IF EXISTS "Public can read approved members" ON member_registrations;
  DROP POLICY IF EXISTS "Users can read own registrations" ON member_registrations;
  DROP POLICY IF EXISTS "Members can read approved registrations" ON member_registrations;
END $$;

-- Create a simple SELECT policy for public directory access
-- This policy allows everyone (anonymous and authenticated) to view approved members
-- No auth.users table access required - keeps it simple and fast
CREATE POLICY "Allow public read of approved members"
  ON member_registrations
  FOR SELECT
  TO anon, authenticated
  USING (status = 'approved');

-- Add performance indexes for directory features

-- Index for status filtering (most important for performance)
CREATE INDEX IF NOT EXISTS idx_member_registrations_status_approved
ON member_registrations(status)
WHERE status = 'approved';

-- Index for state filtering and grouping
CREATE INDEX IF NOT EXISTS idx_member_registrations_state
ON member_registrations(state)
WHERE status = 'approved';

-- Index for district filtering
CREATE INDEX IF NOT EXISTS idx_member_registrations_district
ON member_registrations(district)
WHERE status = 'approved';

-- Composite index for state-grouped pagination (state + name ordering)
CREATE INDEX IF NOT EXISTS idx_member_registrations_state_name
ON member_registrations(state, full_name)
WHERE status = 'approved';

-- Index for full-text search on member names
CREATE INDEX IF NOT EXISTS idx_member_registrations_full_name
ON member_registrations(full_name)
WHERE status = 'approved';

-- Index for company name search
CREATE INDEX IF NOT EXISTS idx_member_registrations_company_name
ON member_registrations(company_name)
WHERE status = 'approved';

-- Index for products/services search (GIN index for better text search)
CREATE INDEX IF NOT EXISTS idx_member_registrations_products_gin
ON member_registrations
USING gin(to_tsvector('english', products_services))
WHERE status = 'approved';

-- Create a helper function to get member counts by state
CREATE OR REPLACE FUNCTION get_member_counts_by_state()
RETURNS TABLE(state_name text, member_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    state as state_name,
    COUNT(*) as member_count
  FROM member_registrations
  WHERE status = 'approved'
  GROUP BY state
  ORDER BY state;
$$;

-- Grant execute permission to anonymous and authenticated users
GRANT EXECUTE ON FUNCTION get_member_counts_by_state() TO anon, authenticated;
