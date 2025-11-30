/*
  # Add Admin Access to All Member Registrations

  ## Overview
  This migration adds an RLS policy that allows admin users to view ALL member registrations
  regardless of status (pending, approved, rejected). This is necessary for the Admin Registrations
  management page to function properly.

  ## Background
  - The existing policy "Allow public read of approved members" only shows approved records
  - Admin users need to see pending registrations to approve/reject them
  - Admin users are identified by having any entry in the user_roles table

  ## Changes Made

  1. **New RLS Policy for Admins**
     - Policy Name: "Allow admins to read all member registrations"
     - Scope: SELECT operations
     - Target: authenticated users with entries in user_roles table
     - Access: ALL member_registrations regardless of status
     - This policy is evaluated BEFORE the public approved-only policy

  2. **Existing Policies**
     - "Allow public read of approved members" - unchanged, continues to work for non-admin users
     - "Allow public insert for member registrations" - unchanged, allows form submissions
     - "Role-based updates for member registrations" - unchanged, allows admin updates

  ## Security
  - Only authenticated users with admin roles (entries in user_roles) can see all records
  - Anonymous users and non-admin authenticated users still only see approved members
  - Write operations remain restricted to users with proper roles
  - No sensitive data exposure beyond existing approved member visibility

  ## Impact
  - Admin Registrations page will now display all pending, approved, and rejected registrations
  - Admin status filter dropdown will work correctly
  - Total registration count will be accurate
  - Public directory functionality remains unchanged
*/

-- Add admin policy to allow viewing all member registrations
-- This policy applies to authenticated users who have admin roles
CREATE POLICY "Allow admins to read all member registrations"
  ON member_registrations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 
      FROM user_roles 
      WHERE user_roles.user_id = auth.uid()
    )
  );

-- Note: The existing "Allow public read of approved members" policy remains active
-- and will handle non-admin users who should only see approved members