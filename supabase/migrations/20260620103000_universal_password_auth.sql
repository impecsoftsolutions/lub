BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS password_set_at timestamptz;

UPDATE public.users
SET password_set_at = COALESCE(password_set_at, updated_at, created_at, now())
WHERE password_set_at IS NULL
  AND password_hash LIKE '$2%';

UPDATE public.users
SET password_set_at = NULL
WHERE password_hash IS NULL
   OR password_hash NOT LIKE '$2%';

CREATE TABLE IF NOT EXISTS public.member_password_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  purpose text NOT NULL CHECK (purpose IN ('setup', 'reset')),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_member_password_tokens_user_purpose
  ON public.member_password_tokens(user_id, purpose);

CREATE INDEX IF NOT EXISTS idx_member_password_tokens_hash
  ON public.member_password_tokens(token_hash);

CREATE INDEX IF NOT EXISTS idx_member_password_tokens_expires_at
  ON public.member_password_tokens(expires_at);

ALTER TABLE public.member_password_tokens ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.create_portal_user_with_session_v2(
  p_email text,
  p_mobile_number text,
  p_password text,
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
  v_password text := COALESCE(p_password, '');
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

  IF length(v_password) < 6 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Password must be at least 6 characters.');
  END IF;

  IF jsonb_typeof(COALESCE(p_dynamic_payload, '{}'::jsonb)) <> 'object' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid dynamic payload.');
  END IF;

  IF COALESCE(p_dynamic_payload, '{}'::jsonb) ? 'password' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid dynamic payload.');
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
    password_hash,
    password_set_at,
    account_type,
    account_status,
    created_at,
    updated_at
  )
  VALUES (
    v_email,
    v_mobile,
    NULLIF(v_state, ''),
    public.hash_password(v_password),
    now(),
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
      'error', 'This email address or mobile number is already registered. Please sign in or use forgot password.'
    );
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Failed to create account. Please try again.');
END;
$$;

CREATE OR REPLACE FUNCTION public.sign_in_with_password(
  p_identifier text,
  p_password text,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_identifier text := trim(COALESCE(p_identifier, ''));
  v_password text := COALESCE(p_password, '');
  v_email text := lower(v_identifier);
  v_mobile text := regexp_replace(v_identifier, '[^0-9]', '', 'g');
  v_lookup_kind text := NULL;
  v_user record;
  v_failed_result jsonb;
  v_session_token text;
  v_expires_at timestamptz := now() + interval '7 days';
  v_minutes_left integer;
BEGIN
  IF v_mobile ~ '^0[0-9]{10}$' THEN
    v_mobile := substring(v_mobile FROM 2);
  END IF;

  IF v_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    v_lookup_kind := 'email';
  ELSIF v_mobile ~ '^[1-9][0-9]{9}$' THEN
    v_lookup_kind := 'mobile';
  ELSE
    PERFORM crypt(v_password, gen_salt('bf', 10));
    RETURN jsonb_build_object('success', false, 'error', 'Invalid credentials', 'error_code', 'invalid_credentials');
  END IF;

  UPDATE public.users AS u
  SET
    account_status = 'active',
    locked_until = NULL,
    failed_login_attempts = 0,
    updated_at = now()
  WHERE (
      (v_lookup_kind = 'email' AND u.email = v_email)
      OR (v_lookup_kind = 'mobile' AND u.mobile_number = v_mobile)
    )
    AND u.account_status = 'locked'
    AND u.locked_until IS NOT NULL
    AND u.locked_until <= now();

  SELECT
    u.id,
    u.email,
    u.mobile_number,
    u.state,
    u.password_hash,
    u.password_set_at,
    u.account_type,
    u.account_status,
    u.email_verified,
    u.mobile_verified,
    u.is_active,
    u.last_login_at,
    COALESCE(u.failed_login_attempts, 0) AS failed_login_attempts,
    u.locked_until,
    u.created_at,
    u.updated_at,
    false::boolean AS is_frozen,
    mr.full_name,
    mr.profile_photo_url,
    mr.company_name,
    mr.status,
    mr.member_id,
    mr.approval_date,
    mr.rejection_reason,
    COALESCE(mr.reapplication_count, 0) AS reapplication_count,
    CASE
      WHEN mr.status = 'approved' AND mr.member_is_active = false THEN false
      ELSE true
    END AS member_can_login,
    CASE
      WHEN mr.status = 'approved' AND mr.member_is_active = false THEN 'Your LUB member account is deactivated. Please contact admin.'
      ELSE NULL
    END AS member_login_reason
  INTO v_user
  FROM public.users AS u
  LEFT JOIN LATERAL (
    SELECT
      m.full_name,
      m.profile_photo_url,
      m.company_name,
      m.status,
      m.member_id,
      m.approval_date,
      m.rejection_reason,
      m.reapplication_count,
      m.is_active AS member_is_active
    FROM public.member_registrations AS m
    WHERE m.user_id = u.id
       OR (m.user_id IS NULL AND m.email = u.email)
    ORDER BY
      CASE WHEN m.user_id = u.id THEN 0 ELSE 1 END,
      m.created_at DESC
    LIMIT 1
  ) AS mr ON true
  WHERE
    (v_lookup_kind = 'email' AND u.email = v_email)
    OR (v_lookup_kind = 'mobile' AND u.mobile_number = v_mobile)
  LIMIT 1;

  IF v_user.id IS NULL THEN
    PERFORM crypt(v_password, gen_salt('bf', 10));
    RETURN jsonb_build_object('success', false, 'error', 'Invalid credentials', 'error_code', 'invalid_credentials');
  END IF;

  IF v_user.account_status = 'locked' AND v_user.locked_until IS NOT NULL AND now() < v_user.locked_until THEN
    v_minutes_left := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_user.locked_until - now())) / 60)::integer);
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Account is locked due to too many failed login attempts. Please try again in %s minute%s.', v_minutes_left, CASE WHEN v_minutes_left = 1 THEN '' ELSE 's' END),
      'error_code', 'account_locked',
      'account_status', 'locked',
      'locked_until', v_user.locked_until
    );
  END IF;

  IF v_user.account_status = 'suspended' OR v_user.is_active = false THEN
    RETURN jsonb_build_object('success', false, 'error', 'Your account has been suspended. Please contact support.', 'error_code', 'account_suspended', 'account_status', 'suspended');
  END IF;

  IF v_user.is_frozen THEN
    RETURN jsonb_build_object('success', false, 'error', 'Your account has been frozen. Please contact administrator.', 'error_code', 'account_frozen');
  END IF;

  IF v_user.member_can_login = false THEN
    RETURN jsonb_build_object('success', false, 'error', COALESCE(v_user.member_login_reason, 'Your LUB member account is deactivated. Please contact admin.'), 'error_code', 'account_frozen');
  END IF;

  IF v_user.password_set_at IS NULL OR v_user.password_hash IS NULL OR v_user.password_hash NOT LIKE '$2%' THEN
    PERFORM crypt(v_password, gen_salt('bf', 10));
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Please set your password using Forgot Password before signing in.',
      'error_code', 'password_pending',
      'account_status', 'password_pending'
    );
  END IF;

  IF NOT public.verify_password(v_password, v_user.password_hash) THEN
    SELECT public.record_failed_login_attempt(v_user.id) INTO v_failed_result;

    IF COALESCE((v_failed_result ->> 'isLocked')::boolean, false) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Too many failed login attempts. Your account has been locked for 3 minutes.',
        'error_code', 'account_locked',
        'account_status', 'locked',
        'locked_until', v_failed_result ->> 'lockedUntil'
      );
    END IF;

    RETURN jsonb_build_object('success', false, 'error', 'Invalid credentials', 'error_code', 'invalid_credentials');
  END IF;

  SELECT public.generate_session_token()
  INTO v_session_token;

  IF v_session_token IS NULL OR v_session_token = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Failed to create session.', 'error_code', 'network_error');
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

  PERFORM public.mark_user_login_success(v_user.id);

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
      'account_status', 'active',
      'email_verified', v_user.email_verified,
      'mobile_verified', v_user.mobile_verified,
      'is_active', v_user.is_active,
      'last_login_at', now(),
      'failed_login_attempts', 0,
      'locked_until', NULL,
      'created_at', v_user.created_at,
      'updated_at', now(),
      'full_name', v_user.full_name,
      'profile_photo_url', v_user.profile_photo_url,
      'company_name', v_user.company_name,
      'status', v_user.status,
      'member_id', v_user.member_id,
      'approval_date', v_user.approval_date,
      'rejection_reason', v_user.rejection_reason,
      'reapplication_count', v_user.reapplication_count,
      'member_can_login', v_user.member_can_login,
      'member_login_reason', v_user.member_login_reason
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_member_password_token(
  p_identifier text,
  p_purpose text DEFAULT 'reset'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_identifier text := trim(COALESCE(p_identifier, ''));
  v_email text := lower(v_identifier);
  v_mobile text := regexp_replace(v_identifier, '[^0-9]', '', 'g');
  v_lookup_kind text := NULL;
  v_user public.users%ROWTYPE;
  v_purpose text := lower(trim(COALESCE(p_purpose, 'reset')));
  v_raw_token text;
  v_token_hash text;
  v_expires_at timestamptz := now() + interval '45 minutes';
BEGIN
  IF v_mobile ~ '^0[0-9]{10}$' THEN
    v_mobile := substring(v_mobile FROM 2);
  END IF;

  IF v_purpose NOT IN ('setup', 'reset') THEN
    v_purpose := 'reset';
  END IF;

  IF v_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    v_lookup_kind := 'email';
  ELSIF v_mobile ~ '^[1-9][0-9]{9}$' THEN
    v_lookup_kind := 'mobile';
  ELSE
    RETURN jsonb_build_object('success', true);
  END IF;

  SELECT *
  INTO v_user
  FROM public.users u
  WHERE
    (v_lookup_kind = 'email' AND u.email = v_email)
    OR (v_lookup_kind = 'mobile' AND u.mobile_number = v_mobile)
  LIMIT 1;

  IF v_user.id IS NULL OR v_user.email IS NULL OR v_user.account_status = 'suspended' OR v_user.is_active = false THEN
    RETURN jsonb_build_object('success', true);
  END IF;

  v_raw_token := encode(gen_random_bytes(32), 'hex');
  v_token_hash := encode(digest(v_raw_token, 'sha256'), 'hex');

  UPDATE public.member_password_tokens
  SET used_at = now()
  WHERE user_id = v_user.id
    AND purpose = v_purpose
    AND used_at IS NULL;

  INSERT INTO public.member_password_tokens (
    user_id,
    token_hash,
    purpose,
    expires_at
  )
  VALUES (
    v_user.id,
    v_token_hash,
    v_purpose,
    v_expires_at
  );

  RETURN jsonb_build_object(
    'success', true,
    'email', v_user.email,
    'token', v_raw_token,
    'expiresAt', v_expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_member_password_token(
  p_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_token text := trim(COALESCE(p_token, ''));
  v_token_hash text;
  v_row record;
  v_email_parts text[];
  v_masked_email text;
BEGIN
  IF v_token = '' OR length(v_token) < 32 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired reset link.', 'error_code', 'token_invalid');
  END IF;

  v_token_hash := encode(digest(v_token, 'sha256'), 'hex');

  SELECT
    t.id,
    t.expires_at,
    t.used_at,
    u.email
  INTO v_row
  FROM public.member_password_tokens t
  JOIN public.users u ON u.id = t.user_id
  WHERE t.token_hash = v_token_hash
  LIMIT 1;

  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired reset link.', 'error_code', 'token_invalid');
  END IF;

  IF v_row.used_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'This reset link has already been used.', 'error_code', 'token_used');
  END IF;

  IF v_row.expires_at <= now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'This reset link has expired.', 'error_code', 'token_expired');
  END IF;

  v_email_parts := regexp_split_to_array(v_row.email, '@');
  v_masked_email := CASE
    WHEN array_length(v_email_parts, 1) = 2 THEN
      left(v_email_parts[1], 2) || '***@' || v_email_parts[2]
    ELSE NULL
  END;

  RETURN jsonb_build_object(
    'success', true,
    'email', v_masked_email,
    'expiresAt', v_row.expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_member_password_reset(
  p_token text,
  p_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_token text := trim(COALESCE(p_token, ''));
  v_password text := COALESCE(p_password, '');
  v_token_hash text;
  v_row record;
BEGIN
  IF length(v_password) < 6 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Password must be at least 6 characters.', 'error_code', 'weak_password');
  END IF;

  IF v_token = '' OR length(v_token) < 32 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired reset link.', 'error_code', 'token_invalid');
  END IF;

  v_token_hash := encode(digest(v_token, 'sha256'), 'hex');

  SELECT
    t.id,
    t.user_id,
    t.expires_at,
    t.used_at
  INTO v_row
  FROM public.member_password_tokens t
  WHERE t.token_hash = v_token_hash
  FOR UPDATE;

  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired reset link.', 'error_code', 'token_invalid');
  END IF;

  IF v_row.used_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'This reset link has already been used.', 'error_code', 'token_used');
  END IF;

  IF v_row.expires_at <= now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'This reset link has expired.', 'error_code', 'token_expired');
  END IF;

  UPDATE public.users
  SET
    password_hash = public.hash_password(v_password),
    password_set_at = now(),
    failed_login_attempts = 0,
    locked_until = NULL,
    account_status = CASE
      WHEN account_status IN ('locked', 'password_pending') THEN 'active'
      ELSE account_status
    END,
    updated_at = now()
  WHERE id = v_row.user_id;

  UPDATE public.member_password_tokens
  SET used_at = now()
  WHERE id = v_row.id;

  UPDATE public.member_password_tokens
  SET used_at = now()
  WHERE user_id = v_row.user_id
    AND used_at IS NULL;

  DELETE FROM public.auth_sessions
  WHERE user_id = v_row.user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_portal_user_with_session_v2(text, text, text, text, jsonb, text, text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.sign_in_with_password(text, text, text, text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_member_password_token(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_member_password_reset(text, text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_member_password_token(text, text) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
