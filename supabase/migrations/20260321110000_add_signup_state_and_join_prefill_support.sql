/*
  # Add signup state persistence and Join prefill support

  1. Purpose
    - Persist a selected state during user signup
    - Return that state in the signup response and session validation payload
    - Allow Join to prefill state from the authenticated user account
*/

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS state text;

DROP FUNCTION IF EXISTS public.create_portal_user_with_session(text, text, text, text);

CREATE OR REPLACE FUNCTION public.create_portal_user_with_session(
  p_email text,
  p_mobile_number text,
  p_state text,
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
  v_user users%ROWTYPE;
  v_session_token text;
  v_expires_at timestamptz := now() + interval '7 days';
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

  IF v_state = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Please select a state.');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.v_active_payment_settings vaps
    WHERE vaps.state = v_state
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Please select a valid state.');
  END IF;

  INSERT INTO users (
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
    v_state,
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

  INSERT INTO auth_sessions (
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

GRANT EXECUTE ON FUNCTION public.create_portal_user_with_session(text, text, text, text, text) TO PUBLIC;

CREATE OR REPLACE FUNCTION public.get_session_user_by_token(
  p_session_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_session auth_sessions%ROWTYPE;
  v_user users%ROWTYPE;
  v_member RECORD;
BEGIN
  IF p_session_token IS NULL OR trim(p_session_token) = '' THEN
    RETURN jsonb_build_object(
      'isValid', false,
      'error', 'Invalid session',
      'errorCode', 'session_invalid'
    );
  END IF;

  SELECT * INTO v_session
  FROM auth_sessions
  WHERE session_token = p_session_token
  LIMIT 1;

  IF v_session.id IS NULL THEN
    RETURN jsonb_build_object(
      'isValid', false,
      'error', 'Invalid session',
      'errorCode', 'session_invalid'
    );
  END IF;

  IF v_session.expires_at <= now() THEN
    DELETE FROM auth_sessions
    WHERE id = v_session.id;

    RETURN jsonb_build_object(
      'isValid', false,
      'error', 'Session expired',
      'errorCode', 'session_expired'
    );
  END IF;

  SELECT * INTO v_user
  FROM users
  WHERE id = v_session.user_id
  LIMIT 1;

  IF v_user.id IS NULL THEN
    RETURN jsonb_build_object(
      'isValid', false,
      'error', 'User not found',
      'errorCode', 'user_not_found'
    );
  END IF;

  SELECT
    m.full_name,
    m.profile_photo_url,
    m.company_name,
    m.status,
    m.member_id,
    m.approval_date,
    m.rejection_reason,
    m.reapplication_count
  INTO v_member
  FROM member_registrations m
  WHERE m.user_id = v_user.id
     OR (m.user_id IS NULL AND m.email = v_user.email)
  ORDER BY
    CASE WHEN m.user_id = v_user.id THEN 0 ELSE 1 END,
    m.created_at DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'isValid', true,
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
      'is_frozen', false,
      'last_login_at', v_user.last_login_at,
      'failed_login_attempts', COALESCE(v_user.failed_login_attempts, 0),
      'locked_until', v_user.locked_until,
      'created_at', v_user.created_at,
      'updated_at', v_user.updated_at,
      'full_name', COALESCE(v_member.full_name, ''),
      'profile_photo_url', v_member.profile_photo_url,
      'company_name', COALESCE(v_member.company_name, ''),
      'status', COALESCE(v_member.status, 'pending'),
      'member_id', v_member.member_id,
      'approval_date', v_member.approval_date,
      'rejection_reason', v_member.rejection_reason,
      'reapplication_count', COALESCE(v_member.reapplication_count, 0)
    )
  );
END;
$$;
