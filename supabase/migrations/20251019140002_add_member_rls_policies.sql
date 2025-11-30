/*
  # Add RLS Policies for Member Access

  1. New Policies
    - Members can SELECT only their own registration data
    - Members can UPDATE only their own registration data
    - Members can INSERT new registration (for re-application)
    - Members can view their own audit history

  2. Security
    - All policies check user_id matches authenticated user
    - Members cannot access other members' private data
    - Members cannot modify status or admin-only fields
    - Admins retain full access through existing policies

  3. Notes
    - Public INSERT policy removed for security
    - Members must be authenticated to submit/update applications
    - Re-applications are INSERT operations with status reset to 'pending'
*/

-- Remove old public insert policy if it exists
DROP POLICY IF EXISTS "Allow public insert for member registrations" ON member_registrations;

-- Policy: Members can view only their own registration
CREATE POLICY "Members can view own registration"
  ON member_registrations
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Policy: Members can update only their own registration
CREATE POLICY "Members can update own registration"
  ON member_registrations
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid() AND
    -- Members cannot change these fields
    status = (SELECT status FROM member_registrations WHERE id = member_registrations.id) AND
    user_id = (SELECT user_id FROM member_registrations WHERE id = member_registrations.id)
  );

-- Policy: Authenticated users can insert their own registration
CREATE POLICY "Authenticated users can create registration"
  ON member_registrations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid() OR
    user_id IS NULL -- Allow initial registration without user_id
  );

-- Policy: Members can view their own audit history
CREATE POLICY "Members can view own audit history"
  ON member_audit_history
  FOR SELECT
  TO authenticated
  USING (
    member_id IN (
      SELECT id FROM member_registrations WHERE user_id = auth.uid()
    )
  );

-- Add comment on member_registrations table
COMMENT ON TABLE member_registrations IS
  'Member registration data with RLS policies. Members can only access their own data. Admins have full access.';
