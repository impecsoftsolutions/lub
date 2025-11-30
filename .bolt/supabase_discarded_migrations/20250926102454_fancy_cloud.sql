/*
  # Verification script for member_lub_roles and all Phase 1 objects
  
  This script provides concrete evidence that:
  1. member_lub_roles has the correct UNIQUE constraint without COALESCE
  2. All Phase 1 objects exist and are properly configured
*/

-- A) Show detailed schema for member_lub_roles table
SELECT 
  'member_lub_roles table schema:' as info,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'member_lub_roles'
ORDER BY ordinal_position;

-- B) Show ALL constraints on member_lub_roles with their exact definitions
SELECT 
  'member_lub_roles constraints:' as info,
  conname as constraint_name,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint 
WHERE conrelid = 'public.member_lub_roles'::regclass
ORDER BY conname;

-- C) Verify company_designations exists and count
SELECT 
  'company_designations verification:' as info,
  COUNT(*) as total_count
FROM company_designations;

SELECT 
  'First 5 company designations:' as info,
  designation_name
FROM company_designations 
ORDER BY designation_name 
LIMIT 5;

-- D) Verify member_registrations has company_designation_id column
SELECT 
  'member_registrations company_designation_id column:' as info,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'member_registrations' 
  AND column_name = 'company_designation_id';

-- E) Verify lub_roles_master exists and count
SELECT 
  'lub_roles_master verification:' as info,
  COUNT(*) as total_count
FROM lub_roles_master;

SELECT 
  'All LUB roles:' as info,
  role_name
FROM lub_roles_master 
ORDER BY role_name;

-- F) Verify user_roles allows portal_manager
SELECT 
  'user_roles portal_manager check:' as info,
  pg_get_constraintdef(oid) as check_constraint_definition
FROM pg_constraint 
WHERE conrelid = 'public.user_roles'::regclass
  AND contype = 'c'
  AND pg_get_constraintdef(oid) LIKE '%portal_manager%';

-- G) Verify RLS is enabled on all new tables
SELECT 
  'RLS status for new tables:' as info,
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('company_designations', 'lub_roles_master', 'member_lub_roles')
ORDER BY tablename;