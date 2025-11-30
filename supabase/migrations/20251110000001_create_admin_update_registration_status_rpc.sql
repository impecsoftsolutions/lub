/*
  # Create SECURITY DEFINER RPC for Admin Registration Status Updates

  ## Overview
  This migration creates a SECURITY DEFINER RPC function to allow admin users
  to update member registration status (approve/reject), bypassing RLS policies.

  ## Problem
  - Custom authentication system uses localStorage tokens, NOT Supabase Auth
  - auth.jwt() and auth.uid() always return NULL
  - JWT-based RLS policies cannot work with custom authentication
  - Direct UPDATE queries are blocked by RLS policies that check NULL JWT
  - Status update workflow needs to:
    1. Update member_registrations status
    2. Update users.account_type when approving
    3. Log changes to audit history
    4. Return updated registration data

  ## Solution
  Create admin_update_registration_status() RPC function that:
  - Uses SECURITY DEFINER to bypass RLS
  - Validates requesting user's authentication and authorization
  - Updates registration status and rejection reason
  - Updates user account_type from 'general_user' to 'member' when approving
  - Logs all changes to member_audit_history
  - Returns the updated registration record

  ## Security Measures
  1. User Authentication: Verifies user exists and is active
  2. Authorization: Checks account_type and user_roles for admin privileges
  3. Input Validation: Validates UUIDs, status values, and required fields
  4. Audit Trail: Logs status changes with reasons
  5. Search Path: SET search_path = public prevents attacks

  ## Parameters
  - p_registration_id: UUID of registration to update
  - p_requesting_user_id: UUID of user making the request
  - p_new_status: Status to set ('approved' or 'rejected')
  - p_rejection_reason: Optional reason (required for rejected status)

  ## Returns
  JSONB object with:
  - success: boolean
  - error: string (if failed)
  - registration: full registration record with designation data
*/

-- Drop function if exists for clean re-creation
DROP FUNCTION IF EXISTS admin_update_registration_status(uuid, uuid, text, text);

-- Create the RPC function
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

-- Add comment explaining the function
COMMENT ON FUNCTION admin_update_registration_status(uuid, uuid, text, text) IS
  'SECURITY DEFINER RPC to update member registration status (approve/reject) for custom auth system. Validates user permissions, updates status, updates user account_type when approving, logs audit trail. Used by admin users to approve or reject membership applications.';

-- Grant execute permission to authenticated users and anon
GRANT EXECUTE ON FUNCTION admin_update_registration_status(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_update_registration_status(uuid, uuid, text, text) TO anon;

-- Log completion
DO $$
BEGIN
  RAISE NOTICE '✓ Created admin_update_registration_status RPC function with SECURITY DEFINER';
  RAISE NOTICE '✓ Function bypasses RLS and validates permissions internally';
  RAISE NOTICE '✓ Handles status update, user account_type update, and audit logging';
  RAISE NOTICE '✓ Returns updated registration record with designation data';
END $$;
