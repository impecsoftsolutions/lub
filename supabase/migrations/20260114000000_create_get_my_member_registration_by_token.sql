/*
  # Create get_my_member_registration_by_token RPC Function

  1. Purpose
    - Return the latest member_registrations row for a custom-auth session token
    - Avoid reliance on current_user_id() or Supabase Auth JWT

  2. Security
    - SECURITY DEFINER to bypass RLS for self reads
    - Validates session token server-side
*/

CREATE OR REPLACE FUNCTION public.get_my_member_registration_by_token(
  p_session_token text
)
RETURNS SETOF member_registrations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session RECORD;
BEGIN
  -- Validate input
  IF p_session_token IS NULL OR btrim(p_session_token) = '' THEN
    RETURN;
  END IF;

  -- Lookup session
  SELECT *
  INTO v_session
  FROM auth_sessions
  WHERE session_token = p_session_token
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Expired session cleanup
  IF v_session.expires_at <= now() THEN
    DELETE FROM auth_sessions WHERE session_token = p_session_token;
    RETURN;
  END IF;

  -- Return latest registration for this user
  RETURN QUERY
  SELECT mr.*
  FROM member_registrations mr
  WHERE mr.user_id = v_session.user_id
  ORDER BY mr.created_at DESC
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_member_registration_by_token(text) TO public;

COMMENT ON FUNCTION public.get_my_member_registration_by_token(text) IS
  'Custom-auth token validated read of the latest member_registrations row for dashboard/profile/edit.';
