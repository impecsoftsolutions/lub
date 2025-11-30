/*
  # Fix RLS Recursion Emergency - User Roles Table

  This migration fixes the infinite RLS recursion on user_roles table by:
  1. Adding temporary unlock policies for emergency access
  2. Creating a stable super admin check without recursion
  3. Implementing permanent non-recursive RLS policies
  4. Removing temporary policies after verification

  ## Steps:
  A) Emergency unlock (temporary policies)
  B) Stable super admin check (portal_super_admins table + function)
  C) Permanent non-recursive RLS for user_roles
  D) Remove temp policies (manual step after verification)
*/

-- A) EMERGENCY UNLOCK (temporary)
-- 1) Add temporary permissive SELECT policy
DROP POLICY IF EXISTS "tmp_user_roles_select_unlock" ON user_roles;
CREATE POLICY "tmp_user_roles_select_unlock"
  ON user_roles
  FOR SELECT
  TO authenticated
  USING (true);

-- 2) Add temporary write policies restricted to admin@lub.org.in
DROP POLICY IF EXISTS "tmp_user_roles_write_unlock_insert" ON user_roles;
CREATE POLICY "tmp_user_roles_write_unlock_insert"
  ON user_roles
  FOR INSERT
  TO authenticated
  WITH CHECK ((auth.jwt() ->> 'email'::text) = 'admin@lub.org.in');

DROP POLICY IF EXISTS "tmp_user_roles_write_unlock_update" ON user_roles;
CREATE POLICY "tmp_user_roles_write_unlock_update"
  ON user_roles
  FOR UPDATE
  TO authenticated
  USING ((auth.jwt() ->> 'email'::text) = 'admin@lub.org.in')
  WITH CHECK ((auth.jwt() ->> 'email'::text) = 'admin@lub.org.in');

DROP POLICY IF EXISTS "tmp_user_roles_write_unlock_delete" ON user_roles;
CREATE POLICY "tmp_user_roles_write_unlock_delete"
  ON user_roles
  FOR DELETE
  TO authenticated
  USING ((auth.jwt() ->> 'email'::text) = 'admin@lub.org.in');

-- B) STABLE SUPER ADMIN CHECK (no recursion)
-- 3) Create portal_super_admins table
CREATE TABLE IF NOT EXISTS portal_super_admins (
  email text PRIMARY KEY,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on portal_super_admins (simple, no recursion risk)
ALTER TABLE portal_super_admins ENABLE ROW LEVEL SECURITY;

-- Simple policy for portal_super_admins - only super admins can manage it
DROP POLICY IF EXISTS "portal_super_admins_select" ON portal_super_admins;
CREATE POLICY "portal_super_admins_select"
  ON portal_super_admins
  FOR SELECT
  TO authenticated
  USING ((auth.jwt() ->> 'email'::text) = email);

DROP POLICY IF EXISTS "portal_super_admins_manage" ON portal_super_admins;
CREATE POLICY "portal_super_admins_manage"
  ON portal_super_admins
  FOR ALL
  TO authenticated
  USING ((auth.jwt() ->> 'email'::text) IN (SELECT email FROM portal_super_admins))
  WITH CHECK ((auth.jwt() ->> 'email'::text) IN (SELECT email FROM portal_super_admins));

-- Insert admin@lub.org.in as super admin
INSERT INTO portal_super_admins (email) 
VALUES ('admin@lub.org.in') 
ON CONFLICT (email) DO NOTHING;

-- 4) Create non-recursive helper function
CREATE OR REPLACE FUNCTION is_portal_super_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Simple check: is current user's email in portal_super_admins?
  -- No recursion - does not read user_roles table
  RETURN EXISTS (
    SELECT 1 
    FROM portal_super_admins 
    WHERE email = (auth.jwt() ->> 'email'::text)
  );
END;
$$;

-- C) PERMANENT, NON-RECURSIVE RLS FOR user_roles
-- 5) Drop ALL existing policies on user_roles EXCEPT temporary ones
DO $$
DECLARE
    policy_record RECORD;
BEGIN
    FOR policy_record IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'user_roles' 
        AND schemaname = 'public'
        AND policyname NOT LIKE 'tmp_%'
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || policy_record.policyname || '" ON user_roles';
    END LOOP;
END $$;

-- 6) Create permanent non-recursive policies
-- SELECT (own) - users can see their own roles
DROP POLICY IF EXISTS "user_roles_select_own" ON user_roles;
CREATE POLICY "user_roles_select_own"
  ON user_roles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- SELECT (super admin full view) - super admins can see all roles
DROP POLICY IF EXISTS "user_roles_select_super_admin" ON user_roles;
CREATE POLICY "user_roles_select_super_admin"
  ON user_roles
  FOR SELECT
  TO authenticated
  USING (is_portal_super_admin());

-- INSERT (super admin only)
DROP POLICY IF EXISTS "user_roles_insert_super_admin" ON user_roles;
CREATE POLICY "user_roles_insert_super_admin"
  ON user_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (is_portal_super_admin());

-- UPDATE (super admin only)
DROP POLICY IF EXISTS "user_roles_update_super_admin" ON user_roles;
CREATE POLICY "user_roles_update_super_admin"
  ON user_roles
  FOR UPDATE
  TO authenticated
  USING (is_portal_super_admin())
  WITH CHECK (is_portal_super_admin());

-- DELETE (super admin only)
DROP POLICY IF EXISTS "user_roles_delete_super_admin" ON user_roles;
CREATE POLICY "user_roles_delete_super_admin"
  ON user_roles
  FOR DELETE
  TO authenticated
  USING (is_portal_super_admin());

-- D) REMOVE TEMP POLICIES (manual step after verification)
-- Note: These will be removed in a separate migration after verification
-- The temporary policies are:
-- - tmp_user_roles_select_unlock
-- - tmp_user_roles_write_unlock_insert
-- - tmp_user_roles_write_unlock_update  
-- - tmp_user_roles_write_unlock_delete

-- Verification queries (for manual testing):
-- SELECT * FROM portal_super_admins;
-- SELECT policyname, cmd, roles, qual, with_check FROM pg_policies WHERE tablename = 'user_roles' AND schemaname = 'public';
-- SELECT is_portal_super_admin();