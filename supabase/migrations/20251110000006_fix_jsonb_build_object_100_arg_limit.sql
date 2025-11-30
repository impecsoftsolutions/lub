/*
  # Fix jsonb_build_object 100-Argument Limit

  ## Problem
  The three registration status update RPC functions use jsonb_build_object()
  with 53 field names × 2 (key + value) = 106 arguments, exceeding PostgreSQL's
  hard limit of 100 arguments per function call.

  Error: "Database error: cannot pass more than 100 arguments to a function"

  ## Solution
  Replace STEP 8 (response construction) in all three functions to use:
  - to_jsonb(mr) to auto-serialize all member_registrations columns
  - || jsonb_build_object('company_designation_name', cd.designation_name) to append computed field

  This reduces arguments from 106 to 2.

  ## Changes
  1. update_member_registration_status - Full implementation with new STEP 8
  2. admin_update_registration_status - Wrapper delegating to #1
  3. admin_update_member_registration_status - Wrapper delegating to #1

  ## Safety
  - Function signatures unchanged
  - Return shape unchanged: { success: true, registration: {...} }
  - SECURITY DEFINER unchanged
  - All permissions unchanged
  - Steps 1-7 (validation, auth, update, audit) unchanged
*/

-- ============================================================================
-- 1) ACTIVE FUNCTION: update_member_registration_status
-- ============================================================================

CREATE OR REPLACE FUNCTION update_member_registration_status(
  p_registration_id uuid,
  p_requesting_user_id uuid,
  p_new_status text,
  p_rejection_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_record RECORD;
  v_registration_record RECORD;
  v_is_authorized boolean := false;
  v_user_id_to_update uuid;
  v_result jsonb;
BEGIN
  -- ============================================================================
  -- STEP 1: VALIDATE INPUT PARAMETERS
  -- ============================================================================

  IF p_registration_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Registration ID is required'
    );
  END IF;

  IF p_requesting_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Requesting user ID is required'
    );
  END IF;

  IF p_new_status IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Status is required'
    );
  END IF;

  IF p_new_status NOT IN ('approved', 'rejected') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Status must be either ''approved'' or ''rejected'''
    );
  END IF;

  IF p_new_status = 'rejected' AND (p_rejection_reason IS NULL OR trim(p_rejection_reason) = '') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Rejection reason is required when rejecting a registration'
    );
  END IF;

  -- ============================================================================
  -- STEP 2: AUTHENTICATE REQUESTING USER
  -- ============================================================================

  SELECT * INTO v_user_record
  FROM users
  WHERE id = p_requesting_user_id
    AND account_status = 'active';

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User not found or inactive'
    );
  END IF;

  -- ============================================================================
  -- STEP 3: AUTHORIZE USER (admin, super_admin, or has appropriate role)
  -- ============================================================================

  IF v_user_record.account_type IN ('admin', 'both', 'super_admin') THEN
    v_is_authorized := true;
  END IF;

  IF NOT v_is_authorized THEN
    SELECT EXISTS(
      SELECT 1 FROM user_roles
      WHERE user_id = p_requesting_user_id
        AND role IN ('super_admin', 'admin', 'editor')
    ) INTO v_is_authorized;
  END IF;

  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User does not have permission to update registration status'
    );
  END IF;

  -- ============================================================================
  -- STEP 4: VALIDATE REGISTRATION EXISTS
  -- ============================================================================

  SELECT * INTO v_registration_record
  FROM member_registrations
  WHERE id = p_registration_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Registration not found'
    );
  END IF;

  -- ============================================================================
  -- STEP 5: UPDATE REGISTRATION STATUS
  -- ============================================================================

  UPDATE member_registrations
  SET status = p_new_status,
      rejection_reason = CASE
        WHEN p_new_status = 'rejected' THEN p_rejection_reason
        ELSE rejection_reason
      END,
      approval_date = CASE
        WHEN p_new_status = 'approved' THEN COALESCE(approval_date, now())
        ELSE approval_date
      END,
      last_modified_by = p_requesting_user_id,
      last_modified_at = now()
  WHERE id = p_registration_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Failed to update registration status'
    );
  END IF;

  -- ============================================================================
  -- STEP 6: UPDATE USER ACCOUNT TYPE (if approved and user_id exists)
  -- ============================================================================

  IF p_new_status = 'approved' AND v_registration_record.user_id IS NOT NULL THEN
    UPDATE users
    SET account_type = CASE
      WHEN account_type = 'general_user' THEN 'member'
      ELSE account_type
    END,
    updated_at = now()
    WHERE id = v_registration_record.user_id;
  END IF;

  -- ============================================================================
  -- STEP 7: LOG TO AUDIT HISTORY
  -- ============================================================================

  INSERT INTO member_audit_history (
    member_id,
    action_type,
    changed_by,
    change_reason,
    created_at
  ) VALUES (
    p_registration_id,
    'status_change',
    p_requesting_user_id,
    CASE
      WHEN p_new_status = 'rejected' THEN p_rejection_reason
      ELSE 'Status changed to ' || p_new_status
    END,
    now()
  );

  -- ============================================================================
  -- STEP 8: BUILD RESPONSE USING ROW SERIALIZATION (FIXED: 100-arg limit)
  -- ============================================================================
  -- OLD: 53 fields × 2 = 106 arguments → exceeds limit
  -- NEW: to_jsonb(mr) auto-serializes all columns, append 1 computed field

  SELECT (to_jsonb(mr.*) || jsonb_build_object('company_designation_name', cd.designation_name))
  INTO v_result
  FROM member_registrations mr
  LEFT JOIN company_designations cd ON mr.company_designation_id = cd.id
  WHERE mr.id = p_registration_id;

  -- Return success with the updated registration
  RETURN jsonb_build_object(
    'success', true,
    'registration', v_result
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error in update_member_registration_status: % %', SQLERRM, SQLSTATE;
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Database error: ' || SQLERRM
    );
END;
$$;

COMMENT ON FUNCTION update_member_registration_status(uuid, uuid, text, text) IS
  'SECURITY DEFINER RPC to update member registration status (approve/reject). Used by Admin → Member Registrations via supabase.ts memberRegistrationService.updateStatusWithReason(). Fixed: 100-arg limit by using row serialization instead of explicit jsonb_build_object.';

-- ============================================================================
-- 2) LEGACY WRAPPER: admin_update_registration_status
-- ============================================================================
-- Delegates to main function to avoid code duplication and drift

CREATE OR REPLACE FUNCTION admin_update_registration_status(
  p_registration_id uuid,
  p_requesting_user_id uuid,
  p_new_status text,
  p_rejection_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delegate to main function (single source of truth)
  RETURN update_member_registration_status(
    p_registration_id,
    p_requesting_user_id,
    p_new_status,
    p_rejection_reason
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error in admin_update_registration_status: % %', SQLERRM, SQLSTATE;
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Database error: ' || SQLERRM
    );
END;
$$;

COMMENT ON FUNCTION admin_update_registration_status(uuid, uuid, text, text) IS
  'Legacy wrapper → delegates to update_member_registration_status to avoid code drift. Not called by frontend.';

-- ============================================================================
-- 3) LEGACY WRAPPER: admin_update_member_registration_status
-- ============================================================================
-- Delegates to main function to avoid code duplication and drift

CREATE OR REPLACE FUNCTION admin_update_member_registration_status(
  p_registration_id uuid,
  p_requesting_user_id uuid,
  p_new_status text,
  p_rejection_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delegate to main function (single source of truth)
  RETURN update_member_registration_status(
    p_registration_id,
    p_requesting_user_id,
    p_new_status,
    p_rejection_reason
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error in admin_update_member_registration_status: % %', SQLERRM, SQLSTATE;
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Database error: ' || SQLERRM
    );
END;
$$;

COMMENT ON FUNCTION admin_update_member_registration_status(uuid, uuid, text, text) IS
  'Legacy wrapper → delegates to update_member_registration_status to avoid code drift. Not called by frontend.';

-- ============================================================================
-- GRANT PERMISSIONS (unchanged from previous migrations)
-- ============================================================================

GRANT EXECUTE ON FUNCTION update_member_registration_status(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION update_member_registration_status(uuid, uuid, text, text) TO anon;

GRANT EXECUTE ON FUNCTION admin_update_registration_status(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_update_registration_status(uuid, uuid, text, text) TO anon;

GRANT EXECUTE ON FUNCTION admin_update_member_registration_status(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_update_member_registration_status(uuid, uuid, text, text) TO anon;

-- ============================================================================
-- LOG COMPLETION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✓ Fixed update_member_registration_status: Row serialization (106 args → 2 args)';
  RAISE NOTICE '✓ Fixed admin_update_registration_status: Wrapper delegates to main';
  RAISE NOTICE '✓ Fixed admin_update_member_registration_status: Wrapper delegates to main';
  RAISE NOTICE '✓ All functions now bypass PostgreSQL 100-argument limit';
  RAISE NOTICE '✓ Return shape unchanged: { success, registration }';
END $$;
