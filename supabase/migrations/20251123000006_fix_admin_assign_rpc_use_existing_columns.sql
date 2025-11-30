/*
  # Fix admin_assign_member_lub_role RPC - Use Existing Columns

  1. Issue
    - RPC references columns that may not exist in live database
    - Need to use correct column names from member_registrations
    - Must handle nullable role_start_date, role_end_date, committee_year

  2. Fixes Applied
    - Use is_active and status columns (not is_deleted)
    - Reference role_start_date, role_end_date, committee_year correctly
    - Make dates optional (not required)
    - Proper null handling in duplicate check

  3. No Signature Change
    - Same parameters TypeScript expects
    - Same authorization and validation logic
    - Same return structure
*/

-- =====================================================================
-- Recreate admin_assign_member_lub_role with correct column references
-- =====================================================================

CREATE OR REPLACE FUNCTION public.admin_assign_member_lub_role(
  p_requesting_user_id uuid,
  p_member_id uuid,
  p_role_id uuid,
  p_level text,
  p_state text DEFAULT NULL,
  p_district text DEFAULT NULL,
  p_role_start_date date DEFAULT NULL,
  p_role_end_date date DEFAULT NULL,
  p_committee_year text DEFAULT NULL
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

  -- Validate committee_year format if provided
  IF p_committee_year IS NOT NULL AND p_committee_year !~ '^[0-9]{4}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Committee year must be a 4-digit year (e.g., 2025)');
  END IF;

  -- Validate dates if both provided
  IF p_role_start_date IS NOT NULL AND p_role_end_date IS NOT NULL THEN
    IF p_role_end_date < p_role_start_date THEN
      RETURN jsonb_build_object('success', false, 'error', 'role_end_date cannot be before role_start_date');
    END IF;
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

  -- -------- 3. Authorize ----------
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
  -- Use correct columns: is_active and status (NOT is_deleted)
  SELECT *
  INTO v_member_record
  FROM member_registrations
  WHERE id = p_member_id
    AND status = 'approved'
    AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Member registration not found or not active');
  END IF;

  SELECT *
  INTO v_role_record
  FROM lub_roles_master
  WHERE id = p_role_id
    AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'LUB role not found or inactive');
  END IF;

  -- -------- 5. Prevent exact duplicates ----------
  -- Use proper null handling for optional fields
  IF EXISTS (
    SELECT 1
    FROM member_lub_role_assignments a
    WHERE a.member_id = p_member_id
      AND a.role_id = p_role_id
      AND a.level = p_level
      AND COALESCE(a.state, '') = COALESCE(p_state, '')
      AND COALESCE(a.district, '') = COALESCE(p_district, '')
      AND COALESCE(a.committee_year, '') = COALESCE(p_committee_year, '')
      AND (
        (a.role_start_date IS NULL AND p_role_start_date IS NULL) OR
        (a.role_start_date = p_role_start_date)
      )
      AND (
        (a.role_end_date IS NULL AND p_role_end_date IS NULL) OR
        (a.role_end_date = p_role_end_date)
      )
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'An identical role assignment already exists for this member');
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
    committee_year,
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
    p_committee_year,
    now(),
    now()
  )
  RETURNING id INTO v_assignment_id;

  -- -------- 7. Audit log ----------
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
      'Assigned LUB role %s at level %s%s%s',
      v_role_record.role_name,
      p_level,
      CASE WHEN p_committee_year IS NOT NULL THEN ' for year ' || p_committee_year ELSE '' END,
      CASE 
        WHEN p_role_start_date IS NOT NULL AND p_role_end_date IS NOT NULL 
        THEN ' (' || p_role_start_date::text || ' - ' || p_role_end_date::text || ')'
        WHEN p_role_start_date IS NOT NULL
        THEN ' (from ' || p_role_start_date::text || ')'
        WHEN p_role_end_date IS NOT NULL
        THEN ' (until ' || p_role_end_date::text || ')'
        ELSE ''
      END
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
GRANT EXECUTE ON FUNCTION public.admin_assign_member_lub_role(uuid, uuid, uuid, text, text, text, date, date, text) TO authenticated, anon;

-- Add function comment
COMMENT ON FUNCTION public.admin_assign_member_lub_role(uuid, uuid, uuid, text, text, text, date, date, text) IS
  'SECURITY DEFINER function for admins/editors to assign LUB roles to members. Fixed to use correct columns (is_active, status) and handle nullable dates/committee_year. Validates member is active and approved, prevents duplicates, supports organizational levels.';

-- =====================================================================
-- End
-- =====================================================================
