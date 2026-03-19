/*
  # Add session-token wrappers for directory visibility mutations

  1. Purpose
    - Remove remaining privileged browser writes to directory_field_visibility
    - Derive acting user from custom session token
    - Enforce authorization with has_permission(...) server-side
*/

-- =============================================
-- Single field visibility mutation (session-token secured)
-- =============================================

CREATE OR REPLACE FUNCTION public.update_field_visibility_with_session(
  p_session_token text,
  p_field_name text,
  p_show_to_public boolean,
  p_show_to_members boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
  v_field_name text;
BEGIN
  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);

  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT public.has_permission(v_actor_user_id, 'settings.directory.configure') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  v_field_name := NULLIF(trim(p_field_name), '');

  IF v_field_name IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Field name is required');
  END IF;

  UPDATE public.directory_field_visibility
  SET
    show_to_public = COALESCE(p_show_to_public, show_to_public),
    show_to_members = COALESCE(p_show_to_members, show_to_members),
    updated_at = now()
  WHERE field_name = v_field_name;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Field visibility setting not found');
  END IF;

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_field_visibility_with_session(text, text, boolean, boolean) TO PUBLIC;

-- =============================================
-- Batch field visibility mutation (session-token secured)
-- =============================================

CREATE OR REPLACE FUNCTION public.update_multiple_field_visibilities_with_session(
  p_session_token text,
  p_updates jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
  v_update jsonb;
  v_field_name text;
  v_show_to_public boolean;
  v_show_to_members boolean;
BEGIN
  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);

  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT public.has_permission(v_actor_user_id, 'settings.directory.configure') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  IF p_updates IS NULL OR jsonb_typeof(p_updates) IS DISTINCT FROM 'array' OR jsonb_array_length(p_updates) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Updates array is required');
  END IF;

  FOR v_update IN
    SELECT value
    FROM jsonb_array_elements(p_updates)
  LOOP
    v_field_name := NULLIF(trim(v_update->>'field_name'), '');

    IF v_field_name IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Each update must include field_name');
    END IF;

    IF NOT (v_update ? 'show_to_public') OR NOT (v_update ? 'show_to_members') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Each update must include show_to_public and show_to_members');
    END IF;

    v_show_to_public := (v_update->>'show_to_public')::boolean;
    v_show_to_members := (v_update->>'show_to_members')::boolean;

    UPDATE public.directory_field_visibility
    SET
      show_to_public = v_show_to_public,
      show_to_members = v_show_to_members,
      updated_at = now()
    WHERE field_name = v_field_name;

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format('Field visibility setting not found for %s', v_field_name)
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_multiple_field_visibilities_with_session(text, jsonb) TO PUBLIC;
