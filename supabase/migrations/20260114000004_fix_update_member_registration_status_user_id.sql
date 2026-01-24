/*
  # Fix update_member_registration_status user_id resolution on approval

  - Resolve missing member_registrations.user_id by matching email/mobile to users
  - Update users.account_type when approved
  - Backfill approved registrations with missing user_id and account_type
*/

CREATE OR REPLACE FUNCTION public.update_member_registration_status(
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

  IF v_user_record.account_type IN ('admin', 'both') THEN
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
  -- STEP 6: UPDATE USER ACCOUNT TYPE (if approved and user_id exists or can be resolved)
  -- ============================================================================

  IF p_new_status = 'approved' THEN
    v_user_id_to_update := v_registration_record.user_id;

    IF v_user_id_to_update IS NULL THEN
      SELECT u.id
      INTO v_user_id_to_update
      FROM users u
      WHERE (
        (v_registration_record.email IS NOT NULL AND u.email = v_registration_record.email)
        OR (v_registration_record.mobile_number IS NOT NULL AND u.mobile_number = v_registration_record.mobile_number)
      )
      AND (
        SELECT COUNT(*)
        FROM users u2
        WHERE (
          (v_registration_record.email IS NOT NULL AND u2.email = v_registration_record.email)
          OR (v_registration_record.mobile_number IS NOT NULL AND u2.mobile_number = v_registration_record.mobile_number)
        )
      ) = 1;

      IF v_user_id_to_update IS NOT NULL THEN
        UPDATE member_registrations
        SET user_id = v_user_id_to_update
        WHERE id = p_registration_id
          AND user_id IS NULL;
      END IF;
    END IF;

    IF v_user_id_to_update IS NOT NULL THEN
      UPDATE users
      SET account_type = CASE
        WHEN account_type = 'general_user' THEN 'member'
        ELSE account_type
      END,
      updated_at = now()
      WHERE id = v_user_id_to_update;
    END IF;
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
  -- OLD: 53 fields x 2 = 106 arguments exceeds limit
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

-- Backfill missing user_id for approved registrations (safe single-match only)
WITH candidate_matches AS (
  SELECT
    mr.id AS registration_id,
    u.id AS user_id,
    COUNT(*) OVER (PARTITION BY mr.id) AS match_count
  FROM member_registrations mr
  JOIN users u ON (
    (mr.email IS NOT NULL AND u.email = mr.email)
    OR (mr.mobile_number IS NOT NULL AND u.mobile_number = mr.mobile_number)
  )
  WHERE mr.user_id IS NULL
    AND mr.status = 'approved'
)
UPDATE member_registrations mr
SET user_id = cm.user_id
FROM candidate_matches cm
WHERE mr.id = cm.registration_id
  AND cm.match_count = 1;

-- Backfill account_type for approved registrations
UPDATE users u
SET account_type = 'member',
    updated_at = now()
FROM member_registrations mr
WHERE mr.user_id = u.id
  AND mr.status = 'approved'
  AND u.account_type = 'general_user';
