/*
  # Add session-token wrappers for user role mutations

  1. Purpose
    - Remove remaining direct browser writes to user_roles
    - Derive acting user from custom session token
    - Enforce authorization with has_permission(...) server-side

  2. Scope
    - Covers user_roles insert/update/delete only
    - Does not move browser-side auth.admin.createUser into SQL
*/

-- =============================================
-- Add user role (session-token secured)
-- =============================================

CREATE OR REPLACE FUNCTION public.add_user_role_with_session(
  p_session_token text,
  p_user_id uuid,
  p_role text,
  p_is_member_linked boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
BEGIN
  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);

  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT public.has_permission(v_actor_user_id, 'users.create') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User ID is required');
  END IF;

  IF p_role IS NULL OR trim(p_role) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Role is required');
  END IF;

  INSERT INTO public.user_roles (
    user_id,
    role,
    is_member_linked,
    updated_at
  )
  VALUES (
    p_user_id,
    trim(p_role),
    COALESCE(p_is_member_linked, false),
    now()
  );

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'Role already assigned for this scope');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_user_role_with_session(text, uuid, text, boolean) TO PUBLIC;

-- =============================================
-- Update user role (session-token secured)
-- =============================================

CREATE OR REPLACE FUNCTION public.update_user_role_with_session(
  p_session_token text,
  p_role_id uuid,
  p_updates jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
BEGIN
  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);

  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT public.has_permission(v_actor_user_id, 'users.roles.assign') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  IF p_role_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Role ID is required');
  END IF;

  IF p_updates IS NULL OR p_updates = '{}'::jsonb THEN
    RETURN jsonb_build_object('success', false, 'error', 'Updates payload is required');
  END IF;

  UPDATE public.user_roles
  SET
    role = COALESCE(NULLIF(trim(p_updates->>'role'), ''), role),
    state = CASE
      WHEN p_updates ? 'state' THEN NULLIF(trim(p_updates->>'state'), '')
      ELSE state
    END,
    district = CASE
      WHEN p_updates ? 'district' THEN NULLIF(trim(p_updates->>'district'), '')
      ELSE district
    END,
    is_member_linked = CASE
      WHEN p_updates ? 'is_member_linked' THEN (p_updates->>'is_member_linked')::boolean
      ELSE is_member_linked
    END,
    updated_at = now()
  WHERE id = p_role_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User role not found');
  END IF;

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'Role already assigned for this scope');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_user_role_with_session(text, uuid, jsonb) TO PUBLIC;

-- =============================================
-- Remove user role (session-token secured)
-- =============================================

CREATE OR REPLACE FUNCTION public.remove_user_role_with_session(
  p_session_token text,
  p_role_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
BEGIN
  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);

  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT public.has_permission(v_actor_user_id, 'users.delete') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  IF p_role_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Role ID is required');
  END IF;

  DELETE FROM public.user_roles
  WHERE id = p_role_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User role not found');
  END IF;

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_user_role_with_session(text, uuid) TO PUBLIC;
