/*
  Fix submit_member_registration to insert pending custom cities.
  - Adds pending_cities_master insert for custom city submissions.
  - Keeps existing function signature and behavior.
*/

CREATE OR REPLACE FUNCTION public.submit_member_registration(
  p_user_id uuid,
  p_registration_data jsonb,
  p_gst_certificate_url text DEFAULT NULL,
  p_udyam_certificate_url text DEFAULT NULL,
  p_payment_proof_url text DEFAULT NULL,
  p_profile_photo_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_record RECORD;
  v_registration_id uuid;
  v_email text;
  v_mobile text;
  v_existing_count integer;
  v_is_custom_city boolean;
  v_other_city_name text;
  v_state_name text;
  v_district_name text;
  v_state_id uuid;
  v_district_id uuid;
  v_city_exists integer;
BEGIN
  -- ============================================================================
  -- STEP 1: VALIDATE INPUT PARAMETERS
  -- ============================================================================

  -- Check for NULL user_id
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User ID is required'
    );
  END IF;

  -- Check for NULL or empty registration data
  IF p_registration_data IS NULL OR p_registration_data = '{}'::jsonb THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Registration data is required'
    );
  END IF;

  -- Extract and validate required fields
  v_email := p_registration_data->>'email';
  v_mobile := p_registration_data->>'mobile_number';

  IF v_email IS NULL OR v_email = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Email is required'
    );
  END IF;

  IF v_mobile IS NULL OR v_mobile = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Mobile number is required'
    );
  END IF;

  -- ============================================================================
  -- STEP 2: AUTHENTICATE USER
  -- ============================================================================

  -- Verify user exists and is active
  SELECT * INTO v_user_record
  FROM users
  WHERE id = p_user_id
    AND account_status = 'active';

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User not found or inactive'
    );
  END IF;

  -- ============================================================================
  -- STEP 3: CHECK EMAIL UNIQUENESS (excluding legacy members)
  -- ============================================================================

  SELECT COUNT(*) INTO v_existing_count
  FROM member_registrations
  WHERE LOWER(email) = LOWER(v_email)
    AND (is_legacy_member = false OR is_legacy_member IS NULL)
    AND status != 'rejected';

  IF v_existing_count > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'An application with this email address already exists'
    );
  END IF;

  -- ============================================================================
  -- STEP 4: CHECK MOBILE UNIQUENESS (excluding legacy members)
  -- ============================================================================

  SELECT COUNT(*) INTO v_existing_count
  FROM member_registrations
  WHERE mobile_number = v_mobile
    AND (is_legacy_member = false OR is_legacy_member IS NULL)
    AND status != 'rejected';

  IF v_existing_count > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'An application with this mobile number already exists'
    );
  END IF;

  -- ============================================================================
  -- STEP 5: INSERT MEMBER REGISTRATION
  -- ============================================================================

  INSERT INTO member_registrations (
    -- User Reference
    user_id,

    -- Personal Information
    full_name,
    gender,
    date_of_birth,
    email,
    mobile_number,

    -- Company Information
    company_name,
    company_designation_id,
    company_address,
    city,
    other_city_name,
    is_custom_city,
    district,
    state,
    pin_code,

    -- Business Details
    industry,
    activity_type,
    constitution,
    annual_turnover,
    number_of_employees,
    products_services,
    brand_names,
    website,

    -- Registration Details
    gst_registered,
    gst_number,
    pan_company,
    esic_registered,
    epf_registered,

    -- File Upload URLs
    gst_certificate_url,
    udyam_certificate_url,
    payment_proof_url,
    profile_photo_url,

    -- Payment Information
    referred_by,
    amount_paid,
    payment_date,
    payment_mode,
    transaction_id,
    bank_reference,

    -- Alternate Contact Information
    alternate_contact_name,
    alternate_mobile,

    -- Member ID (if provided during reapplication)
    member_id,

    -- Status and Flags
    status,
    is_legacy_member,

    -- Timestamps
    created_at,
    updated_at
  ) VALUES (
    -- User Reference
    p_user_id,

    -- Personal Information
    p_registration_data->>'full_name',
    p_registration_data->>'gender',
    (p_registration_data->>'date_of_birth')::date,
    p_registration_data->>'email',
    p_registration_data->>'mobile_number',

    -- Company Information
    p_registration_data->>'company_name',
    (p_registration_data->>'company_designation_id')::uuid,
    p_registration_data->>'company_address',
    p_registration_data->>'city',
    p_registration_data->>'other_city_name',
    COALESCE((p_registration_data->>'is_custom_city')::boolean, false),
    p_registration_data->>'district',
    p_registration_data->>'state',
    p_registration_data->>'pin_code',

    -- Business Details
    p_registration_data->>'industry',
    p_registration_data->>'activity_type',
    p_registration_data->>'constitution',
    p_registration_data->>'annual_turnover',
    p_registration_data->>'number_of_employees',
    p_registration_data->>'products_services',
    COALESCE(p_registration_data->>'brand_names', ''),
    COALESCE(p_registration_data->>'website', ''),

    -- Registration Details
    p_registration_data->>'gst_registered',
    COALESCE(p_registration_data->>'gst_number', ''),
    p_registration_data->>'pan_company',
    p_registration_data->>'esic_registered',
    p_registration_data->>'epf_registered',

    -- File Upload URLs
    COALESCE(p_gst_certificate_url, ''),
    COALESCE(p_udyam_certificate_url, ''),
    COALESCE(p_payment_proof_url, ''),
    COALESCE(p_profile_photo_url, ''),

    -- Payment Information
    COALESCE(p_registration_data->>'referred_by', ''),
    p_registration_data->>'amount_paid',
    (p_registration_data->>'payment_date')::date,
    p_registration_data->>'payment_mode',
    COALESCE(p_registration_data->>'transaction_id', ''),
    COALESCE(p_registration_data->>'bank_reference', ''),

    -- Alternate Contact Information
    COALESCE(p_registration_data->>'alternate_contact_name', ''),
    COALESCE(p_registration_data->>'alternate_mobile', ''),

    -- Member ID (if provided during reapplication)
    p_registration_data->>'member_id',

    -- Status and Flags
    'pending',
    false,

    -- Timestamps
    NOW(),
    NOW()
  )
  RETURNING id INTO v_registration_id;

  -- ============================================================================
  -- STEP 6: INSERT PENDING CITY IF CUSTOM CITY PROVIDED
  -- ============================================================================

  v_is_custom_city := COALESCE((p_registration_data->>'is_custom_city')::boolean, false);
  v_other_city_name := NULLIF(TRIM(p_registration_data->>'other_city_name'), '');
  v_state_name := NULLIF(TRIM(p_registration_data->>'state'), '');
  v_district_name := NULLIF(TRIM(p_registration_data->>'district'), '');

  IF v_is_custom_city = true AND v_other_city_name IS NOT NULL THEN
    SELECT d.id, d.state_id INTO v_district_id, v_state_id
    FROM districts_master d
    JOIN states_master s ON s.id = d.state_id
    WHERE d.district_name = v_district_name
      AND s.state_name = v_state_name
    LIMIT 1;

    IF v_district_id IS NOT NULL AND v_state_id IS NOT NULL THEN
      SELECT COUNT(*) INTO v_city_exists
      FROM pending_cities_master
      WHERE city_name = v_other_city_name
        AND district_id = v_district_id
        AND status IN ('pending', 'approved');

      IF v_city_exists = 0 THEN
        INSERT INTO pending_cities_master (
          city_name,
          district_id,
          state_id,
          status,
          submission_source
        ) VALUES (
          v_other_city_name,
          v_district_id,
          v_state_id,
          'pending',
          'registration_form'
        );
      END IF;
    END IF;
  END IF;

  -- ============================================================================
  -- STEP 7: RETURN SUCCESS
  -- ============================================================================

  RETURN jsonb_build_object(
    'success', true,
    'registration_id', v_registration_id,
    'message', 'Registration submitted successfully'
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Log the error and return failure
    RAISE WARNING 'Error in submit_member_registration: % %', SQLERRM, SQLSTATE;
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Database error: ' || SQLERRM
    );
END;
$$;
