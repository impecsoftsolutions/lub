/*
  Test Script for Password Reset Functions

  This script tests the password reset database functions to ensure they work correctly.
  Run these queries in the Supabase SQL Editor after applying the migration.
*/

-- =============================================
-- Test 1: Check if RLS is enabled on tables
-- =============================================

SELECT
  tablename,
  CASE WHEN rowsecurity THEN 'Enabled ✓' ELSE 'Disabled ✗' END as rls_status
FROM pg_tables
WHERE tablename IN ('users', 'auth_sessions', 'password_reset_tokens')
  AND schemaname = 'public';

-- Expected: All three tables should show "Enabled ✓"

-- =============================================
-- Test 2: Check if functions exist
-- =============================================

SELECT
  proname as function_name,
  proargnames as parameter_names,
  CASE
    WHEN prosecdef THEN 'SECURITY DEFINER ✓'
    ELSE 'SECURITY INVOKER'
  END as security_mode
FROM pg_proc
WHERE proname IN (
  'lookup_user_for_password_reset',
  'validate_password_reset_token',
  'reset_user_password'
)
ORDER BY proname;

-- Expected: All three functions should exist with SECURITY DEFINER

-- =============================================
-- Test 3: Check RLS policies
-- =============================================

SELECT
  tablename,
  policyname,
  cmd as operation,
  CASE
    WHEN roles = '{public}' THEN 'PUBLIC ✓'
    ELSE array_to_string(roles, ', ')
  END as applies_to
FROM pg_policies
WHERE tablename IN ('users', 'auth_sessions', 'password_reset_tokens')
ORDER BY tablename, policyname;

-- Expected: Multiple policies for each table

-- =============================================
-- Test 4: Test lookup_user_for_password_reset function
-- =============================================

-- Note: Replace 'test@example.com' with an actual email from your users table
SELECT * FROM lookup_user_for_password_reset('test@example.com');

-- Expected: Returns user_id, user_email, mobile_number, account_type, account_status
-- Should NOT return password_hash

-- Test with mobile number (replace with actual mobile)
SELECT * FROM lookup_user_for_password_reset('9876543210');

-- Test with non-existent user
SELECT * FROM lookup_user_for_password_reset('nonexistent@example.com');

-- Expected: Returns empty result set (no error)

-- =============================================
-- Test 5: Test validate_password_reset_token function
-- =============================================

-- Test with invalid token
SELECT * FROM validate_password_reset_token('invalid-token-12345');

-- Expected: is_valid = false, error_message = 'Invalid reset token'

-- =============================================
-- Test 6: Create a test reset token manually
-- =============================================

-- First, get a user ID (replace with actual user ID from your database)
-- SELECT id FROM users LIMIT 1;

-- Create a test token (uncomment and replace user_id)
/*
INSERT INTO password_reset_tokens (user_id, token, expires_at)
VALUES (
  'your-user-id-here',
  'test-token-' || gen_random_uuid(),
  now() + interval '1 hour'
)
RETURNING token;
*/

-- Then test validation with the returned token
-- SELECT * FROM validate_password_reset_token('test-token-...');

-- Expected: is_valid = true, returns user_id and user_email

-- =============================================
-- Test 7: Check function permissions
-- =============================================

SELECT
  proname as function_name,
  proacl as access_privileges
FROM pg_proc
WHERE proname IN (
  'lookup_user_for_password_reset',
  'validate_password_reset_token',
  'reset_user_password'
);

-- Expected: Should show EXECUTE permission granted to PUBLIC

-- =============================================
-- Test 8: Verify password hashing works
-- =============================================

-- Test the underlying hash_password function
SELECT hash_password('TestPassword123') IS NOT NULL as password_hash_works;

-- Expected: password_hash_works = true

-- Test password verification
SELECT verify_password('TestPassword123', hash_password('TestPassword123')) as password_verify_works;

-- Expected: password_verify_works = true

-- =============================================
-- Test 9: Check session cleanup function
-- =============================================

SELECT clean_expired_sessions();

-- Expected: Completes without error (cleans up expired sessions and tokens)

-- =============================================
-- Test 10: Count RLS policies per table
-- =============================================

SELECT
  tablename,
  count(*) as policy_count
FROM pg_policies
WHERE tablename IN ('users', 'auth_sessions', 'password_reset_tokens')
GROUP BY tablename
ORDER BY tablename;

-- Expected output (approximate):
-- users: 4 policies
-- auth_sessions: 5 policies
-- password_reset_tokens: 4 policies

-- =============================================
-- Summary
-- =============================================

SELECT
  'Password Reset System' as component,
  CASE
    WHEN (
      SELECT count(*) FROM pg_tables
      WHERE tablename IN ('users', 'auth_sessions', 'password_reset_tokens')
        AND rowsecurity = true
    ) = 3 THEN '✓ All tables have RLS enabled'
    ELSE '✗ Some tables missing RLS'
  END as rls_status,
  CASE
    WHEN (
      SELECT count(*) FROM pg_proc
      WHERE proname IN (
        'lookup_user_for_password_reset',
        'validate_password_reset_token',
        'reset_user_password'
      )
    ) = 3 THEN '✓ All functions created'
    ELSE '✗ Some functions missing'
  END as functions_status,
  CASE
    WHEN (
      SELECT count(*) FROM pg_policies
      WHERE tablename IN ('users', 'auth_sessions', 'password_reset_tokens')
    ) >= 10 THEN '✓ RLS policies configured'
    ELSE '✗ Missing RLS policies'
  END as policies_status;

-- Expected: All status indicators should show ✓
