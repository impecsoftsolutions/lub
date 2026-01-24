CREATE OR REPLACE FUNCTION public.update_member_profile(
  p_member_registration_id uuid,
  p_user_id uuid,
  p_data jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  session_count integer;
  v_prev_status text;
  v_rows_updated integer;
BEGIN
  -- Verify valid session exists (custom auth)
  SELECT COUNT(*) INTO session_count
  FROM auth_sessions
  WHERE user_id = p_user_id
    AND expires_at > now();

  IF session_count = 0 THEN
    RAISE EXCEPTION 'Invalid or expired session for user_id=%', p_user_id;
  END IF;

  -- Set user context
  PERFORM set_config('app.current_user_id', p_user_id::text, false);

  -- Get previous status + ensure ownership
  SELECT status INTO v_prev_status
  FROM member_registrations
  WHERE id = p_member_registration_id
    AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registration not found or not authorized for user_id=% registration_id=%', p_user_id, p_member_registration_id;
  END IF;

  -- Update fields + force resubmission to pending review
  UPDATE member_registrations
  SET
    full_name = NULLIF(TRIM(p_data->>'full_name'), ''),
    email = NULLIF(TRIM(p_data->>'email'), ''),
    mobile_number = NULLIF(TRIM(p_data->>'mobile_number'), ''),
    gender = NULLIF(p_data->>'gender', ''),
    date_of_birth = CASE
      WHEN p_data->>'date_of_birth' IS NOT NULL AND p_data->>'date_of_birth' != '' THEN (p_data->>'date_of_birth')::date
      ELSE NULL
    END,
    company_name = NULLIF(TRIM(p_data->>'company_name'), ''),
    company_designation_id = CASE
      WHEN p_data->>'company_designation_id' IS NOT NULL AND p_data->>'company_designation_id' != '' THEN (p_data->>'company_designation_id')::uuid
      ELSE NULL
    END,
    company_address = NULLIF(TRIM(p_data->>'company_address'), ''),
    state = NULLIF(p_data->>'state', ''),
    district = NULLIF(p_data->>'district', ''),
    city = NULLIF(p_data->>'city', ''),
    is_custom_city = COALESCE((p_data->>'is_custom_city')::boolean, false),
    other_city_name = NULLIF(p_data->>'other_city_name', ''),
    pin_code = NULLIF(p_data->>'pin_code', ''),
    industry = NULLIF(p_data->>'industry', ''),
    activity_type = NULLIF(p_data->>'activity_type', ''),
    constitution = NULLIF(p_data->>'constitution', ''),
    annual_turnover = NULLIF(p_data->>'annual_turnover', ''),
    number_of_employees = NULLIF(p_data->>'number_of_employees', ''),
    products_services = NULLIF(TRIM(p_data->>'products_services'), ''),
    brand_names = NULLIF(p_data->>'brand_names', ''),
    website = NULLIF(p_data->>'website', ''),
    gst_registered = NULLIF(p_data->>'gst_registered', ''),
    gst_number = NULLIF(p_data->>'gst_number', ''),
    pan_company = NULLIF(TRIM(p_data->>'pan_company'), ''),
    esic_registered = NULLIF(p_data->>'esic_registered', ''),
    epf_registered = NULLIF(p_data->>'epf_registered', ''),
    member_id = NULLIF(p_data->>'member_id', ''),
    referred_by = NULLIF(TRIM(p_data->>'referred_by'), ''),
    amount_paid = NULLIF(p_data->>'amount_paid', ''),
    payment_date = CASE
      WHEN p_data->>'payment_date' IS NOT NULL AND p_data->>'payment_date' != '' THEN (p_data->>'payment_date')::date
      ELSE NULL
    END,
    payment_mode = NULLIF(p_data->>'payment_mode', ''),
    transaction_id = NULLIF(p_data->>'transaction_id', ''),
    bank_reference = NULLIF(p_data->>'bank_reference', ''),
    alternate_contact_name = NULLIF(p_data->>'alternate_contact_name', ''),
    alternate_mobile = NULLIF(p_data->>'alternate_mobile', ''),
    profile_photo_url = CASE
      WHEN p_data->>'profile_photo_url' = '__NEW_PHOTO__' THEN profile_photo_url
      WHEN p_data->>'profile_photo_url' = '' THEN NULL
      ELSE NULLIF(p_data->>'profile_photo_url', '')
    END,

    status = 'pending',
    rejection_reason = NULL,
    approval_date = NULL,
    reapplication_count = CASE
      WHEN v_prev_status = 'rejected' THEN COALESCE(reapplication_count, 0) + 1
      ELSE reapplication_count
    END,

    updated_at = now(),
    last_modified_at = now(),
    last_modified_by = p_user_id

  WHERE id = p_member_registration_id
    AND user_id = p_user_id;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated = 0 THEN
    RAISE EXCEPTION 'Update failed (0 rows updated) for user_id=% registration_id=%', p_user_id, p_member_registration_id;
  END IF;

  RETURN json_build_object(
    'success', true,
    'message', 'Profile updated and resubmitted for review',
    'status', 'pending',
    'previous_status', v_prev_status
  );
END;
$function$;

COMMENT ON FUNCTION public.update_member_profile(uuid, uuid, jsonb)
IS 'Updates member registration profile for a custom-auth user and always resubmits the application by setting status=pending, clearing rejection_reason/approval_date, and incrementing reapplication_count when previously rejected.';
