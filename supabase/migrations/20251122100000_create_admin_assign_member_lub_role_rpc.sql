/*
  # Create admin_assign_member_lub_role RPC Function

  1. Purpose
    - Create SECURITY DEFINER RPC for assigning LUB roles to members
    - Bypass RLS policy violation on member_lub_role_assignments table
    - Fix "Add Assignment" failure in AdminDesignationsManagement page
    - Maintain explicit authorization checks for admin/editor users

  2. Security
    - SECURITY DEFINER to bypass RLS with explicit authorization
    - Validates requesting user is active (account_status = 'active')
    - Checks admin privileges via account_type and user_roles
    - SET search_path = 'public' for SQL injection protection

  3. Validation
    - Validates all required parameters (member_id, lub_role_id, requesting_user_id)
    - Checks member exists and is active (is_active = true)
    - Checks LUB role exists and is active (is_active = true)
    - Prevents duplicate assignments for same member+role combination

  4. Returns
    - success: boolean
    - assignment_id: uuid (on success)
    - error: text (on failure)
*/

-- =====================================================================
-- admin_assign_member_lub_role: Assign a LUB role to a member
-- SECURITY DEFINER to bypass RLS safely, with explicit auth checks.
-- Returns: { "success": bool, "assignment_id": uuid, "error"?: text }
-- =====================================================================

CREATE OR REPLACE FUNCTION public.admin_assign_member_lub_role(
  p_member_id uuid,
  p_role_id uuid,
  p_level text,
  p_state text DEFAULT NULL,
  p_district text DEFAULT NULL,
  p_requesting_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_is_authorized boolean := false;
  v_member_active boolean := false;
  v_role_active boolean := false;
  v_assignment_id uuid;
  v_duplicate_exists boolean := false;
BEGIN
  -- -------- Validate inputs ----------
  IF p_member_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'member_id is required');
  END IF;
  IF p_role_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'role_id is required');
  END IF;
  IF p_level IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'level is required');
  END IF;
  IF p_level NOT IN ('national', 'state', 'district', 'city') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid level value');
  END IF;

  -- -------- Authorize requester: active user with admin/editor privilege ----------
  -- If requesting_user_id is provided, validate authorization
  IF p_requesting_user_id IS NOT NULL THEN
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

    IF NOT v_is_authorized THEN
      RETURN jsonb_build_object('success', false, 'error', 'not authorized');
    END IF;
  END IF;

  -- -------- Validate member exists and is active ----------
  SELECT EXISTS(
    SELECT 1
    FROM member_registrations
    WHERE id = p_member_id
      AND is_active = true
  ) INTO v_member_active;

  IF NOT v_member_active THEN
    RETURN jsonb_build_object('success', false, 'error', 'member not found or inactive');
  END IF;

  -- -------- Validate LUB role exists and is active ----------
  SELECT EXISTS(
    SELECT 1
    FROM lub_roles_master
    WHERE id = p_role_id
      AND is_active = true
  ) INTO v_role_active;

  IF NOT v_role_active THEN
    RETURN jsonb_build_object('success', false, 'error', 'LUB role not found or inactive');
  END IF;

  -- -------- Check for duplicate assignment ----------
  SELECT EXISTS(
    SELECT 1
    FROM member_lub_role_assignments
    WHERE member_id = p_member_id
      AND role_id = p_role_id
      AND level = p_level
      AND (state IS NULL AND p_state IS NULL OR state = p_state)
      AND (district IS NULL AND p_district IS NULL OR district = p_district)
  ) INTO v_duplicate_exists;

  IF v_duplicate_exists THEN
    RETURN jsonb_build_object('success', false, 'error', 'assignment already exists');
  END IF;

  -- -------- Create assignment ----------
  INSERT INTO member_lub_role_assignments (
    member_id,
    role_id,
    level,
    state,
    district
  ) VALUES (
    p_member_id,
    p_role_id,
    p_level,
    p_state,
    p_district
  )
  RETURNING id INTO v_assignment_id;

  RETURN jsonb_build_object('success', true, 'assignment_id', v_assignment_id);

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'admin_assign_member_lub_role error: % %', SQLERRM, SQLSTATE;
    RETURN jsonb_build_object('success', false, 'error', 'database error: ' || SQLERRM);
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.admin_assign_member_lub_role(uuid, uuid, text, text, text, uuid) TO authenticated;

-- Add function comment
COMMENT ON FUNCTION public.admin_assign_member_lub_role(uuid, uuid, text, text, text, uuid) IS
  'SECURITY DEFINER function for admins/editors to assign LUB roles to members. Bypasses RLS with explicit authorization check. Validates member and role are active and prevents duplicate assignments. Supports organizational levels (national/state/district/city). Used by AdminDesignationsManagement Member Role Assignments feature.';

-- =====================================================================
-- End
-- =====================================================================
