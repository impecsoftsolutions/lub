/*
  COD-MEMBER-DASHBOARD-FREE-PAID-FLOW-001

  Free Membership applications must never retain accidental payment values from
  the browser. Paid applications still require payment proof.
*/

CREATE OR REPLACE FUNCTION public.submit_member_registration(
  p_user_id uuid,
  p_registration_data jsonb,
  p_gst_certificate_url text DEFAULT NULL,
  p_udyam_certificate_url text DEFAULT NULL,
  p_payment_proof_url text DEFAULT NULL,
  p_profile_photo_url text DEFAULT NULL,
  p_membership_application_type text DEFAULT 'paid'
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
  v_type text;
  v_amount text;
  v_payment_mode text;
  v_payment_date date;
  v_payment_proof_url text;
BEGIN
  v_type := lower(coalesce(nullif(trim(p_membership_application_type), ''), 'paid'));
  IF v_type NOT IN ('free', 'paid') THEN
    v_type := 'paid';
  END IF;

  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User ID is required');
  END IF;

  IF p_registration_data IS NULL OR p_registration_data = '{}'::jsonb THEN
    RETURN jsonb_build_object('success', false, 'error', 'Registration data is required');
  END IF;

  v_email := p_registration_data->>'email';
  v_mobile := p_registration_data->>'mobile_number';

  IF v_email IS NULL OR v_email = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Email is required');
  END IF;

  IF v_mobile IS NULL OR v_mobile = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Mobile number is required');
  END IF;

  IF v_type = 'paid' AND coalesce(trim(p_payment_proof_url), '') = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Payment proof is required for a Paid Membership application'
    );
  END IF;

  SELECT * INTO v_user_record
  FROM users
  WHERE id = p_user_id
    AND account_status = 'active';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found or inactive');
  END IF;

  SELECT COUNT(*) INTO v_existing_count
  FROM member_registrations
  WHERE LOWER(email) = LOWER(v_email)
    AND (is_legacy_member = false OR is_legacy_member IS NULL)
    AND status != 'rejected';

  IF v_existing_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'An application with this email address already exists');
  END IF;

  SELECT COUNT(*) INTO v_existing_count
  FROM member_registrations
  WHERE mobile_number = v_mobile
    AND (is_legacy_member = false OR is_legacy_member IS NULL)
    AND status != 'rejected';

  IF v_existing_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'An application with this mobile number already exists');
  END IF;

  IF v_type = 'free' THEN
    v_amount := '0';
    v_payment_mode := 'Not applicable';
    v_payment_date := current_date;
    v_payment_proof_url := '';
  ELSE
    v_amount := p_registration_data->>'amount_paid';
    v_payment_mode := p_registration_data->>'payment_mode';
    v_payment_date := (p_registration_data->>'payment_date')::date;
    v_payment_proof_url := coalesce(p_payment_proof_url, '');
  END IF;

  INSERT INTO member_registrations (
    user_id,
    full_name, gender, date_of_birth, email, mobile_number,
    company_name, company_designation_id, company_address, city,
    other_city_name, is_custom_city, district, state, pin_code,
    industry, activity_type, constitution, annual_turnover,
    number_of_employees, products_services, brand_names, website,
    gst_registered, gst_number, pan_company, esic_registered, epf_registered,
    gst_certificate_url, udyam_certificate_url, payment_proof_url, profile_photo_url,
    referred_by, amount_paid, payment_date, payment_mode, transaction_id, bank_reference,
    alternate_contact_name, alternate_mobile,
    member_id,
    membership_application_type,
    status, is_legacy_member,
    created_at, updated_at
  ) VALUES (
    p_user_id,
    p_registration_data->>'full_name',
    p_registration_data->>'gender',
    (p_registration_data->>'date_of_birth')::date,
    p_registration_data->>'email',
    p_registration_data->>'mobile_number',
    p_registration_data->>'company_name',
    (p_registration_data->>'company_designation_id')::uuid,
    p_registration_data->>'company_address',
    p_registration_data->>'city',
    p_registration_data->>'other_city_name',
    COALESCE((p_registration_data->>'is_custom_city')::boolean, false),
    p_registration_data->>'district',
    p_registration_data->>'state',
    p_registration_data->>'pin_code',
    p_registration_data->>'industry',
    p_registration_data->>'activity_type',
    p_registration_data->>'constitution',
    p_registration_data->>'annual_turnover',
    p_registration_data->>'number_of_employees',
    p_registration_data->>'products_services',
    COALESCE(p_registration_data->>'brand_names', ''),
    COALESCE(p_registration_data->>'website', ''),
    p_registration_data->>'gst_registered',
    COALESCE(p_registration_data->>'gst_number', ''),
    p_registration_data->>'pan_company',
    p_registration_data->>'esic_registered',
    p_registration_data->>'epf_registered',
    COALESCE(p_gst_certificate_url, ''),
    COALESCE(p_udyam_certificate_url, ''),
    v_payment_proof_url,
    COALESCE(p_profile_photo_url, ''),
    COALESCE(p_registration_data->>'referred_by', ''),
    v_amount,
    v_payment_date,
    v_payment_mode,
    CASE WHEN v_type = 'free' THEN '' ELSE COALESCE(p_registration_data->>'transaction_id', '') END,
    CASE WHEN v_type = 'free' THEN '' ELSE COALESCE(p_registration_data->>'bank_reference', '') END,
    COALESCE(p_registration_data->>'alternate_contact_name', ''),
    COALESCE(p_registration_data->>'alternate_mobile', ''),
    p_registration_data->>'member_id',
    v_type,
    'pending',
    false,
    NOW(), NOW()
  )
  RETURNING id INTO v_registration_id;

  RETURN jsonb_build_object(
    'success', true,
    'registration_id', v_registration_id,
    'membership_application_type', v_type,
    'message', 'Registration submitted successfully'
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error in submit_member_registration: % %', SQLERRM, SQLSTATE;
    RETURN jsonb_build_object('success', false, 'error', 'Database error: ' || SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_member_registration(uuid, jsonb, text, text, text, text, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
