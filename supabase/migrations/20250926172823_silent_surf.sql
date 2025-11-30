/*
  # Finalize Simplified Portal Roles

  1. Database Updates
    - Update valid_roles CHECK constraint to allow only 4 roles
    - Migrate existing role data to new simplified roles
    - Remove geographic enforcement constraints
    - Allow NULL state/district for all roles

  2. Auth Function Updates
    - Update check_user_permission for new role logic
    - Maintain backward compatibility with existing RLS

  3. RLS Updates
    - Tighten user_roles table policies
    - Only super_admin can manage user roles
    - Admin/editor/viewer have appropriate read access
*/

-- Step 1: Drop old CHECK constraints that are no longer needed
ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS valid_roles;
ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS state_required_for_state_roles;
ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS district_required_for_district_roles;

-- Step 2: Migrate existing role data to new simplified roles
UPDATE user_roles SET role = CASE
  WHEN role = 'super_admin' THEN 'super_admin'
  WHEN role IN ('state_president', 'district_president', 'it_division_head', 'accounts_head', 'portal_manager') THEN 'admin'
  WHEN role IN ('state_general_secretary', 'district_general_secretary', 'secretary', 'joint_general_secretary', 'vice_president', 'treasurer', 'executive_committee_member') THEN 'editor'
  ELSE 'viewer'
END;

-- Step 3: Clear state and district columns (no longer needed for new role system)
UPDATE user_roles SET state = NULL, district = NULL;

-- Step 4: Add new CHECK constraint for simplified roles
ALTER TABLE user_roles ADD CONSTRAINT valid_roles 
  CHECK (role IN ('super_admin', 'admin', 'editor', 'viewer'));

-- Step 5: Update check_user_permission function for new role logic
CREATE OR REPLACE FUNCTION check_user_permission(target_state text DEFAULT NULL, target_district text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_role_count integer;
BEGIN
  -- Get current user ID
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Check if user has any of the management roles
  SELECT COUNT(*)
  INTO user_role_count
  FROM user_roles
  WHERE user_id = auth.uid()
    AND role IN ('super_admin', 'admin', 'editor');

  -- Return TRUE if user has management role, FALSE otherwise
  RETURN user_role_count > 0;
END;
$$;

-- Step 6: Update RLS policies on user_roles table
DROP POLICY IF EXISTS "Allow access to own role data" ON user_roles;
DROP POLICY IF EXISTS "Allow authenticated users to manage roles" ON user_roles;

-- Policy 1: Users can view their own roles
CREATE POLICY "Users can view own roles"
  ON user_roles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Policy 2: Super admin and admin can view all roles
CREATE POLICY "Super admin and admin can view all roles"
  ON user_roles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('super_admin', 'admin')
    )
  );

-- Policy 3: Only super admin can manage user roles (INSERT/UPDATE/DELETE)
CREATE POLICY "Only super admin can manage user roles"
  ON user_roles
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'super_admin'
    )
  );

-- Step 7: Create helper function to get user role (for debugging/verification)
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN 'anonymous';
  END IF;

  SELECT role INTO user_role
  FROM user_roles
  WHERE user_id = auth.uid()
  LIMIT 1;

  RETURN COALESCE(user_role, 'no_role');
END;
$$;