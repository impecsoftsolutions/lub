/*
  # Link signup runtime validation to published form configuration

  - Replaces create_portal_user_with_session_v2 to read field visibility/required/validation
    from form_config_v2_live_fields (published snapshot), not draft table.
  - Prevents signup when live snapshot is empty (unpublished form).
  - Keeps inactive/missing validation rules non-blocking (skip rule check) so Validation
    Settings active toggle controls enforcement safely.
*/

CREATE OR REPLACE FUNCTION public.create_portal_user_with_session_v2(
  p_email text,
  p_mobile_number text,
  p_state text DEFAULT NULL,
  p_dynamic_payload jsonb DEFAULT NULL,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_email text := lower(trim(COALESCE(p_email, '')));
  v_mobile text := regexp_replace(COALESCE(trim(p_mobile_number), ''), '[^0-9]', '', 'g');
  v_state text := trim(COALESCE(p_state, ''));
  v_user public.users%ROWTYPE;
  v_session_token text;
  v_expires_at timestamptz := now() + interval '7 days';
  v_state_required boolean := true;
  v_state_visible boolean := true;
  v_signup_form_id uuid;
  v_live_field_count integer := 0;
  v_sanitized_payload jsonb := '{}'::jsonb;
  v_payload_item record;
  v_required_field record;
  v_rule_field record;
  v_custom_value jsonb;
  v_custom_text text;
  v_rule_pattern text;
  v_rule_error text;
BEGIN
  IF v_mobile ~ '^0[0-9]{10}$' THEN
    v_mobile := substring(v_mobile FROM 2);
  END IF;

  IF v_email = '' OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Please enter a valid email address.');
  END IF;

  IF v_mobile = '' OR v_mobile !~ '^[1-9][0-9]{9}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Mobile number must be exactly 10 digits.');
  END IF;

  SELECT id INTO v_signup_form_id
  FROM public.form_config_v2_forms
  WHERE form_key = 'signup'
    AND is_active = true
  LIMIT 1;

  IF v_signup_form_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'This form is currently unavailable. Please check back later.');
  END IF;

  SELECT COUNT(*)::integer
  INTO v_live_field_count
  FROM public.form_config_v2_live_fields lf
  WHERE lf.form_id = v_signup_form_id;

  IF v_live_field_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'This form is currently unavailable. Please check back later.');
  END IF;

  SELECT
    COALESCE(lf.is_visible, true),
    COALESCE(lf.is_required, true)
  INTO
    v_state_visible,
    v_state_required
  FROM public.form_config_v2_live_fields lf
  WHERE lf.form_id = v_signup_form_id
    AND lf.field_key = 'state'
  LIMIT 1;

  IF NOT v_state_visible THEN
    v_state_required := false;
    v_state := '';
  END IF;

  IF v_state_required AND v_state = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Please select a state.');
  END IF;

  IF v_state <> '' AND NOT EXISTS (
    SELECT 1
    FROM public.v_active_payment_settings vaps
    WHERE vaps.state = v_state
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Please select a valid state.');
  END IF;

  IF jsonb_typeof(COALESCE(p_dynamic_payload, '{}'::jsonb)) <> 'object' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid dynamic payload.');
  END IF;

  FOR v_payload_item IN
    SELECT key, value
    FROM jsonb_each(COALESCE(p_dynamic_payload, '{}'::jsonb))
  LOOP
    IF EXISTS (
      SELECT 1
      FROM public.form_config_v2_live_fields lf
      WHERE lf.form_id = v_signup_form_id
        AND lf.field_key = v_payload_item.key
        AND lf.is_system_field = false
        AND lf.is_visible = true
    ) THEN
      v_sanitized_payload := v_sanitized_payload || jsonb_build_object(v_payload_item.key, v_payload_item.value);
    END IF;
  END LOOP;

  FOR v_required_field IN
    SELECT
      lf.field_key,
      lf.label,
      lf.field_type
    FROM public.form_config_v2_live_fields lf
    WHERE lf.form_id = v_signup_form_id
      AND lf.is_system_field = false
      AND lf.is_visible = true
      AND lf.is_required = true
  LOOP
    v_custom_value := v_sanitized_payload -> v_required_field.field_key;

    IF v_required_field.field_type = 'checkbox' THEN
      IF v_custom_value IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', format('%s is required.', v_required_field.label));
      END IF;
    ELSE
      v_custom_text := trim(COALESCE(v_custom_value #>> '{}', ''));
      IF v_custom_value IS NULL OR v_custom_text = '' THEN
        RETURN jsonb_build_object('success', false, 'error', format('%s is required.', v_required_field.label));
      END IF;
    END IF;
  END LOOP;

  FOR v_rule_field IN
    SELECT
      lf.field_key,
      lf.label,
      lf.validation_rule_id
    FROM public.form_config_v2_live_fields lf
    WHERE lf.form_id = v_signup_form_id
      AND lf.is_system_field = false
      AND lf.is_visible = true
      AND lf.validation_rule_id IS NOT NULL
  LOOP
    v_custom_value := v_sanitized_payload -> v_rule_field.field_key;

    IF v_custom_value IS NULL THEN
      CONTINUE;
    END IF;

    v_custom_text := trim(COALESCE(v_custom_value #>> '{}', ''));
    IF v_custom_text = '' THEN
      CONTINUE;
    END IF;

    SELECT vr.validation_pattern, vr.error_message
    INTO v_rule_pattern, v_rule_error
    FROM public.validation_rules vr
    WHERE vr.id = v_rule_field.validation_rule_id
      AND vr.is_active = true
    LIMIT 1;

    IF v_rule_pattern IS NULL OR trim(v_rule_pattern) = '' THEN
      CONTINUE;
    END IF;

    IF v_custom_text !~ v_rule_pattern THEN
      RETURN jsonb_build_object('success', false, 'error', COALESCE(v_rule_error, format('%s is invalid.', v_rule_field.label)));
    END IF;
  END LOOP;

  INSERT INTO public.users (
    email,
    mobile_number,
    state,
    account_type,
    account_status,
    created_at,
    updated_at
  )
  VALUES (
    v_email,
    v_mobile,
    NULLIF(v_state, ''),
    'general_user',
    'active',
    now(),
    now()
  )
  RETURNING *
  INTO v_user;

  SELECT public.generate_session_token()
  INTO v_session_token;

  IF v_session_token IS NULL OR v_session_token = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Failed to create account session.');
  END IF;

  INSERT INTO public.auth_sessions (
    user_id,
    session_token,
    ip_address,
    user_agent,
    expires_at,
    last_activity_at
  )
  VALUES (
    v_user.id,
    v_session_token,
    p_ip_address,
    p_user_agent,
    v_expires_at,
    now()
  );

  INSERT INTO public.form_config_v2_submissions (
    form_key,
    user_id,
    source,
    core_payload,
    custom_payload
  )
  VALUES (
    'signup',
    v_user.id,
    'signup_v2',
    jsonb_build_object(
      'email', v_email,
      'mobile_number', v_mobile,
      'state', NULLIF(v_state, '')
    ),
    v_sanitized_payload
  );

  RETURN jsonb_build_object(
    'success', true,
    'sessionToken', v_session_token,
    'expiresAt', v_expires_at,
    'user', jsonb_build_object(
      'id', v_user.id,
      'email', v_user.email,
      'mobile_number', v_user.mobile_number,
      'state', v_user.state,
      'account_type', v_user.account_type,
      'account_status', v_user.account_status,
      'email_verified', v_user.email_verified,
      'mobile_verified', v_user.mobile_verified,
      'is_active', v_user.is_active,
      'last_login_at', v_user.last_login_at,
      'failed_login_attempts', COALESCE(v_user.failed_login_attempts, 0),
      'locked_until', v_user.locked_until,
      'created_at', v_user.created_at,
      'updated_at', v_user.updated_at
    )
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',
      CASE
        WHEN lower(SQLERRM) LIKE '%email%' THEN 'This email address is already registered. You can either sign in to your account or register with a different email address.'
        WHEN lower(SQLERRM) LIKE '%mobile%' THEN 'This mobile number is already registered. You can either sign in to your account or register with a different mobile number.'
        ELSE 'This email address or mobile number is already registered.'
      END
    );
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_portal_user_with_session_v2(text, text, text, jsonb, text, text) TO PUBLIC;
