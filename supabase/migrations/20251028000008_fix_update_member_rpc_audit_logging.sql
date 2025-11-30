/*
  # Fix update_member_registration RPC Audit Logging

  ## Problem
  The function fails with error: "could not identify column 'city' in record data type"

  Lines 286-288 use dynamic SQL to access fields from v_member_record (RECORD type),
  but PostgreSQL cannot resolve field names dynamically from generic RECORD types.

  ## Solution
  Convert v_member_record to JSONB using to_jsonb() first, then access fields
  from the JSONB object instead of using dynamic SQL on the RECORD type.

  ## Changes
  - Line 60: Add v_member_jsonb variable to store JSONB representation
  - Line 157: Convert fetched record to JSONB immediately after SELECT
  - Lines 289-290: Replace dynamic SQL with direct JSONB field access
*/

-- Drop existing function
DROP FUNCTION IF EXISTS update_member_registration(uuid, uuid, jsonb, boolean);

-- Create corrected version
CREATE OR REPLACE FUNCTION update_member_registration(
  p_member_id uuid,
  p_requesting_user_id uuid,
  p_updates jsonb,
  p_is_super_admin boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_record RECORD;
  v_member_record RECORD;
  v_member_jsonb jsonb;
  v_is_authorized boolean := false;
  v_update_data jsonb := p_updates;
  v_field_key text;
  v_old_value text;
  v_new_value text;
  v_rows_updated integer := 0;
BEGIN
  -- ============================================================================
  -- STEP 1: VALIDATE INPUT PARAMETERS
  -- ============================================================================

  IF p_member_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Member ID is required'
    );
  END IF;

  IF p_requesting_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Requesting user ID is required'
    );
  END IF;

  IF p_updates IS NULL OR p_updates = '{}'::jsonb THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No updates provided'
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
  -- STEP 3: AUTHORIZE USER FOR MEMBER UPDATES
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
      'error', 'User does not have permission to update member registrations'
    );
  END IF;

  -- ============================================================================
  -- STEP 4: VALIDATE MEMBER EXISTS
  -- ============================================================================

  SELECT * INTO v_member_record
  FROM member_registrations
  WHERE id = p_member_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Member not found'
    );
  END IF;

  -- FIXED: Convert RECORD to JSONB for safe field access in audit logging
  v_member_jsonb := to_jsonb(v_member_record);

  -- ============================================================================
  -- STEP 5: ENFORCE FIELD-LEVEL PERMISSIONS
  -- ============================================================================

  IF NOT p_is_super_admin THEN
    v_update_data := v_update_data - 'amount_paid';
    v_update_data := v_update_data - 'payment_date';
    v_update_data := v_update_data - 'payment_proof_url';
    v_update_data := v_update_data - 'payment_mode';
    v_update_data := v_update_data - 'transaction_id';
    v_update_data := v_update_data - 'bank_reference';
  END IF;

  v_update_data := v_update_data - 'id';
  v_update_data := v_update_data - 'created_at';
  v_update_data := v_update_data - 'is_legacy_member';
  v_update_data := v_update_data - 'user_id';
  v_update_data := v_update_data - 'submission_id';

  v_update_data := v_update_data || jsonb_build_object(
    'last_modified_by', p_requesting_user_id,
    'last_modified_at', now()
  );

  IF NOT (v_update_data ? 'is_custom_city') THEN
    v_update_data := v_update_data || jsonb_build_object('is_custom_city', false);
  END IF;

  -- ============================================================================
  -- STEP 6: PERFORM THE UPDATE
  -- ============================================================================

  UPDATE member_registrations
  SET
    full_name = COALESCE((v_update_data->>'full_name'), full_name),
    email = COALESCE((v_update_data->>'email'), email),
    mobile_number = COALESCE((v_update_data->>'mobile_number'), mobile_number),
    gender = COALESCE((v_update_data->>'gender'), gender),
    date_of_birth = COALESCE((v_update_data->>'date_of_birth')::date, date_of_birth),
    member_id = COALESCE((v_update_data->>'member_id'), member_id),
    company_name = COALESCE((v_update_data->>'company_name'), company_name),
    company_designation_id = COALESCE((v_update_data->>'company_designation_id')::uuid, company_designation_id),
    company_address = COALESCE((v_update_data->>'company_address'), company_address),
    city = CASE
      WHEN v_update_data ? 'city' THEN (v_update_data->>'city')
      ELSE city
    END,
    other_city_name = CASE
      WHEN v_update_data ? 'other_city_name' THEN (v_update_data->>'other_city_name')
      ELSE other_city_name
    END,
    is_custom_city = COALESCE((v_update_data->>'is_custom_city')::boolean, is_custom_city),
    district = COALESCE((v_update_data->>'district'), district),
    state = COALESCE((v_update_data->>'state'), state),
    pin_code = COALESCE((v_update_data->>'pin_code'), pin_code),
    industry = COALESCE((v_update_data->>'industry'), industry),
    activity_type = COALESCE((v_update_data->>'activity_type'), activity_type),
    constitution = COALESCE((v_update_data->>'constitution'), constitution),
    annual_turnover = COALESCE((v_update_data->>'annual_turnover'), annual_turnover),
    number_of_employees = COALESCE((v_update_data->>'number_of_employees'), number_of_employees),
    products_services = COALESCE((v_update_data->>'products_services'), products_services),
    brand_names = COALESCE((v_update_data->>'brand_names'), brand_names),
    website = COALESCE((v_update_data->>'website'), website),
    gst_registered = COALESCE((v_update_data->>'gst_registered'), gst_registered),
    gst_number = COALESCE((v_update_data->>'gst_number'), gst_number),
    pan_company = COALESCE((v_update_data->>'pan_company'), pan_company),
    esic_registered = COALESCE((v_update_data->>'esic_registered'), esic_registered),
    epf_registered = COALESCE((v_update_data->>'epf_registered'), epf_registered),
    alternate_contact_name = COALESCE((v_update_data->>'alternate_contact_name'), alternate_contact_name),
    alternate_mobile = COALESCE((v_update_data->>'alternate_mobile'), alternate_mobile),
    referred_by = COALESCE((v_update_data->>'referred_by'), referred_by),
    profile_photo_url = CASE
      WHEN v_update_data ? 'profile_photo_url' THEN (v_update_data->>'profile_photo_url')
      ELSE profile_photo_url
    END,
    amount_paid = CASE
      WHEN p_is_super_admin AND v_update_data ? 'amount_paid'
      THEN (v_update_data->>'amount_paid')
      ELSE amount_paid
    END,
    payment_date = CASE
      WHEN p_is_super_admin AND v_update_data ? 'payment_date'
      THEN (v_update_data->>'payment_date')::date
      ELSE payment_date
    END,
    payment_mode = CASE
      WHEN p_is_super_admin AND v_update_data ? 'payment_mode'
      THEN (v_update_data->>'payment_mode')
      ELSE payment_mode
    END,
    transaction_id = CASE
      WHEN p_is_super_admin AND v_update_data ? 'transaction_id'
      THEN (v_update_data->>'transaction_id')
      ELSE transaction_id
    END,
    bank_reference = CASE
      WHEN p_is_super_admin AND v_update_data ? 'bank_reference'
      THEN (v_update_data->>'bank_reference')
      ELSE bank_reference
    END,
    last_modified_by = p_requesting_user_id,
    last_modified_at = now()
  WHERE id = p_member_id;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Failed to update member - no rows affected'
    );
  END IF;

  -- ============================================================================
  -- STEP 7: LOG CHANGES TO AUDIT HISTORY
  -- ============================================================================

  FOR v_field_key IN SELECT jsonb_object_keys(v_update_data)
  LOOP
    CONTINUE WHEN v_field_key IN ('last_modified_by', 'last_modified_at');

    -- FIXED: Access old value from JSONB instead of using dynamic SQL on RECORD
    v_old_value := COALESCE(v_member_jsonb->>v_field_key, '');
    v_new_value := COALESCE(v_update_data->>v_field_key, '');

    IF v_old_value IS DISTINCT FROM v_new_value THEN
      INSERT INTO member_audit_history (
        member_id,
        action_type,
        field_name,
        old_value,
        new_value,
        changed_by,
        changed_at
      ) VALUES (
        p_member_id,
        'update',
        v_field_key,
        v_old_value,
        v_new_value,
        p_requesting_user_id,
        now()
      );
    END IF;
  END LOOP;

  -- ============================================================================
  -- STEP 8: RETURN SUCCESS
  -- ============================================================================

  RETURN jsonb_build_object(
    'success', true,
    'rows_updated', v_rows_updated
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error in update_member_registration: % %', SQLERRM, SQLSTATE;
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Database error: ' || SQLERRM
    );
END;
$$;

COMMENT ON FUNCTION update_member_registration(uuid, uuid, jsonb, boolean) IS
  'SECURITY DEFINER RPC to update member registrations for custom auth system. Validates user permissions, enforces field restrictions, logs audit trail. FIXED: Uses JSONB conversion for safe field access in audit logging.';

GRANT EXECUTE ON FUNCTION update_member_registration(uuid, uuid, jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION update_member_registration(uuid, uuid, jsonb, boolean) TO anon;

DO $$
BEGIN
  RAISE NOTICE '✓ Fixed update_member_registration RPC function';
  RAISE NOTICE '✓ Converted v_member_record to JSONB for audit logging';
  RAISE NOTICE '✓ Replaced dynamic SQL with direct JSONB field access';
  RAISE NOTICE '✓ All existing functionality preserved';
END $$;
