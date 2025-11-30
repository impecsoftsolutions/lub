/*
  # Verification Script for Designations & Roles Management System
  
  This script verifies that all tables, constraints, and data have been created correctly.
  Run this after applying all migrations to confirm the system is properly set up.
*/

-- 1. Verify company_designations table exists with seeded data
SELECT 'company_designations' as table_name, 
       COUNT(*) as record_count,
       COUNT(CASE WHEN is_active = true THEN 1 END) as active_count
FROM company_designations;

-- Show sample company designations
SELECT designation_name, is_active 
FROM company_designations 
ORDER BY designation_name 
LIMIT 10;

-- 2. Verify member_registrations has new company_designation_id column
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'member_registrations' 
  AND column_name = 'company_designation_id';

-- Check foreign key constraint exists
SELECT tc.constraint_name, tc.table_name, kcu.column_name, 
       ccu.table_name AS foreign_table_name,
       ccu.column_name AS foreign_column_name 
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' 
  AND tc.table_name = 'member_registrations'
  AND kcu.column_name = 'company_designation_id';

-- 3. Verify lub_roles_master table exists with seeded data
SELECT 'lub_roles_master' as table_name, 
       COUNT(*) as record_count,
       COUNT(CASE WHEN is_active = true THEN 1 END) as active_count
FROM lub_roles_master;

-- Show LUB roles
SELECT role_name, is_active 
FROM lub_roles_master 
ORDER BY role_name;

-- 4. Verify member_lub_roles table exists with correct constraint
SELECT 'member_lub_roles' as table_name, 
       COUNT(*) as record_count
FROM member_lub_roles;

-- Check the unique constraint on member_lub_roles
SELECT tc.constraint_name, tc.constraint_type,
       string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) as columns
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
WHERE tc.table_name = 'member_lub_roles'
  AND tc.constraint_type = 'UNIQUE'
GROUP BY tc.constraint_name, tc.constraint_type;

-- Check level enum values
SELECT unnest(enum_range(NULL::member_role_level)) as level_values;

-- 5. Verify user_roles table allows portal_manager
SELECT constraint_name, check_clause
FROM information_schema.check_constraints
WHERE constraint_name LIKE '%user_roles%' 
  AND check_clause LIKE '%portal_manager%';

-- 6. Verify RLS is enabled on all new tables
SELECT schemaname, tablename, rowsecurity
FROM pg_tables 
WHERE tablename IN ('company_designations', 'lub_roles_master', 'member_lub_roles')
  AND schemaname = 'public';

-- Check RLS policies exist
SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies 
WHERE tablename IN ('company_designations', 'lub_roles_master', 'member_lub_roles')
  AND schemaname = 'public'
ORDER BY tablename, policyname;

-- Summary report
SELECT 
  'VERIFICATION COMPLETE' as status,
  (SELECT COUNT(*) FROM company_designations) as company_designations_count,
  (SELECT COUNT(*) FROM lub_roles_master) as lub_roles_count,
  (SELECT COUNT(*) FROM member_lub_roles) as member_role_assignments_count,
  (SELECT COUNT(*) FROM information_schema.columns 
   WHERE table_name = 'member_registrations' 
     AND column_name = 'company_designation_id') as has_company_designation_id,
  (SELECT COUNT(*) FROM information_schema.check_constraints
   WHERE constraint_name LIKE '%user_roles%' 
     AND check_clause LIKE '%portal_manager%') as portal_manager_constraint_exists;