/*
  # Secure custom auth mutation RPCs

  1. Purpose
    - Stop trusting caller-supplied user IDs for credential mutations
    - Stop trusting caller-supplied admin IDs for admin user edits
    - Revoke public access to set_session_user()

  2. Approach
    - Resolve the acting user from a validated custom auth session token
    - Keep browser access through public EXECUTE on token-based RPCs
*/

CREATE OR REPLACE FUNCTION public.resolve_custom_session_user_id(
  p_session_token text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_token text := btrim(COALESCE(p_session_token, ''));
  v_session auth_sessions%ROWTYPE;
BEGIN
  IF v_token = '' THEN
    RETURN NULL;
  END IF;

  SELECT *
  INTO v_session
  FROM auth_sessions
  WHERE session_token = v_token
  LIMIT 1;

  IF v_session.id IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_session.expires_at <= now() THEN
    DELETE FROM auth_sessions
    WHERE id = v_session.id;
    RETURN NULL;
  END IF;

  RETURN v_session.user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_custom_session_user_id(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_session_user(uuid) FROM PUBLIC;

DROP FUNCTION IF EXISTS public.change_user_email(uuid, text);
DROP FUNCTION IF EXISTS public.change_user_mobile(uuid, text);

CREATE OR REPLACE FUNCTION public.change_user_email(
  p_session_token text,
  p_new_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
  v_current_email text;
  v_normalized_email text := lower(trim(p_new_email));
BEGIN
  IF v_normalized_email IS NULL OR v_normalized_email = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Email address is required');
  END IF;

  IF v_normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Please enter a valid email address');
  END IF;

  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);

  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  SELECT u.email
  INTO v_current_email
  FROM users AS u
  WHERE u.id = v_actor_user_id
  LIMIT 1;

  IF v_current_email IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  UPDATE users
  SET
    email = v_normalized_email,
    updated_at = now()
  WHERE id = v_actor_user_id;

  UPDATE member_registrations
  SET email = v_normalized_email
  WHERE user_id = v_actor_user_id
     OR email = v_current_email;

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'This email address is already registered.');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.change_user_email(text, text) TO PUBLIC;

CREATE OR REPLACE FUNCTION public.change_user_mobile(
  p_session_token text,
  p_new_mobile text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
  v_current_mobile text;
  v_normalized_mobile text := regexp_replace(COALESCE(trim(p_new_mobile), ''), '[^0-9]', '', 'g');
BEGIN
  IF v_normalized_mobile ~ '^0[0-9]{10}$' THEN
    v_normalized_mobile := substring(v_normalized_mobile FROM 2);
  END IF;

  IF v_normalized_mobile = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Mobile number is required');
  END IF;

  IF v_normalized_mobile !~ '^[1-9][0-9]{9}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Mobile number must be exactly 10 digits');
  END IF;

  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);

  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  SELECT u.mobile_number
  INTO v_current_mobile
  FROM users AS u
  WHERE u.id = v_actor_user_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  UPDATE users
  SET
    mobile_number = v_normalized_mobile,
    updated_at = now()
  WHERE id = v_actor_user_id;

  UPDATE member_registrations
  SET mobile_number = v_normalized_mobile
  WHERE user_id = v_actor_user_id
     OR (v_current_mobile IS NOT NULL AND mobile_number = v_current_mobile);

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'This mobile number is already registered.');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.change_user_mobile(text, text) TO PUBLIC;

DROP FUNCTION IF EXISTS public.admin_update_user_details(uuid, uuid, text, text, text);

CREATE OR REPLACE FUNCTION public.admin_update_user_details(
  p_session_token text,
  p_user_id uuid,
  p_email text DEFAULT NULL,
  p_mobile_number text DEFAULT NULL,
  p_new_password text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
  v_is_admin boolean := false;
  v_current_email text;
  v_current_mobile text;
  v_normalized_email text;
  v_normalized_mobile text;
BEGIN
  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);

  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  SELECT EXISTS(
    SELECT 1
    FROM users AS u
    LEFT JOIN user_roles AS ur ON ur.user_id = u.id
    WHERE u.id = v_actor_user_id
      AND u.account_status = 'active'
      AND (u.account_type IN ('admin', 'both') OR ur.role IN ('super_admin', 'admin', 'editor'))
  )
  INTO v_is_admin;

  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  SELECT u.email, u.mobile_number
  INTO v_current_email, v_current_mobile
  FROM users AS u
  WHERE u.id = p_user_id
  LIMIT 1;

  IF v_current_email IS NULL AND v_current_mobile IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  IF p_email IS NOT NULL THEN
    v_normalized_email := lower(trim(p_email));

    IF v_normalized_email = '' OR v_normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Please enter a valid email address');
    END IF;

    UPDATE users
    SET
      email = v_normalized_email,
      updated_at = now()
    WHERE id = p_user_id;

    UPDATE member_registrations
    SET email = v_normalized_email
    WHERE user_id = p_user_id
       OR email = v_current_email;
  END IF;

  IF p_mobile_number IS NOT NULL THEN
    v_normalized_mobile := regexp_replace(COALESCE(trim(p_mobile_number), ''), '[^0-9]', '', 'g');

    IF v_normalized_mobile ~ '^0[0-9]{10}$' THEN
      v_normalized_mobile := substring(v_normalized_mobile FROM 2);
    END IF;

    IF v_normalized_mobile = '' OR v_normalized_mobile !~ '^[1-9][0-9]{9}$' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Mobile number must be exactly 10 digits');
    END IF;

    UPDATE users
    SET
      mobile_number = v_normalized_mobile,
      updated_at = now()
    WHERE id = p_user_id;

    UPDATE member_registrations
    SET mobile_number = v_normalized_mobile
    WHERE user_id = p_user_id
       OR (v_current_mobile IS NOT NULL AND mobile_number = v_current_mobile);
  END IF;

  RETURN jsonb_build_object('success', true, 'user_id', p_user_id);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'Email or mobile number is already in use');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_user_details(text, uuid, text, text, text) TO PUBLIC;

COMMENT ON FUNCTION public.admin_update_user_details(text, uuid, text, text, text) IS
  'SECURITY DEFINER function for admins to update user email and mobile number using a validated custom auth session token. Password parameter is retained for compatibility but ignored.';
