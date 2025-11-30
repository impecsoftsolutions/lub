/*
  # Create admin_delete_member_lub_role_assignment RPC

  1. Problem
    - Delete button shows success toast but record not deleted
    - Current implementation uses direct DELETE query blocked by RLS
    - Service: supabase.from('member_lub_role_assignments').delete().eq('id', id)
    - RLS blocks this, but error is misinterpreted as success

  2. Solution
    - Create SECURITY DEFINER RPC to bypass RLS
    - Performs authorization checks (account_type OR user_roles)
    - Actually deletes the record
    - Logs to member_audit_history
    - Pattern matches other admin RPCs

  3. Authorization
    - Checks users.account_type IN ('admin', 'both', 'super_admin')
    - OR user_roles.role IN ('super_admin', 'admin', 'editor')
    - Requires account_status = 'active'
    - Returns error if not authorized

  4. Audit Trail
    - Inserts record into member_audit_history
    - action_type = 'delete'
    - Includes descriptive change_reason with role/level/geographic details
*/

-- =============================================================================
-- Create Delete RPC
-- =============================================================================

CREATE OR REPLACE FUNCTION admin_delete_member_lub_role_assignment(
  p_requesting_user_id uuid,
  p_assignment_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_authorized boolean := false;
  v_assignment_record RECORD;
  v_role_name text;
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
  -- Existence Check & Get Assignment Details for Audit
  -- ==========================================================================
  
  SELECT 
    a.*,
    r.role_name
  INTO v_assignment_record
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
  -- Delete Assignment
  -- ==========================================================================
  
  DELETE FROM member_lub_role_assignments
  WHERE id = p_assignment_id;

  -- ==========================================================================
  -- Audit Logging
  -- ==========================================================================
  
  INSERT INTO member_audit_history (
    member_id,
    action_type,
    changed_by,
    change_reason
  ) VALUES (
    v_assignment_record.member_id,
    'delete',
    p_requesting_user_id,
    format(
      'Deleted LUB role assignment: role=%s, level=%s, state=%s, district=%s, committee_year=%s',
      v_assignment_record.role_name,
      v_assignment_record.level,
      COALESCE(v_assignment_record.state, 'N/A'),
      COALESCE(v_assignment_record.district, 'N/A'),
      COALESCE(v_assignment_record.committee_year, 'N/A')
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

GRANT EXECUTE ON FUNCTION admin_delete_member_lub_role_assignment(uuid, uuid) TO postgres, authenticated, anon;

-- =============================================================================
-- Add Comment
-- =============================================================================

COMMENT ON FUNCTION admin_delete_member_lub_role_assignment(uuid, uuid) IS
  'Admin-only RPC: Deletes a member LUB role assignment. Performs authorization check, deletes record, logs to audit history. SECURITY DEFINER bypasses RLS. Returns {success: true/false, error?: string}.';

-- =============================================================================
-- Log Completion
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Created admin_delete_member_lub_role_assignment RPC';
  RAISE NOTICE 'Delete operations will now work correctly via SECURITY DEFINER';
  RAISE NOTICE 'Audit trail preserved in member_audit_history';
END $$;

-- =============================================================================
-- End
-- =============================================================================
