/*
  COD-AUTH-MEMBER-CHANGE-PASSWORD-001

  Add logged-in member password change support. The caller proves identity with
  the active custom session token, verifies the current password, and keeps the
  current session while invalidating all other sessions for that user.
*/

BEGIN;

CREATE OR REPLACE FUNCTION public.change_member_password_with_session(
  p_session_token text,
  p_current_password text,
  p_new_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_user_id uuid;
  v_user public.users%ROWTYPE;
  v_current_password text := COALESCE(p_current_password, '');
  v_new_password text := COALESCE(p_new_password, '');
  v_failed_result jsonb;
BEGIN
  v_user_id := public.resolve_custom_session_user_id(p_session_token);

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid session',
      'error_code', 'session_invalid'
    );
  END IF;

  SELECT *
  INTO v_user
  FROM public.users
  WHERE id = v_user_id
  LIMIT 1;

  IF v_user.id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User not found',
      'error_code', 'user_not_found'
    );
  END IF;

  IF v_user.account_status = 'suspended' OR v_user.is_active = false THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Your account has been suspended. Please contact support.',
      'error_code', 'account_suspended'
    );
  END IF;

  IF v_user.account_status = 'locked'
     AND v_user.locked_until IS NOT NULL
     AND now() < v_user.locked_until
  THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Account is locked due to too many failed attempts. Please try again later.',
      'error_code', 'account_locked',
      'locked_until', v_user.locked_until
    );
  END IF;

  IF v_user.password_set_at IS NULL
     OR v_user.password_hash IS NULL
     OR v_user.password_hash NOT LIKE '$2%'
  THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Please set your password using Forgot Password before changing it.',
      'error_code', 'password_pending'
    );
  END IF;

  IF length(v_new_password) < 6 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Password must be at least 6 characters.',
      'error_code', 'weak_password'
    );
  END IF;

  IF NOT public.verify_password(v_current_password, v_user.password_hash) THEN
    SELECT public.record_failed_login_attempt(v_user.id)
    INTO v_failed_result;

    IF COALESCE((v_failed_result ->> 'isLocked')::boolean, false) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Too many failed attempts. Your account has been locked for 3 minutes.',
        'error_code', 'account_locked',
        'locked_until', v_failed_result ->> 'lockedUntil'
      );
    END IF;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'Current password is incorrect.',
      'error_code', 'invalid_credentials'
    );
  END IF;

  IF v_new_password = v_current_password THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'New password must be different from your current password.',
      'error_code', 'invalid_credentials'
    );
  END IF;

  UPDATE public.users
  SET
    password_hash = public.hash_password(v_new_password),
    password_set_at = now(),
    failed_login_attempts = 0,
    locked_until = NULL,
    account_status = CASE
      WHEN account_status = 'locked' THEN 'active'
      ELSE account_status
    END,
    updated_at = now()
  WHERE id = v_user.id;

  DELETE FROM public.auth_sessions
  WHERE user_id = v_user.id
    AND session_token <> p_session_token;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.change_member_password_with_session(text, text, text) TO PUBLIC;

NOTIFY pgrst, 'reload schema';

COMMIT;
