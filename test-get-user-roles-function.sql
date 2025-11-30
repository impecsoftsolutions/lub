-- Test script for get_user_roles() RPC function
-- Run this in Supabase SQL Editor after applying the migration

-- Test 1: Check if function exists
SELECT
  proname as function_name,
  pg_get_functiondef(oid) as definition
FROM pg_proc
WHERE proname = 'get_user_roles';

-- Test 2: Get a sample user ID from users table
-- (Replace with an actual user_id from your database)
SELECT id, email, account_type
FROM users
LIMIT 5;

-- Test 3: Call the function with a user ID
-- REPLACE 'user-id-here' with an actual user ID from Test 2
-- SELECT * FROM get_user_roles('user-id-here');

-- Test 4: Compare direct query (might fail due to RLS) vs RPC function
-- Direct query (may fail):
-- SELECT * FROM user_roles WHERE user_id = 'user-id-here';

-- RPC function (should work):
-- SELECT * FROM get_user_roles('user-id-here');

-- Test 5: Verify function permissions
SELECT
  proname,
  prosecdef as is_security_definer,
  proconfig as search_path_setting
FROM pg_proc
WHERE proname = 'get_user_roles';

-- Expected results:
-- is_security_definer should be 't' (true)
-- search_path_setting should contain 'search_path=public'
