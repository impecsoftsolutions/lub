/*
  # Remove Temporary RLS Policies

  This migration removes the temporary unlock policies after verification
  that the permanent non-recursive policies are working correctly.

  Run this ONLY after confirming:
  1. admin@lub.org.in can access Admin User Management
  2. Can view all user roles
  3. Can add/edit/delete roles
  4. Other users cannot modify user_roles
*/

-- Remove temporary unlock policies
DROP POLICY IF EXISTS "tmp_user_roles_select_unlock" ON user_roles;
DROP POLICY IF EXISTS "tmp_user_roles_write_unlock_insert" ON user_roles;
DROP POLICY IF EXISTS "tmp_user_roles_write_unlock_update" ON user_roles;
DROP POLICY IF EXISTS "tmp_user_roles_write_unlock_delete" ON user_roles;

-- Verification: List remaining policies on user_roles
-- Should show only the permanent non-recursive policies:
-- - user_roles_select_own
-- - user_roles_select_super_admin  
-- - user_roles_insert_super_admin
-- - user_roles_update_super_admin
-- - user_roles_delete_super_admin

SELECT 
  policyname,
  cmd,
  roles,
  qual as "USING",
  with_check as "WITH CHECK"
FROM pg_policies 
WHERE tablename = 'user_roles' 
AND schemaname = 'public'
ORDER BY policyname;