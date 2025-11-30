/*
  # Fix admin_update_registration_status Function Overload

  ## Problem
  - JavaScript RPC call conditionally includes p_rejection_reason parameter
  - When parameter is omitted, PostgREST can't find matching function signature
  - Gets error: "cannot pass more than 100 arguments to a function"
  - This is PostgREST's error when it can't find the right function overload

  ## Solution
  Create function overload to support both call signatures:
  1. 3-parameter version: (registration_id, user_id, status) - for approvals
  2. 4-parameter version: (registration_id, user_id, status, reason) - for rejections

  ## Implementation
  - Keep the main 4-parameter function with DEFAULT NULL
  - Add a 3-parameter wrapper that calls the 4-parameter version
  - PostgREST will route calls to the correct overload based on parameter count
*/

-- Drop existing function completely (both possible signatures)
DROP FUNCTION IF EXISTS admin_update_registration_status(uuid, uuid, text, text);
DROP FUNCTION IF EXISTS admin_update_registration_status(uuid, uuid, text);

-- Create the main function with all 4 parameters
-- This handles both approvals and rejections
CREATE OR REPLACE FUNCTION admin_update_registration_status(
  p_registration_id uuid,
  p_requesting_user_id uuid,
  p_new_status text,
  p_rejection_reason text
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

  -- Check for NULL parameters
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

  -- Validate status value
  IF p_new_status NOT IN ('approved', 'rejected') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Status must be either ''approved'' or ''rejected'''
    );
  END IF;

  -- Validate rejection reason is provided for rejected status
  IF p_new_status = 'rejected' AND (p_rejection_reason IS NULL OR trim(p_rejection_reason) = '') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Rejection reason is required when rejecting a registration'
    );
  END IF;

  -- ============================================================================
  -- STEP 2: AUTHENTICATE REQUESTING USER
  -- ============================================================================

  -- Verify requesting user exists and is active
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
  -- STEP 3: AUTHORIZE USER FOR STATUS UPDATES
  -- ============================================================================

  -- Check if user has admin privileges
  -- Method 1: Check account_type for admin, both, or super_admin
  IF v_user_record.account_type IN ('admin', 'both', 'super_admin') THEN
    v_is_authorized := true;
  END IF;

  -- Method 2: Check user_roles table for admin roles
  IF NOT v_is_authorized THEN
    SELECT EXISTS(
      SELECT 1 FROM user_roles
      WHERE user_id = p_requesting_user_id
        AND role IN ('super_admin', 'admin', 'editor')
    ) INTO v_is_authorized;
  END IF;

  -- Deny access if not authorized
  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User does not have permission to update registration status'
    );
  END IF;

  -- ============================================================================
  -- STEP 4: VALIDATE REGISTRATION EXISTS
  -- ============================================================================

  -- Fetch existing registration data
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

  -- Update the registration status
  UPDATE member_registrations
  SET
    status = p_new_status,
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
  -- STEP 6: UPDATE USER ACCOUNT TYPE (IF APPROVED)
  -- ============================================================================

  -- If status is approved and registration has a user_id, update account_type
  IF p_new_status = 'approved' AND v_registration_record.user_id IS NOT NULL THEN
    -- Update users table to set account_type to 'member'
    -- Only update if current account_type is 'general_user'
    UPDATE users
    SET
      account_type = 'member',
      updated_at = now()
    WHERE id = v_registration_record.user_id
      AND account_type = 'general_user';

    -- Note: No error if update doesn't happen (user might already be 'member' or another type)
  END IF;

  -- ============================================================================
  -- STEP 7: LOG CHANGE TO AUDIT HISTORY
  -- ============================================================================

  -- Log the status change
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
  -- STEP 8: FETCH AND RETURN UPDATED REGISTRATION
  -- ============================================================================

  -- Fetch the updated registration with designation data
  SELECT jsonb_build_object(
    'id', mr.id,
    'full_name', mr.full_name,
    'email', mr.email,
    'mobile_number', mr.mobile_number,
    'gender', mr.gender,
    'date_of_birth', mr.date_of_birth,
    'member_id', mr.member_id,
    'company_name', mr.company_name,
    'company_designation_id', mr.company_designation_id,
    'company_designation_name', cd.designation_name,
    'company_address', mr.company_address,
    'city', mr.city,
    'other_city_name', mr.other_city_name,
    'is_custom_city', mr.is_custom_city,
    'district', mr.district,
    'state', mr.state,
    'pin_code', mr.pin_code,
    'industry', mr.industry,
    'activity_type', mr.activity_type,
    'constitution', mr.constitution,
    'annual_turnover', mr.annual_turnover,
    'number_of_employees', mr.number_of_employees,
    'products_services', mr.products_services,
    'brand_names', mr.brand_names,
    'website', mr.website,
    'gst_registered', mr.gst_registered,
    'gst_number', mr.gst_number,
    'gst_certificate_url', mr.gst_certificate_url,
    'pan_company', mr.pan_company,
    'esic_registered', mr.esic_registered,
    'epf_registered', mr.epf_registered,
    'udyam_certificate_url', mr.udyam_certificate_url,
    'alternate_contact_name', mr.alternate_contact_name,
    'alternate_mobile', mr.alternate_mobile,
    'referred_by', mr.referred_by,
    'profile_photo_url', mr.profile_photo_url,
    'status', mr.status,
    'rejection_reason', mr.rejection_reason,
    'approval_date', mr.approval_date,
    'is_active', mr.is_active,
    'amount_paid', mr.amount_paid,
    'payment_date', mr.payment_date,
    'payment_proof_url', mr.payment_proof_url,
    'payment_mode', mr.payment_mode,
    'transaction_id', mr.transaction_id,
    'bank_reference', mr.bank_reference,
    'user_id', mr.user_id,
    'is_legacy_member', mr.is_legacy_member,
    'created_at', mr.created_at,
    'last_modified_by', mr.last_modified_by,
    'last_modified_at', mr.last_modified_at
  ) INTO v_result
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
    -- Log the error and return failure
    RAISE WARNING 'Error in admin_update_registration_status: % %', SQLERRM, SQLSTATE;
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Database error: ' || SQLERRM
    );
END;
$$;

-- Create the 3-parameter overload (for approvals without rejection reason)
-- This simply calls the 4-parameter version with NULL for rejection_reason
CREATE OR REPLACE FUNCTION admin_update_registration_status(
  p_registration_id uuid,
  p_requesting_user_id uuid,
  p_new_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Call the 4-parameter version with NULL for rejection_reason
  RETURN admin_update_registration_status(
    p_registration_id,
    p_requesting_user_id,
    p_new_status,
    NULL
  );
END;
$$;

-- Add comments explaining both functions
COMMENT ON FUNCTION admin_update_registration_status(uuid, uuid, text, text) IS
  'SECURITY DEFINER RPC to update member registration status with rejection reason. Used for rejections.';

COMMENT ON FUNCTION admin_update_registration_status(uuid, uuid, text) IS
  'SECURITY DEFINER RPC to update member registration status without rejection reason. Used for approvals.';

-- Grant execute permissions to both function signatures
GRANT EXECUTE ON FUNCTION admin_update_registration_status(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_update_registration_status(uuid, uuid, text, text) TO anon;
GRANT EXECUTE ON FUNCTION admin_update_registration_status(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_update_registration_status(uuid, uuid, text) TO anon;

-- Log completion
DO $$
BEGIN
  RAISE NOTICE '✓ Fixed admin_update_registration_status with function overloads';
  RAISE NOTICE '✓ 3-parameter version: (registration_id, user_id, status) for approvals';
  RAISE NOTICE '✓ 4-parameter version: (registration_id, user_id, status, reason) for rejections';
  RAISE NOTICE '✓ PostgREST will automatically route to correct overload';
END $$;
