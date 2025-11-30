/*
  # Add Admin DELETE Policy for Member Registrations

  ## Overview
  This migration adds an RLS policy that allows admin users (super_admin, admin, editor) 
  to DELETE member registrations records. This is critical for the soft-delete functionality 
  in the Admin Registrations page.

  ## Problem
  - No DELETE policy exists on member_registrations table
  - The soft delete operation in AdminRegistrations.tsx successfully:
    1. Inserts record into deleted_members table (INSERT policy exists)
    2. Logs action in audit history
    3. BUT fails to delete from member_registrations (no DELETE policy)
  - Supabase RLS blocks DELETE operations without an explicit policy
  - The error is not returned to the client, causing silent failure

  ## Solution
  Add a new DELETE policy specifically for admin users that:
  - Checks if the user has admin/editor/super_admin role in user_roles table
  - Allows deleting ANY member_registration record regardless of state/district
  - Follows the same security pattern as existing SELECT and UPDATE policies

  ## Changes Made

  1. **New RLS Policy for Admin Deletes**
     - Policy Name: "Allow admins to delete member registrations"
     - Scope: DELETE operations
     - Target: authenticated users with admin roles (super_admin, admin, editor)
     - Access: ALL member_registrations regardless of status or location
     - Security: Only authenticated admins can perform deletions

  2. **Existing Policies**
     - "Allow admins to read all member registrations" - unchanged
     - "Allow admins to update all member registrations" - unchanged
     - "Allow public read of approved members" - unchanged
     - "Allow public insert for member registrations" - unchanged

  ## Security Considerations
  - Only authenticated users with entries in user_roles table can delete records
  - Maintains principle of least privilege - only admins can delete registrations
  - No impact on public users or anonymous access
  - All deletions require authentication via auth.uid()
  - Soft delete pattern preserves data in deleted_members table

  ## Impact
  - Admin users can now successfully delete members (soft delete)
  - Deleted records will be properly removed from member_registrations
  - Deleted records will appear in deleted_members archive
  - Delete button in Admin Registrations page will work correctly
  - No breaking changes to existing functionality
*/

-- Add admin DELETE policy to allow deleting member registrations
-- This policy applies to authenticated users who have admin roles (super_admin, admin, editor)
CREATE POLICY "Allow admins to delete member registrations"
  ON member_registrations
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 
      FROM user_roles 
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role IN ('super_admin', 'admin', 'editor')
    )
  );

-- Add helpful comment for future reference
COMMENT ON POLICY "Allow admins to delete member registrations" ON member_registrations IS 
  'Allows admin users (super_admin, admin, editor) to delete member registration records. Critical for soft-delete workflow where records are archived to deleted_members table.';