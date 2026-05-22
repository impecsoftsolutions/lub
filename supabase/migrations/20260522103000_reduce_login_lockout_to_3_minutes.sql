BEGIN;

CREATE OR REPLACE FUNCTION public.record_failed_login_attempt(
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user users%ROWTYPE;
  v_failed_attempts integer;
  v_locked_until timestamptz;
BEGIN
  SELECT * INTO v_user
  FROM users
  WHERE id = p_user_id
  LIMIT 1;

  IF v_user.id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User not found'
    );
  END IF;

  v_failed_attempts := COALESCE(v_user.failed_login_attempts, 0) + 1;
  v_locked_until := NULL;

  IF v_failed_attempts >= 5 THEN
    v_locked_until := now() + interval '3 minutes';

    UPDATE users
    SET
      failed_login_attempts = v_failed_attempts,
      account_status = 'locked',
      locked_until = v_locked_until,
      updated_at = now()
    WHERE id = p_user_id;
  ELSE
    UPDATE users
    SET
      failed_login_attempts = v_failed_attempts,
      updated_at = now()
    WHERE id = p_user_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'failedAttempts', v_failed_attempts,
    'isLocked', v_failed_attempts >= 5,
    'lockedUntil', v_locked_until
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_failed_login_attempt(uuid) TO public;

NOTIFY pgrst, 'reload schema';

COMMIT;
