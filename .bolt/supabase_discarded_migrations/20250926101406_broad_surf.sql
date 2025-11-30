/*
  # Verification Script for Designations & Roles Management System
  
  This script verifies that all tables, constraints, and data have been created correctly.
*/

-- 1. Verify company_designations table exists with seeded data
SELECT 
  'company_designations' as table_name,
  COUNT(*) as total_records,
  COUNT(*) FILTER (WHERE is_active = true) as active_records
FROM company_designations;

-- Show all company designations
SELECT 'Company Designations:' as info;
SELECT designation_name, is_active FROM company_designations ORDER BY designation_name;

-- 2. Verify member_registrations has company_designation_id column
SELECT 
  'member_registrations' as table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns 
WHERE table_name = 'member_registrations' 
AND column_name = 'company_designation_id';

-- 3. Verify lub_roles_master table exists with seeded data
SELECT 
  'lub_roles_master' as table_name,
  COUNT(*) as total_records,
  COUNT(*) FILTER (WHERE is_active = true) as active_records
FROM lub_roles_master;

-- Show all LUB roles
SELECT 'LUB Roles:' as info;
SELECT role_name, is_active FROM lub_roles_master ORDER BY role_name;

-- 4. Verify member_lub_roles table exists with correct constraint
SELECT 
  'member_lub_roles' as table_name,
  'table_exists' as status
FROM information_schema.tables 
WHERE table_name = 'member_lub_roles';

-- Check the UNIQUE constraint on member_lub_roles
SELECT 
  'member_lub_roles_unique_constraint' as constraint_info,
  conname as constraint_name,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint 
WHERE conrelid = 'member_lub_roles'::regclass 
AND contype = 'u';

-- 5. Verify user_roles table includes portal_manager
SELECT 
  'user_roles_check_constraint' as constraint_info,
  conname as constraint_name,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint 
WHERE conrelid = 'user_roles'::regclass 
AND conname = 'valid_roles';

-- 6. Verify RLS is enabled on all new tables
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables 
WHERE tablename IN ('company_designations', 'lub_roles_master', 'member_lub_roles')
ORDER BY tablename;

-- Show RLS policies for new tables
SELECT 
  schemaname,
  tablename,
  policyname,
  cmd,
  roles
FROM pg_policies 
WHERE tablename IN ('company_designations', 'lub_roles_master', 'member_lub_roles')
ORDER BY tablename, policyname;

-- Summary report
SELECT 'VERIFICATION SUMMARY:' as summary;

SELECT 
  'Company Designations' as component,
  CASE WHEN COUNT(*) >= 15 THEN 'PASS' ELSE 'FAIL' END as status,
  COUNT(*) || ' roles seeded' as details
FROM company_designations
UNION ALL
SELECT 
  'LUB Roles Master' as component,
  CASE WHEN COUNT(*) >= 7 THEN 'PASS' ELSE 'FAIL' END as status,
  COUNT(*) || ' roles seeded' as details
FROM lub_roles_master
UNION ALL
SELECT 
  'Member Registrations FK' as component,
  CASE WHEN COUNT(*) > 0 THEN 'PASS' ELSE 'FAIL' END as status,
  'company_designation_id column exists' as details
FROM information_schema.columns 
WHERE table_name = 'member_registrations' 
AND column_name = 'company_designation_id'
UNION ALL
SELECT 
  'Member LUB Roles Table' as component,
  CASE WHEN COUNT(*) > 0 THEN 'PASS' ELSE 'FAIL' END as status,
  'Table exists' as details
FROM information_schema.tables 
WHERE table_name = 'member_lub_roles'
UNION ALL
SELECT 
  'Portal Manager Role' as component,
  CASE WHEN pg_get_constraintdef(oid) LIKE '%portal_manager%' THEN 'PASS' ELSE 'FAIL' END as status,
  'Role added to user_roles constraint' as details
FROM pg_constraint 
WHERE conrelid = 'user_roles'::regclass 
AND conname = 'valid_roles';