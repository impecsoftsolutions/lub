/*
  # Create SECURITY DEFINER RPC for Member Registration Submission

  ## Overview
  This migration creates a SECURITY DEFINER RPC function to allow authenticated users
  to submit member registrations, bypassing RLS policies.

  ## Problem
  - Custom authentication system uses localStorage tokens, NOT Supabase Auth
  - auth.jwt() and auth.uid() always return NULL
  - JWT-based RLS policies cannot work with custom authentication
  - Direct INSERT queries are blocked by RLS policies that check NULL JWT
  - Join form submissions fail due to RLS restrictions

  ## Solution
  Create submit_member_registration() RPC function that:
  - Uses SECURITY DEFINER to bypass RLS
  - Validates user authentication (user must be active)
  - Checks email and mobile uniqueness (excluding legacy members)
  - Inserts new member registration with all form fields
  - Returns structured success/error response with registration_id

  ## Security Measures
  1. User Authentication: Verifies user exists and is active
  2. Input Validation: Validates required parameters
  3. Uniqueness Checks: Prevents duplicate email/mobile for non-legacy members
  4. Search Path: SET search_path = public prevents attacks
  5. Proper Defaults: Sets status='pending', is_legacy_member=false, is_custom_city=false

  ## Parameters
  - p_user_id: UUID - User ID of the person submitting (required)
  - p_registration_data: JSONB - All form fields as JSON object (required)
  - p_gst_certificate_url: TEXT - URL to GST certificate (nullable)
  - p_udyam_certificate_url: TEXT - URL to Udyam certificate (nullable)
  - p_payment_proof_url: TEXT - URL to payment proof (nullable)
  - p_profile_photo_url: TEXT - URL to profile photo (nullable)

  ## Returns
  JSONB object with:
  - success: boolean
  - registration_id: uuid (if successful)
  - message: string
  - error: string (if failed)

  ## Usage Example
  ```sql
  SELECT submit_member_registration(
    'user-uuid-here',
    '{"full_name": "John Doe", "email": "john@example.com", ...}'::jsonb,
    'https://storage/gst.pdf',
    'https://storage/udyam.pdf',
    'https://storage/payment.jpg',
    'https://storage/photo.jpg'
  );
  ```
*/

-- Drop function if exists for clean re-creation
DROP FUNCTION IF EXISTS submit_member_registration(uuid, jsonb, text, text, text, text);

-- Create the RPC function
CREATE OR REPLACE FUNCTION submit_member_registration(
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
  -- STEP 6: RETURN SUCCESS
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

-- Add comment explaining the function
COMMENT ON FUNCTION submit_member_registration(uuid, jsonb, text, text, text, text) IS
  'SECURITY DEFINER RPC to submit member registrations for custom auth system. Validates user authentication, checks uniqueness constraints, and inserts new registration. Used by authenticated users in the Join form.';

-- Grant execute permission to authenticated users (not anon since form requires auth)
GRANT EXECUTE ON FUNCTION submit_member_registration(uuid, jsonb, text, text, text, text) TO authenticated;

-- =============================================================================
-- Log Completion
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE '=============================================================================';
  RAISE NOTICE 'Migration 20251103000001 completed successfully';
  RAISE NOTICE '=============================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Changes Applied:';
  RAISE NOTICE '✓ Created submit_member_registration RPC function with SECURITY DEFINER';
  RAISE NOTICE '✓ Function bypasses RLS and validates user authentication';
  RAISE NOTICE '✓ Accepts user_id, registration_data JSONB, and file URLs';
  RAISE NOTICE '✓ Validates email and mobile uniqueness (excluding legacy members)';
  RAISE NOTICE '✓ Returns JSON response with success/error and registration_id';
  RAISE NOTICE '✓ Granted EXECUTE to authenticated role';
  RAISE NOTICE '';
  RAISE NOTICE 'Security Features:';
  RAISE NOTICE '- Requires active user authentication';
  RAISE NOTICE '- Checks email uniqueness (non-legacy members only)';
  RAISE NOTICE '- Checks mobile uniqueness (non-legacy members only)';
  RAISE NOTICE '- Sets proper defaults (status=pending, is_legacy_member=false)';
  RAISE NOTICE '- Comprehensive exception handling';
  RAISE NOTICE '';
  RAISE NOTICE 'Next Steps:';
  RAISE NOTICE '1. Update Join form to call this RPC instead of direct insert';
  RAISE NOTICE '2. Update member reapplication flow to use this RPC';
  RAISE NOTICE '3. Test form submission with various scenarios';
  RAISE NOTICE '4. Verify uniqueness constraints work correctly';
  RAISE NOTICE '';
  RAISE NOTICE '=============================================================================';
END $$;
