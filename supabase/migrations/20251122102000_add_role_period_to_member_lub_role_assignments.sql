/*
  # Add Role Period to Member LUB Role Assignments

  1. Purpose
    - Add role_start_date and role_end_date columns to member_lub_role_assignments
    - Update admin_assign_member_lub_role RPC to accept and validate date parameters
    - Enable tracking of committee membership periods for Leadership page display

  2. Changes
    - Add role_start_date (date) column - nullable for existing data
    - Add role_end_date (date) column - nullable for existing data
    - Update admin_assign_member_lub_role function signature to include dates
    - Add validation: both dates required, end_date >= start_date
    - Add audit logging for role assignments with period information

  3. Security
    - Maintains existing RLS policies on member_lub_role_assignments
    - SECURITY DEFINER with explicit authorization checks
    - Validates requesting user has admin/editor privileges
*/

-- =====================================================================
-- Add role period columns to member_lub_role_assignments
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'member_lub_role_assignments'
      AND column_name = 'role_start_date'
  ) THEN
    ALTER TABLE member_lub_role_assignments
      ADD COLUMN role_start_date date;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'member_lub_role_assignments'
      AND column_name = 'role_end_date'
  ) THEN
    ALTER TABLE member_lub_role_assignments
      ADD COLUMN role_end_date date;
  END IF;
END;
$$;

-- =====================================================================
-- Update admin_assign_member_lub_role RPC to include role period dates
-- =====================================================================

CREATE OR REPLACE FUNCTION public.admin_assign_member_lub_role(
  p_requesting_user_id uuid,
  p_member_id uuid,
  p_role_id uuid,
  p_level text,
  p_state text DEFAULT NULL,
  p_district text DEFAULT NULL,
  p_role_start_date date DEFAULT NULL,
  p_role_end_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_record RECORD;
  v_member_record RECORD;
  v_role_record RECORD;
  v_is_authorized boolean := false;
  v_assignment_id uuid;
BEGIN
  -- -------- 1. Validate required params ----------
  IF p_requesting_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User ID is required');
  END IF;

  IF p_member_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Member ID is required');
  END IF;

  IF p_role_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'LUB role ID is required');
  END IF;

  IF p_level IS NULL OR p_level NOT IN ('national','state','district','city') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Level must be one of national/state/district/city');
  END IF;

  IF p_role_start_date IS NULL OR p_role_end_date IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Both role_start_date and role_end_date are required');
  END IF;

  IF p_role_end_date < p_role_start_date THEN
    RETURN jsonb_build_object('success', false, 'error', 'role_end_date cannot be before role_start_date');
  END IF;

  -- -------- 2. Authenticate requester ----------
  SELECT *
  INTO v_user_record
  FROM users
  WHERE id = p_requesting_user_id
    AND account_status = 'active';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found or inactive');
  END IF;

  -- -------- 3. Authorize (same pattern as other admin RPCs) ----------
  IF v_user_record.account_type IN ('admin','super_admin','both') THEN
    v_is_authorized := true;
  ELSIF EXISTS (
    SELECT 1
    FROM user_roles ur
    WHERE ur.user_id = p_requesting_user_id
      AND ur.role IN ('super_admin','admin','editor')
  ) THEN
    v_is_authorized := true;
  END IF;

  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object('success', false, 'error', 'authorization: insufficient permissions');
  END IF;

  -- -------- 4. Validate member and role ----------
  SELECT *
  INTO v_member_record
  FROM member_registrations
  WHERE id = p_member_id
    AND is_deleted = false;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Member registration not found');
  END IF;

  SELECT *
  INTO v_role_record
  FROM lub_roles_master
  WHERE id = p_role_id
    AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'LUB role not found or inactive');
  END IF;

  -- -------- 5. Prevent exact duplicates for same period ----------
  IF EXISTS (
    SELECT 1
    FROM member_lub_role_assignments a
    WHERE a.member_id = p_member_id
      AND a.role_id = p_role_id
      AND a.level = p_level
      AND COALESCE(a.state, '') = COALESCE(p_state, '')
      AND COALESCE(a.district, '') = COALESCE(p_district, '')
      AND a.role_start_date = p_role_start_date
      AND a.role_end_date = p_role_end_date
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'An identical role assignment already exists for this member and period');
  END IF;

  -- -------- 6. Insert assignment ----------
  INSERT INTO member_lub_role_assignments (
    member_id,
    role_id,
    level,
    state,
    district,
    role_start_date,
    role_end_date,
    created_at,
    updated_at
  )
  VALUES (
    p_member_id,
    p_role_id,
    p_level,
    p_state,
    p_district,
    p_role_start_date,
    p_role_end_date,
    now(),
    now()
  )
  RETURNING id INTO v_assignment_id;

  -- -------- 7. Simple audit ----------
  INSERT INTO member_audit_history (
    member_id,
    action_type,
    changed_by,
    change_reason
  )
  VALUES (
    p_member_id,
    'assign_lub_role',
    p_requesting_user_id,
    format(
      'Assigned LUB role %s at level %s (%s - %s)',
      v_role_record.role_name,
      p_level,
      p_role_start_date::text,
      p_role_end_date::text
    )
  );

  -- -------- 8. Return success ----------
  RETURN jsonb_build_object(
    'success', true,
    'assignment_id', v_assignment_id
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'admin_assign_member_lub_role error: % %', SQLERRM, SQLSTATE;
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.admin_assign_member_lub_role(uuid, uuid, uuid, text, text, text, date, date) TO authenticated, anon;

-- Add function comment
COMMENT ON FUNCTION public.admin_assign_member_lub_role(uuid, uuid, uuid, text, text, text, date, date) IS
  'SECURITY DEFINER function for admins/editors to assign LUB roles to members with role period dates. Bypasses RLS with explicit authorization check. Validates member and role are active, dates are valid (end >= start), and prevents duplicate assignments. Supports organizational levels (national/state/district/city). Used by AdminDesignationsManagement Member Role Assignments feature.';

-- =====================================================================
-- End
-- =====================================================================
