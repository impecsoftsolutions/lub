/*
  # Create get_deleted_members RPC Function

  1. Purpose
    - Provides RLS-safe access to deleted_members table via SECURITY DEFINER function
    - Eliminates direct table access issues with custom authentication
    - Centralizes authorization logic for viewing deleted members
    - Supports optional search filtering across key fields

  2. Authorization
    - Validates requesting user is active (account_status = 'active')
    - Checks admin privileges via two methods:
      a) users.account_type IN ('admin', 'both') - Note: 'super_admin' is NOT a valid account_type
      b) user_roles.role IN ('super_admin', 'admin', 'editor')
    - Raises exception if unauthorized (no silent failures)

  3. Features
    - Returns deleted member records ordered by deletion date (newest first)
    - Optional search parameter filters: full_name, email, mobile_number, company_name
    - Case-insensitive ILIKE search across all searchable fields
    - Returns core fields needed for display and restore operations

  4. Security
    - SECURITY DEFINER bypasses RLS policies with explicit authorization
    - SET search_path = public prevents search_path attacks
    - Only authenticated users can execute (GRANT TO authenticated)
    - Authorization check prevents unauthorized access
*/

-- Drop existing function if it exists (for redeployment)
DROP FUNCTION IF EXISTS public.get_deleted_members(uuid, text);

-- Create RLS-safe RPC to fetch deleted members
CREATE OR REPLACE FUNCTION public.get_deleted_members(
  p_requesting_user_id uuid,
  p_search text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  original_id uuid,
  full_name text,
  email text,
  mobile_number text,
  company_name text,
  status text,
  deleted_at timestamptz,
  deleted_by uuid,
  deletion_reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_authorized boolean := false;
BEGIN
  -- Authorize requester: active user with admin privilege
  -- Method 1: Check account_type for admin or both (NOT 'super_admin' - invalid account_type)
  -- Method 2: Check user_roles for admin roles (super_admin, admin, editor)
  SELECT EXISTS(
    SELECT 1
    FROM users u
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    WHERE u.id = p_requesting_user_id
      AND u.account_status = 'active'
      AND (
        u.account_type IN ('admin', 'both')
        OR ur.role IN ('super_admin', 'admin', 'editor')
      )
  ) INTO v_is_authorized;

  -- Deny access if not authorized (explicit error message)
  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  -- Return deleted members with optional search filter
  RETURN QUERY
    SELECT
      dm.id,
      dm.original_id,
      dm.full_name,
      dm.email,
      dm.mobile_number,
      dm.company_name,
      dm.status,
      dm.deleted_at,
      dm.deleted_by,
      dm.deletion_reason
    FROM deleted_members dm
    WHERE (
      p_search IS NULL
      OR dm.full_name ILIKE '%' || p_search || '%'
      OR dm.email ILIKE '%' || p_search || '%'
      OR dm.company_name ILIKE '%' || p_search || '%'
      OR dm.mobile_number ILIKE '%' || p_search || '%'
    )
    ORDER BY dm.deleted_at DESC;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_deleted_members(uuid, text) TO authenticated;

-- Add function comment for documentation
COMMENT ON FUNCTION public.get_deleted_members(uuid, text) IS
  'SECURITY DEFINER function that returns deleted members for authorized admin users. Bypasses RLS with explicit authorization check. Supports optional search filtering across full_name, email, mobile_number, and company_name. Returns records ordered by deleted_at DESC.';
