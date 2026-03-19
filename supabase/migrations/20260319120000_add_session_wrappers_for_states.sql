/*
  # Add session-token wrappers for state management mutations

  1. Purpose
    - Remove remaining privileged browser writes to states_master
    - Derive acting user from custom session token
    - Enforce authorization with has_permission(...) server-side
*/

-- =============================================
-- State upsert mutation (session-token secured)
-- =============================================

CREATE OR REPLACE FUNCTION public.upsert_state_with_session(
  p_session_token text,
  p_state_name text,
  p_is_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
  v_state_name text;
BEGIN
  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);

  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT public.has_permission(v_actor_user_id, 'locations.states.manage') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  v_state_name := NULLIF(trim(p_state_name), '');

  IF v_state_name IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'State name is required');
  END IF;

  INSERT INTO public.states_master (
    state_name,
    is_active,
    updated_at
  )
  VALUES (
    v_state_name,
    COALESCE(p_is_active, true),
    now()
  )
  ON CONFLICT (state_name)
  DO UPDATE SET
    is_active = EXCLUDED.is_active,
    updated_at = now();

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_state_with_session(text, text, boolean) TO PUBLIC;

-- =============================================
-- State active-status mutation (session-token secured)
-- =============================================

CREATE OR REPLACE FUNCTION public.update_state_active_status_with_session(
  p_session_token text,
  p_state_id uuid,
  p_is_active boolean
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

  IF NOT public.has_permission(v_actor_user_id, 'locations.states.manage') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  UPDATE public.states_master
  SET
    is_active = p_is_active,
    updated_at = now()
  WHERE id = p_state_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'State not found');
  END IF;

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_state_active_status_with_session(text, uuid, boolean) TO PUBLIC;
