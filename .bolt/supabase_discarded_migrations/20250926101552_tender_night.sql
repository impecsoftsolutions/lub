/*
  # Verification Script for Designations & Roles Management System
  
  This script verifies that all tables, constraints, and data have been created correctly.
*/

-- 1. Verify company_designations table and seeded data
SELECT 
  'company_designations' as table_name,
  COUNT(*) as total_rows,
  COUNT(*) FILTER (WHERE is_active = true) as active_rows
FROM company_designations;

-- Show all company designations
SELECT 'Company Designations:' as info;
SELECT designation_name, is_active FROM company_designations ORDER BY designation_name;

-- 2. Verify member_registrations has new column
SELECT 
  'member_registrations' as table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns 
WHERE table_name = 'member_registrations' 
AND column_name = 'company_designation_id';

-- 3. Verify lub_roles_master table and seeded data
SELECT 
  'lub_roles_master' as table_name,
  COUNT(*) as total_rows,
  COUNT(*) FILTER (WHERE is_active = true) as active_rows
FROM lub_roles_master;

-- Show all LUB roles
SELECT 'LUB Roles:' as info;
SELECT role_name, is_active FROM lub_roles_master ORDER BY role_name;

-- 4. Verify member_lub_roles table structure and constraints
SELECT 
  'member_lub_roles' as table_name,
  'exists' as status
FROM information_schema.tables 
WHERE table_name = 'member_lub_roles';

-- Show the exact CREATE TABLE statement for member_lub_roles
SELECT 'member_lub_roles UNIQUE constraint:' as info;
SELECT 
  conname as constraint_name,
  pg_get_constraintdef(c.oid) as constraint_definition
FROM pg_constraint c
JOIN pg_class t ON c.conrelid = t.oid
WHERE t.relname = 'member_lub_roles' 
AND c.contype = 'u';

-- 5. Verify user_roles allows portal_manager
SELECT 'user_roles CHECK constraint:' as info;
SELECT 
  conname as constraint_name,
  pg_get_constraintdef(c.oid) as constraint_definition
FROM pg_constraint c
JOIN pg_class t ON c.conrelid = t.oid
WHERE t.relname = 'user_roles' 
AND c.contype = 'c'
AND pg_get_constraintdef(c.oid) LIKE '%portal_manager%';

-- 6. Verify RLS is enabled on all new tables
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables 
WHERE tablename IN ('company_designations', 'lub_roles_master', 'member_lub_roles')
ORDER BY tablename;

-- 7. Count RLS policies on new tables
SELECT 
  schemaname,
  tablename,
  COUNT(*) as policy_count
FROM pg_policies 
WHERE tablename IN ('company_designations', 'lub_roles_master', 'member_lub_roles')
GROUP BY schemaname, tablename
ORDER BY tablename;

-- 8. Show the exact table definition for member_lub_roles
SELECT 'member_lub_roles table structure:' as info;
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name = 'member_lub_roles' 
ORDER BY ordinal_position;