/*
  # Add session-token wrappers for city update and designation/member-role RPCs

  1. Purpose
    - Remove remaining privileged browser writes that still rely on client-supplied actor UUIDs
    - Derive acting user from custom session token for city updates and designation/member-role admin flows
    - Enforce authorization with has_permission(...) server-side
*/

-- =============================================
-- City update mutation (session-token secured)
-- =============================================

CREATE OR REPLACE FUNCTION public.admin_update_city_with_session(
  p_session_token text,
  p_city_id uuid,
  p_city_name text,
  p_state_id uuid,
  p_district_id uuid,
  p_notes text DEFAULT NULL
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

  IF NOT public.has_permission(v_actor_user_id, 'locations.cities.manage') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  UPDATE cities_master
  SET
    city_name = COALESCE(NULLIF(trim(p_city_name), ''), city_name),
    state_id = COALESCE(p_state_id, state_id),
    district_id = COALESCE(p_district_id, district_id),
    notes = COALESCE(p_notes, notes),
    updated_at = now()
  WHERE id = p_city_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'City not found');
  END IF;

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_city_with_session(text, uuid, text, uuid, uuid, text) TO PUBLIC;

-- =============================================
-- Designations/member-role wrappers (session-token secured)
-- =============================================

CREATE OR REPLACE FUNCTION public.admin_reorder_lub_roles_with_session(
  p_session_token text,
  p_role_ids uuid[]
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

  RETURN public.admin_reorder_lub_roles(v_actor_user_id, p_role_ids);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_reorder_lub_roles_with_session(text, uuid[]) TO PUBLIC;

CREATE OR REPLACE FUNCTION public.admin_get_member_lub_role_assignments_with_session(
  p_session_token text,
  p_search text DEFAULT NULL
)
RETURNS TABLE (
  assignment_id uuid,
  member_id uuid,
  lub_role_id uuid,
  level text,
  state text,
  district text,
  committee_year text,
  role_start_date date,
  role_end_date date,
  created_at timestamptz,
  updated_at timestamptz,
  member_full_name text,
  member_email text,
  member_mobile_number text,
  member_company_name text,
  member_city text,
  member_district text,
  member_gender text,
  member_profile_photo_url text,
  lub_role_name text,
  lub_role_display_order integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
BEGIN
  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);

  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Invalid session';
  END IF;

  IF NOT (
    public.has_permission(v_actor_user_id, 'organization.designations.view')
    OR public.has_permission(v_actor_user_id, 'organization.designations.manage')
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.admin_get_member_lub_role_assignments(v_actor_user_id, p_search);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_member_lub_role_assignments_with_session(text, text) TO PUBLIC;

CREATE OR REPLACE FUNCTION public.admin_assign_member_lub_role_with_session(
  p_session_token text,
  p_member_id uuid,
  p_role_id uuid,
  p_level text,
  p_state text DEFAULT NULL,
  p_district text DEFAULT NULL,
  p_role_start_date date DEFAULT NULL,
  p_role_end_date date DEFAULT NULL,
  p_committee_year text DEFAULT NULL
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

  RETURN public.admin_assign_member_lub_role(
    v_actor_user_id,
    p_member_id,
    p_role_id,
    p_level,
    p_state,
    p_district,
    p_role_start_date,
    p_role_end_date,
    p_committee_year
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_assign_member_lub_role_with_session(text, uuid, uuid, text, text, text, date, date, text) TO PUBLIC;

CREATE OR REPLACE FUNCTION public.admin_update_member_lub_role_assignment_with_session(
  p_session_token text,
  p_assignment_id uuid,
  p_role_id uuid,
  p_level text,
  p_state text DEFAULT NULL,
  p_district text DEFAULT NULL,
  p_committee_year text DEFAULT NULL,
  p_role_start_date date DEFAULT NULL,
  p_role_end_date date DEFAULT NULL
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

  RETURN public.admin_update_member_lub_role_assignment(
    v_actor_user_id,
    p_assignment_id,
    p_role_id,
    p_level,
    p_state,
    p_district,
    p_committee_year,
    p_role_start_date,
    p_role_end_date
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_member_lub_role_assignment_with_session(text, uuid, uuid, text, text, text, text, date, date) TO PUBLIC;

CREATE OR REPLACE FUNCTION public.admin_delete_member_lub_role_assignment_with_session(
  p_session_token text,
  p_assignment_id uuid
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

  RETURN public.admin_delete_member_lub_role_assignment(
    v_actor_user_id,
    p_assignment_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_member_lub_role_assignment_with_session(text, uuid) TO PUBLIC;
