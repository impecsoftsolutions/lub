/*
  # Switch Portal Auth To Email + Mobile Only

  1. Purpose
    - Remove password requirements from portal signup and login
    - Keep custom auth_sessions token model unchanged
    - Replace browser-side protected auth reads with SECURITY DEFINER RPCs

  2. Key Changes
    - Allow NULL password_hash
    - Allow general_user account_type in users
    - Add login/session/credential RPCs for custom auth under RLS
    - Disable password reset and password verification functions for public callers
    - Remove password writes from admin_update_user_details
*/

-- Allow legacy password hashes to remain while new accounts omit them
ALTER TABLE users
  ALTER COLUMN password_hash DROP NOT NULL;

-- Allow portal-created general users in tracked schema
ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_account_type_check;

ALTER TABLE users
  ADD CONSTRAINT users_account_type_check
  CHECK (account_type IN ('admin', 'member', 'both', 'general_user'));

-- Normalize legacy password-pending rows so password is no longer required
UPDATE users
SET
  account_status = 'active',
  updated_at = now()
WHERE account_status = 'password_pending';

-- Replace the public signup policy so password_hash is no longer required
DROP POLICY IF EXISTS "Anyone can signup (insert user)" ON users;

CREATE POLICY "Anyone can signup (insert user)"
  ON users
  FOR INSERT
  TO public
  WITH CHECK (
    account_type IN ('general_user', 'member', 'both') AND
    email IS NOT NULL AND
    mobile_number IS NOT NULL AND
    regexp_replace(mobile_number, '[^0-9]', '', 'g') ~ '^[1-9][0-9]{9}$' AND
    account_status = 'active'
  );

COMMENT ON POLICY "Anyone can signup (insert user)" ON users IS
  'Allows public signup without passwords. Restricted to non-admin account types and valid 10-digit mobile numbers.';

-- =============================================
-- Login lookup and state RPCs
-- =============================================

CREATE OR REPLACE FUNCTION public.lookup_user_for_login(
  p_email text
)
RETURNS TABLE (
  id uuid,
  email text,
  mobile_number text,
  account_type text,
  account_status text,
  is_active boolean,
  is_frozen boolean,
  last_login_at timestamptz,
  failed_login_attempts integer,
  locked_until timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  full_name text,
  profile_photo_url text,
  company_name text,
  status text,
  member_id text,
  approval_date timestamptz,
  rejection_reason text,
  reapplication_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_email text := lower(trim(p_email));
BEGIN
  IF v_email IS NULL OR v_email = '' THEN
    RETURN;
  END IF;

  -- Auto-clear expired locks before returning account data
  UPDATE users
  SET
    account_status = 'active',
    locked_until = NULL,
    failed_login_attempts = 0,
    updated_at = now()
  WHERE email = v_email
    AND account_status = 'locked'
    AND locked_until IS NOT NULL
    AND locked_until <= now();

  RETURN QUERY
  SELECT
    u.id,
    u.email,
    u.mobile_number,
    u.account_type,
    u.account_status,
    u.is_active,
    false::boolean AS is_frozen,
    u.last_login_at,
    COALESCE(u.failed_login_attempts, 0),
    u.locked_until,
    u.created_at,
    u.updated_at,
    mr.full_name,
    mr.profile_photo_url,
    mr.company_name,
    mr.status,
    mr.member_id,
    mr.approval_date,
    mr.rejection_reason,
    COALESCE(mr.reapplication_count, 0)
  FROM users u
  LEFT JOIN LATERAL (
    SELECT
      m.full_name,
      m.profile_photo_url,
      m.company_name,
      m.status,
      m.member_id,
      m.approval_date,
      m.rejection_reason,
      m.reapplication_count
    FROM member_registrations m
    WHERE m.user_id = u.id
       OR (m.user_id IS NULL AND m.email = u.email)
    ORDER BY
      CASE WHEN m.user_id = u.id THEN 0 ELSE 1 END,
      m.created_at DESC
    LIMIT 1
  ) mr ON true
  WHERE u.email = v_email
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_user_for_login(text) TO public;

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
    v_locked_until := now() + interval '30 minutes';

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

CREATE OR REPLACE FUNCTION public.mark_user_login_success(
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE users
  SET
    last_login_at = now(),
    failed_login_attempts = 0,
    locked_until = NULL,
    account_status = CASE
      WHEN account_status = 'locked' THEN 'active'
      ELSE account_status
    END,
    updated_at = now()
  WHERE id = p_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_user_login_success(uuid) TO public;

-- =============================================
-- Session RPCs for custom auth under RLS
-- =============================================

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

GRANT EXECUTE ON FUNCTION public.get_session_user_by_token(text) TO public;

CREATE OR REPLACE FUNCTION public.refresh_session_by_token(
  p_session_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_updated_count integer;
  v_expires_at timestamptz := now() + interval '7 days';
BEGIN
  UPDATE auth_sessions
  SET
    last_activity_at = now(),
    expires_at = v_expires_at
  WHERE session_token = p_session_token
    AND expires_at > now();

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  IF v_updated_count = 0 THEN
    RETURN jsonb_build_object('success', false);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'expiresAt', v_expires_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_session_by_token(text) TO public;

CREATE OR REPLACE FUNCTION public.delete_session_by_token(
  p_session_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM auth_sessions
  WHERE session_token = p_session_token;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_session_by_token(text) TO public;

-- =============================================
-- Credential mutation RPCs
-- =============================================

DROP FUNCTION IF EXISTS public.change_user_email(uuid, text);
DROP FUNCTION IF EXISTS public.change_user_mobile(uuid, text);

CREATE OR REPLACE FUNCTION public.change_user_email(
  p_user_id uuid,
  p_new_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_current_email text;
  v_normalized_email text := lower(trim(p_new_email));
BEGIN
  IF v_normalized_email IS NULL OR v_normalized_email = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Email address is required');
  END IF;

  IF v_normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Please enter a valid email address');
  END IF;

  SELECT email INTO v_current_email
  FROM users
  WHERE id = p_user_id
  LIMIT 1;

  IF v_current_email IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
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

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'This email address is already registered.');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.change_user_email(uuid, text) TO public;

CREATE OR REPLACE FUNCTION public.change_user_mobile(
  p_user_id uuid,
  p_new_mobile text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
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

  SELECT mobile_number INTO v_current_mobile
  FROM users
  WHERE id = p_user_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
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

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'This mobile number is already registered.');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.change_user_mobile(uuid, text) TO public;

-- =============================================
-- Replace admin user update RPC without password writes
-- =============================================

CREATE OR REPLACE FUNCTION public.admin_update_user_details(
  p_user_id uuid,
  p_requesting_user_id uuid,
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
  v_is_admin boolean := false;
  v_current_email text;
  v_current_mobile text;
  v_normalized_email text;
  v_normalized_mobile text;
BEGIN
  SELECT EXISTS(
    SELECT 1
    FROM users u
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    WHERE u.id = p_requesting_user_id
      AND u.account_status = 'active'
      AND (u.account_type IN ('admin', 'both') OR ur.role IN ('super_admin', 'admin', 'editor'))
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  SELECT email, mobile_number INTO v_current_email, v_current_mobile
  FROM users
  WHERE id = p_user_id
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

  -- p_new_password is intentionally ignored. Password-based auth is deprecated.
  RETURN jsonb_build_object('success', true, 'user_id', p_user_id);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'Email or mobile number is already in use');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_user_details(uuid, uuid, text, text, text) TO public;

COMMENT ON FUNCTION public.admin_update_user_details(uuid, uuid, text, text, text) IS
  'SECURITY DEFINER function for admins to update user email and mobile number. Password parameter is retained for compatibility but ignored.';

-- =============================================
-- Disable password reset and password verification for browser callers
-- =============================================

REVOKE EXECUTE ON FUNCTION lookup_user_for_password_reset(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION validate_password_reset_token(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION reset_user_password(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION hash_password(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION verify_password(text, text) FROM PUBLIC;

DROP POLICY IF EXISTS "Anyone can create reset tokens" ON password_reset_tokens;
DROP POLICY IF EXISTS "Anyone can read reset tokens" ON password_reset_tokens;
DROP POLICY IF EXISTS "Anyone can update reset tokens" ON password_reset_tokens;
DROP POLICY IF EXISTS "System can delete expired tokens" ON password_reset_tokens;
