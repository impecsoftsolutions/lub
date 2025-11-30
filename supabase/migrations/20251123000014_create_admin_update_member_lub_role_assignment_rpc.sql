/*
  # Create admin_update_member_lub_role_assignment RPC

  1. Problem
    - Edit button shows success toast but record not updated
    - Current implementation uses direct UPDATE query blocked by RLS
    - Service: supabase.from('member_lub_role_assignments').update(...).eq('id', id)
    - RLS blocks this, but error is misinterpreted as success

  2. Solution
    - Create SECURITY DEFINER RPC to bypass RLS
    - Performs authorization checks (account_type OR user_roles)
    - Actually updates the record
    - Validates all inputs (level requirements, dates, duplicates)
    - Logs to member_audit_history
    - Pattern matches other admin RPCs

  3. Updatable Fields
    - role_id (lub_roles_master.id)
    - level ('national', 'state', 'district', 'city')
    - state (text, required for state/district/city levels)
    - district (text, required for district/city levels)
    - committee_year (4-digit year string)
    - role_start_date (optional date)
    - role_end_date (optional date)
    - Note: member_id is NOT changeable (shown read-only in UI)

  4. Validation
    - Level must be valid enum value
    - Geographic requirements based on level
    - committee_year must be 4-digit year
    - Date range validation (end >= start if both provided)
    - Duplicate check (same member+role+level+state+district+year)
    - Member and role must exist and be active

  5. Audit Trail
    - Inserts record into member_audit_history
    - action_type = 'update'
    - Includes old/new value summary in change_reason
*/

-- =============================================================================
-- Create Update RPC
-- =============================================================================

CREATE OR REPLACE FUNCTION admin_update_member_lub_role_assignment(
  p_requesting_user_id uuid,
  p_assignment_id uuid,
  p_role_id uuid,
  p_level text,
  p_state text DEFAULT NULL,
  p_district text DEFAULT NULL,
  p_committee_year text DEFAULT NULL,
  p_role_start_date date DEFAULT NULL,
  p_role_end_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_authorized boolean := false;
  v_old_assignment RECORD;
  v_member_record RECORD;
  v_role_record RECORD;
  v_old_role_name text;
  v_new_role_name text;
BEGIN
  -- ==========================================================================
  -- Authorization Check
  -- ==========================================================================
  
  SELECT TRUE
  INTO v_is_authorized
  FROM users u
  WHERE u.id = p_requesting_user_id
    AND u.account_status = 'active'
    AND (
      -- Path A: Direct admin account type
      u.account_type IN ('admin', 'both', 'super_admin')
      OR
      -- Path B: Admin role via user_roles
      EXISTS (
        SELECT 1
        FROM user_roles ur
        WHERE ur.user_id = u.id
          AND ur.role IN ('super_admin', 'admin', 'editor')
      )
    )
  LIMIT 1;

  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'authorization: not authorized'
    );
  END IF;

  -- ==========================================================================
  -- Get Existing Assignment
  -- ==========================================================================
  
  SELECT 
    a.*,
    r.role_name as current_role_name
  INTO v_old_assignment
  FROM member_lub_role_assignments a
  INNER JOIN lub_roles_master r ON r.id = a.role_id
  WHERE a.id = p_assignment_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'validation: assignment not found'
    );
  END IF;

  -- ==========================================================================
  -- Validation: Level
  -- ==========================================================================
  
  IF p_level IS NULL OR p_level NOT IN ('national', 'state', 'district', 'city') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'validation: level must be one of national/state/district/city'
    );
  END IF;

  -- ==========================================================================
  -- Validation: Geographic Requirements
  -- ==========================================================================
  
  -- State required for state/district/city levels
  IF p_level IN ('state', 'district', 'city') AND (p_state IS NULL OR TRIM(p_state) = '') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'validation: state is required for this level'
    );
  END IF;

  -- District required for district/city levels
  IF p_level IN ('district', 'city') AND (p_district IS NULL OR TRIM(p_district) = '') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'validation: district is required for this level'
    );
  END IF;

  -- National level should not have state/district
  IF p_level = 'national' THEN
    p_state := NULL;
    p_district := NULL;
  END IF;

  -- ==========================================================================
  -- Validation: Committee Year
  -- ==========================================================================
  
  IF p_committee_year IS NOT NULL AND p_committee_year !~ '^[0-9]{4}$' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'validation: committee year must be a 4-digit year (e.g., 2025)'
    );
  END IF;

  -- ==========================================================================
  -- Validation: Date Range
  -- ==========================================================================
  
  IF p_role_start_date IS NOT NULL AND p_role_end_date IS NOT NULL THEN
    IF p_role_end_date < p_role_start_date THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'validation: role end date cannot be before start date'
      );
    END IF;
  END IF;

  -- ==========================================================================
  -- Validation: Member Exists and Active
  -- ==========================================================================
  
  SELECT *
  INTO v_member_record
  FROM member_registrations
  WHERE id = v_old_assignment.member_id
    AND status = 'approved'
    AND is_active = TRUE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'validation: member not found or inactive'
    );
  END IF;

  -- ==========================================================================
  -- Validation: Role Exists and Active
  -- ==========================================================================
  
  SELECT *
  INTO v_role_record
  FROM lub_roles_master
  WHERE id = p_role_id
    AND is_active = TRUE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'validation: role not found or inactive'
    );
  END IF;

  -- ==========================================================================
  -- Validation: Check for Duplicate Assignment
  -- ==========================================================================
  
  IF EXISTS (
    SELECT 1
    FROM member_lub_role_assignments
    WHERE id != p_assignment_id
      AND member_id = v_old_assignment.member_id
      AND role_id = p_role_id
      AND level = p_level
      AND LOWER(TRIM(COALESCE(state, ''))) = LOWER(TRIM(COALESCE(p_state, '')))
      AND LOWER(TRIM(COALESCE(district, ''))) = LOWER(TRIM(COALESCE(p_district, '')))
      AND COALESCE(committee_year, '') = COALESCE(p_committee_year, '')
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'validation: duplicate assignment exists for this member, role, level, and geographic scope'
    );
  END IF;

  -- ==========================================================================
  -- Update Assignment
  -- ==========================================================================
  
  UPDATE member_lub_role_assignments
  SET
    role_id = p_role_id,
    level = p_level,
    state = p_state,
    district = p_district,
    committee_year = p_committee_year,
    role_start_date = p_role_start_date,
    role_end_date = p_role_end_date,
    updated_at = NOW()
  WHERE id = p_assignment_id;

  -- ==========================================================================
  -- Audit Logging
  -- ==========================================================================
  
  INSERT INTO member_audit_history (
    member_id,
    action_type,
    changed_by,
    field_name,
    change_reason
  ) VALUES (
    v_old_assignment.member_id,
    'update',
    p_requesting_user_id,
    'member_lub_role_assignment',
    format(
      'Updated LUB role assignment: role=%s→%s, level=%s→%s, state=%s→%s, district=%s→%s, year=%s→%s',
      v_old_assignment.current_role_name,
      v_role_record.role_name,
      v_old_assignment.level,
      p_level,
      COALESCE(v_old_assignment.state, 'N/A'),
      COALESCE(p_state, 'N/A'),
      COALESCE(v_old_assignment.district, 'N/A'),
      COALESCE(p_district, 'N/A'),
      COALESCE(v_old_assignment.committee_year, 'N/A'),
      COALESCE(p_committee_year, 'N/A')
    )
  );

  -- ==========================================================================
  -- Return Success
  -- ==========================================================================
  
  RETURN jsonb_build_object('success', true);

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('database error: %s', SQLERRM)
    );
END;
$$;

-- =============================================================================
-- Grant Permissions
-- =============================================================================

GRANT EXECUTE ON FUNCTION admin_update_member_lub_role_assignment(uuid, uuid, uuid, text, text, text, text, date, date) TO postgres, authenticated, anon;

-- =============================================================================
-- Add Comment
-- =============================================================================

COMMENT ON FUNCTION admin_update_member_lub_role_assignment(uuid, uuid, uuid, text, text, text, text, date, date) IS
  'Admin-only RPC: Updates a member LUB role assignment. Performs authorization check, validates all inputs, checks for duplicates, updates record, logs to audit history. SECURITY DEFINER bypasses RLS. Returns {success: true/false, error?: string}.';

-- =============================================================================
-- Log Completion
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Created admin_update_member_lub_role_assignment RPC';
  RAISE NOTICE 'Update operations will now work correctly via SECURITY DEFINER';
  RAISE NOTICE 'Full validation includes level requirements, dates, and duplicate checks';
  RAISE NOTICE 'Audit trail preserved in member_audit_history';
END $$;

-- =============================================================================
-- End
-- =============================================================================
