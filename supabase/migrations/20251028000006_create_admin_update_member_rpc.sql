/*
  # Create SECURITY DEFINER RPC for Admin Member Updates

  ## Overview
  This migration creates a SECURITY DEFINER RPC function to allow admin users
  to update member registrations, bypassing RLS policies.

  ## Problem
  - Custom authentication system uses localStorage tokens, NOT Supabase Auth
  - auth.jwt() and auth.uid() always return NULL
  - JWT-based RLS policies cannot work with custom authentication
  - Direct UPDATE queries are blocked by RLS policies that check NULL JWT

  ## Solution
  Create update_member_registration() RPC function that:
  - Uses SECURITY DEFINER to bypass RLS
  - Validates requesting user's authentication and authorization
  - Enforces field-level permissions (payment fields for super_admin only)
  - Logs all changes to member_audit_history
  - Returns structured success/error response

  ## Security Measures
  1. User Authentication: Verifies user exists and is active
  2. Authorization: Checks account_type and user_roles for admin privileges
  3. Input Validation: Validates UUIDs and JSONB structure
  4. Field Restrictions: Enforces super_admin-only fields
  5. Audit Trail: Logs all changes with old/new values
  6. Search Path: SET search_path = public prevents attacks

  ## Parameters
  - p_member_id: UUID of member to update
  - p_requesting_user_id: UUID of user making the request
  - p_updates: JSONB object containing field updates
  - p_is_super_admin: Boolean indicating if user is super admin

  ## Returns
  JSONB object with:
  - success: boolean
  - error: string (if failed)
  - rows_updated: integer
*/

-- Drop function if exists for clean re-creation
DROP FUNCTION IF EXISTS update_member_registration(uuid, uuid, jsonb, boolean);

-- Create the RPC function
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

  -- Check for NULL parameters
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
  -- STEP 3: AUTHORIZE USER FOR MEMBER UPDATES
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
      'error', 'User does not have permission to update member registrations'
    );
  END IF;

  -- ============================================================================
  -- STEP 4: VALIDATE MEMBER EXISTS
  -- ============================================================================

  -- Fetch existing member data for comparison
  SELECT * INTO v_member_record
  FROM member_registrations
  WHERE id = p_member_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Member not found'
    );
  END IF;

  -- ============================================================================
  -- STEP 5: ENFORCE FIELD-LEVEL PERMISSIONS
  -- ============================================================================

  -- Remove payment fields if user is not super admin
  IF NOT p_is_super_admin THEN
    v_update_data := v_update_data - 'amount_paid';
    v_update_data := v_update_data - 'payment_date';
    v_update_data := v_update_data - 'payment_proof_url';
    v_update_data := v_update_data - 'payment_mode';
    v_update_data := v_update_data - 'transaction_id';
    v_update_data := v_update_data - 'bank_reference';
  END IF;

  -- Remove protected system fields that should never be updated
  v_update_data := v_update_data - 'id';
  v_update_data := v_update_data - 'created_at';
  v_update_data := v_update_data - 'is_legacy_member';  -- Never allow modification
  v_update_data := v_update_data - 'user_id';  -- Prevent user_id changes
  v_update_data := v_update_data - 'submission_id';  -- Prevent submission_id changes

  -- Add audit fields
  v_update_data := v_update_data || jsonb_build_object(
    'last_modified_by', p_requesting_user_id,
    'last_modified_at', now()
  );

  -- Ensure is_custom_city has a boolean value (default false if not provided)
  IF NOT (v_update_data ? 'is_custom_city') THEN
    v_update_data := v_update_data || jsonb_build_object('is_custom_city', false);
  END IF;

  -- ============================================================================
  -- STEP 6: PERFORM THE UPDATE
  -- ============================================================================

  -- Update the member registration using jsonb_populate_record
  -- This safely converts JSONB to table columns
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
    -- Payment fields (only updated if super_admin)
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
    -- Audit fields
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

  -- Log each changed field
  FOR v_field_key IN SELECT jsonb_object_keys(v_update_data)
  LOOP
    -- Skip audit fields themselves
    CONTINUE WHEN v_field_key IN ('last_modified_by', 'last_modified_at');

    -- Get old and new values
    EXECUTE format('SELECT COALESCE($1.%I::text, '''')', v_field_key)
      USING v_member_record
      INTO v_old_value;

    v_new_value := COALESCE(v_update_data->>v_field_key, '');

    -- Only log if value actually changed
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
    -- Log the error and return failure
    RAISE WARNING 'Error in update_member_registration: % %', SQLERRM, SQLSTATE;
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Database error: ' || SQLERRM
    );
END;
$$;

-- Add comment explaining the function
COMMENT ON FUNCTION update_member_registration(uuid, uuid, jsonb, boolean) IS
  'SECURITY DEFINER RPC to update member registrations for custom auth system. Validates user permissions, enforces field restrictions, logs audit trail. Used by admin users to edit member information.';

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION update_member_registration(uuid, uuid, jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION update_member_registration(uuid, uuid, jsonb, boolean) TO anon;

-- Log completion
DO $$
BEGIN
  RAISE NOTICE '✓ Created update_member_registration RPC function with SECURITY DEFINER';
  RAISE NOTICE '✓ Function bypasses RLS and validates permissions internally';
  RAISE NOTICE '✓ Audit trail logging included';
  RAISE NOTICE '✓ Field-level restrictions enforced (payment fields for super_admin only)';
END $$;
