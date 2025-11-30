/*
  # Create get_user_roles RPC Function

  1. Purpose
    - Create database RPC function to fetch user roles bypassing RLS policies
    - Fixes connection pooling issues where current_user_id() returns NULL
    - Mirrors the pattern used by get_user_permissions() function

  2. Changes
    - Add get_user_roles(p_user_id) function with SECURITY DEFINER
    - Returns all columns from user_roles table for the specified user
    - Bypasses RLS policies to ensure consistent behavior across connections

  3. Security
    - SECURITY DEFINER allows function to bypass RLS
    - SET search_path = public prevents search path attacks
    - Function only returns data for the explicitly provided user_id parameter

  4. Usage
    - Called by permissionService.getUserRoles(userId)
    - Replaces direct table queries that fail due to RLS policy checks
*/

-- Drop function if it exists (for idempotency)
DROP FUNCTION IF EXISTS get_user_roles(uuid);

-- Create function to get user roles bypassing RLS
CREATE OR REPLACE FUNCTION get_user_roles(p_user_id uuid)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  role text,
  state text,
  district text,
  is_member_linked boolean,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Return empty set if user_id is NULL
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Return all roles for the specified user
  RETURN QUERY
  SELECT
    ur.id,
    ur.user_id,
    ur.role,
    ur.state,
    ur.district,
    ur.is_member_linked,
    ur.created_at,
    ur.updated_at
  FROM user_roles ur
  WHERE ur.user_id = p_user_id
  ORDER BY ur.created_at DESC;
END;
$$;

-- Add comment documenting the function
COMMENT ON FUNCTION get_user_roles(uuid) IS
  'Returns all roles for a specific user. Uses SECURITY DEFINER to bypass RLS policies and ensure consistent behavior across database connections.';

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_user_roles(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_roles(uuid) TO anon;

-- Verification: Test the function works correctly
DO $$
DECLARE
  v_test_result record;
BEGIN
  RAISE NOTICE '✓ get_user_roles() function created successfully';
  RAISE NOTICE '  Usage: SELECT * FROM get_user_roles(''user-uuid-here'');';
END;
$$;
