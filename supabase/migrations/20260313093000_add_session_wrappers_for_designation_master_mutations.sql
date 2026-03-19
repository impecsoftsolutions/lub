/*
  # Add session-token wrappers for designation master mutations

  1. Purpose
    - Remove remaining direct browser writes for company/lub designation master tables
    - Derive actor from custom session token
    - Enforce organization.designations.manage permission server-side
*/

CREATE OR REPLACE FUNCTION public.create_company_designation_with_session(
  p_session_token text,
  p_designation_name text,
  p_is_active boolean DEFAULT true
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

  IF NOT public.has_permission(v_actor_user_id, 'organization.designations.manage') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  IF NULLIF(trim(p_designation_name), '') IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Designation name is required');
  END IF;

  INSERT INTO public.company_designations (designation_name, is_active)
  VALUES (trim(p_designation_name), COALESCE(p_is_active, true));

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_company_designation_with_session(text, text, boolean) TO PUBLIC;

CREATE OR REPLACE FUNCTION public.update_company_designation_with_session(
  p_session_token text,
  p_designation_id uuid,
  p_designation_name text DEFAULT NULL,
  p_is_active boolean DEFAULT NULL
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

  IF NOT public.has_permission(v_actor_user_id, 'organization.designations.manage') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  UPDATE public.company_designations
  SET
    designation_name = COALESCE(NULLIF(trim(p_designation_name), ''), designation_name),
    is_active = COALESCE(p_is_active, is_active),
    updated_at = now()
  WHERE id = p_designation_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Designation not found');
  END IF;

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_company_designation_with_session(text, uuid, text, boolean) TO PUBLIC;

CREATE OR REPLACE FUNCTION public.delete_company_designation_with_session(
  p_session_token text,
  p_designation_id uuid
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

  IF NOT public.has_permission(v_actor_user_id, 'organization.designations.manage') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  DELETE FROM public.company_designations
  WHERE id = p_designation_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Designation not found');
  END IF;

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_company_designation_with_session(text, uuid) TO PUBLIC;

CREATE OR REPLACE FUNCTION public.create_lub_role_with_session(
  p_session_token text,
  p_role_name text,
  p_is_active boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
  v_next_display_order integer;
BEGIN
  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);

  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT public.has_permission(v_actor_user_id, 'organization.designations.manage') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  IF NULLIF(trim(p_role_name), '') IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Role name is required');
  END IF;

  SELECT COALESCE(MAX(display_order), 0) + 1
  INTO v_next_display_order
  FROM public.lub_roles_master;

  INSERT INTO public.lub_roles_master (role_name, is_active, display_order)
  VALUES (trim(p_role_name), COALESCE(p_is_active, true), v_next_display_order);

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_lub_role_with_session(text, text, boolean) TO PUBLIC;

CREATE OR REPLACE FUNCTION public.update_lub_role_with_session(
  p_session_token text,
  p_role_id uuid,
  p_role_name text DEFAULT NULL,
  p_is_active boolean DEFAULT NULL
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

  IF NOT public.has_permission(v_actor_user_id, 'organization.designations.manage') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  UPDATE public.lub_roles_master
  SET
    role_name = COALESCE(NULLIF(trim(p_role_name), ''), role_name),
    is_active = COALESCE(p_is_active, is_active),
    updated_at = now()
  WHERE id = p_role_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Role not found');
  END IF;

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_lub_role_with_session(text, uuid, text, boolean) TO PUBLIC;

CREATE OR REPLACE FUNCTION public.delete_lub_role_with_session(
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

  IF NOT public.has_permission(v_actor_user_id, 'organization.designations.manage') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  DELETE FROM public.lub_roles_master
  WHERE id = p_role_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Role not found');
  END IF;

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_lub_role_with_session(text, uuid) TO PUBLIC;

CREATE OR REPLACE FUNCTION public.update_lub_role_display_order_with_session(
  p_session_token text,
  p_role_id uuid,
  p_display_order integer
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

  IF NOT public.has_permission(v_actor_user_id, 'organization.designations.manage') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  UPDATE public.lub_roles_master
  SET
    display_order = COALESCE(p_display_order, display_order),
    updated_at = now()
  WHERE id = p_role_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Role not found');
  END IF;

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_lub_role_display_order_with_session(text, uuid, integer) TO PUBLIC;
