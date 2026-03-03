/*
  # Create portal user with session

  1. Purpose
    - Create a passwordless general_user account
    - Immediately create a custom auth session so signup can continue to Join
*/

CREATE OR REPLACE FUNCTION public.create_portal_user_with_session(
  p_email text,
  p_mobile_number text,
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

  INSERT INTO users (
    email,
    mobile_number,
    account_type,
    account_status,
    created_at,
    updated_at
  )
  VALUES (
    v_email,
    v_mobile,
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

GRANT EXECUTE ON FUNCTION public.create_portal_user_with_session(text, text, text, text) TO PUBLIC;
