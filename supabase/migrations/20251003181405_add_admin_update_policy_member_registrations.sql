/*
  # Add Admin UPDATE Policy for Member Registrations

  ## Overview
  This migration adds an RLS policy that allows admin users (super_admin, admin, editor) 
  to UPDATE member registrations records. This is critical for the approval/rejection 
  workflow in the Admin Registrations page.

  ## Problem
  - The existing "Role-based updates for member registrations" policy uses 
    `check_user_permission(state, district)` which works but may have edge cases
  - There's no explicit UPDATE policy for admins similar to the SELECT policy
  - Admins need to be able to update status (pending → approved/rejected) for ANY registration

  ## Solution
  Add a new UPDATE policy specifically for admin users that:
  - Checks if the user has admin/editor/super_admin role in user_roles table
  - Allows updating ANY member_registration record regardless of state/district
  - Works alongside the existing "Role-based updates" policy as a permissive policy

  ## Changes Made

  1. **New RLS Policy for Admin Updates**
     - Policy Name: "Allow admins to update all member registrations"
     - Scope: UPDATE operations
     - Target: authenticated users with admin roles (super_admin, admin, editor)
     - Access: ALL member_registrations regardless of status or location
     - Permissions: Can update any field including status, updated_at

  2. **Existing Policies**
     - "Role-based updates for member registrations" - remains unchanged as fallback
     - "Allow admins to read all member registrations" - works in conjunction with this
     - "Allow public read of approved members" - unchanged
     - "Allow public insert for member registrations" - unchanged

  ## Security Considerations
  - Only authenticated users with entries in user_roles table can update records
  - Maintains principle of least privilege - only admins can modify registrations
  - No impact on public users or anonymous access
  - All updates require authentication via auth.uid()

  ## Impact
  - Admin users can now approve/reject registrations without permission errors
  - Approval workflow in Admin Registrations page will function correctly
  - Status updates (pending → approved/rejected) will work reliably
  - No breaking changes to existing functionality
*/

-- Add admin UPDATE policy to allow updating all member registrations
-- This policy applies to authenticated users who have admin roles (super_admin, admin, editor)
CREATE POLICY "Allow admins to update all member registrations"
  ON member_registrations
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 
      FROM user_roles 
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role IN ('super_admin', 'admin', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 
      FROM user_roles 
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role IN ('super_admin', 'admin', 'editor')
    )
  );

-- Add helpful comment for future reference
COMMENT ON POLICY "Allow admins to update all member registrations" ON member_registrations IS 
  'Allows admin users (super_admin, admin, editor) to update any member registration record. Critical for approval/rejection workflow.';
