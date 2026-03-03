/*
  # Add session-token variants for Phase 1 privileged RPCs

  1. Purpose
    - Stop trusting browser-supplied actor UUIDs for high-risk admin/member actions
    - Reuse the custom auth session token model already established in Session 46
    - Keep legacy UUID-based functions in place temporarily for rollout safety

  2. Rollout
    - Apply this migration before revoking legacy function execute privileges
    - Deploy the matching frontend changes before applying the follow-up revoke migration
*/

CREATE OR REPLACE FUNCTION public.get_admin_member_registrations_with_session(
  p_session_token text,
  p_status_filter text DEFAULT NULL,
  p_search_query text DEFAULT NULL,
  p_state_filter text DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS SETOF public.admin_member_registration_type
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
BEGIN
  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);

  IF v_actor_user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.get_admin_member_registrations(
    v_actor_user_id,
    p_status_filter,
    p_search_query,
    p_state_filter,
    p_limit,
    p_offset
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_member_registrations_with_session(text, text, text, text, integer, integer) TO PUBLIC;

CREATE OR REPLACE FUNCTION public.get_admin_member_registration_by_id_with_session(
  p_session_token text,
  p_registration_id uuid
)
RETURNS SETOF public.admin_member_registration_type
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
BEGIN
  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);

  IF v_actor_user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.get_admin_member_registration_by_id(
    v_actor_user_id,
    p_registration_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_member_registration_by_id_with_session(text, uuid) TO PUBLIC;

CREATE OR REPLACE FUNCTION public.update_member_registration_status_with_session(
  p_registration_id uuid,
  p_session_token text,
  p_new_status text,
  p_rejection_reason text DEFAULT NULL
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

  RETURN public.update_member_registration_status(
    p_registration_id,
    v_actor_user_id,
    p_new_status,
    p_rejection_reason
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_member_registration_status_with_session(uuid, text, text, text) TO PUBLIC;

CREATE OR REPLACE FUNCTION public.admin_soft_delete_member_with_session(
  p_registration_id uuid,
  p_session_token text,
  p_reason text
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

  RETURN public.admin_soft_delete_member(
    p_registration_id,
    v_actor_user_id,
    p_reason
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_soft_delete_member_with_session(uuid, text, text) TO PUBLIC;

CREATE OR REPLACE FUNCTION public.get_deleted_members_with_session(
  p_session_token text,
  p_search text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  original_id uuid,
  full_name text,
  email text,
  mobile_number text,
  company_name text,
  status text,
  deleted_at timestamptz,
  deleted_by uuid,
  deletion_reason text
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
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.get_deleted_members(v_actor_user_id, p_search);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_deleted_members_with_session(text, text) TO PUBLIC;

CREATE OR REPLACE FUNCTION public.admin_restore_deleted_member_with_session(
  p_deleted_member_id uuid,
  p_session_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
  v_result jsonb;
BEGIN
  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);

  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF to_regprocedure('public.admin_restore_deleted_member(uuid, uuid)') IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Restore function is not available');
  END IF;

  EXECUTE 'SELECT public.admin_restore_deleted_member($1, $2)'
  INTO v_result
  USING p_deleted_member_id, v_actor_user_id;

  IF v_result IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Restore function returned no result');
  END IF;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_restore_deleted_member_with_session(uuid, text) TO PUBLIC;

CREATE OR REPLACE FUNCTION public.admin_mark_member_registration_viewed_with_session(
  p_application_id uuid,
  p_session_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
  v_is_authorized boolean := false;
BEGIN
  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);

  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  SELECT EXISTS(
    SELECT 1
    FROM users u
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    WHERE u.id = v_actor_user_id
      AND u.account_status = 'active'
      AND (
        u.account_type IN ('admin', 'both')
        OR ur.role IN ('super_admin', 'admin', 'editor', 'viewer')
      )
  ) INTO v_is_authorized;

  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  UPDATE member_registrations
  SET
    reviewed_count = COALESCE(reviewed_count, 0) + 1,
    first_viewed_at = COALESCE(first_viewed_at, now()),
    first_viewed_by = COALESCE(first_viewed_by, v_actor_user_id)
  WHERE id = p_application_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Application not found');
  END IF;

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_mark_member_registration_viewed_with_session(uuid, text) TO PUBLIC;

CREATE OR REPLACE FUNCTION public.admin_block_unblock_user_with_session(
  p_user_id uuid,
  p_session_token text,
  p_is_frozen boolean
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

  RETURN public.admin_block_unblock_user(
    p_user_id,
    v_actor_user_id,
    p_is_frozen
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_block_unblock_user_with_session(uuid, text, boolean) TO PUBLIC;

CREATE OR REPLACE FUNCTION public.admin_delete_user_by_id_with_session(
  p_user_id uuid,
  p_session_token text
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

  RETURN public.admin_delete_user_by_id(
    p_user_id,
    v_actor_user_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_user_by_id_with_session(uuid, text) TO PUBLIC;

CREATE OR REPLACE FUNCTION public.admin_list_custom_city_pending_with_session(
  p_session_token text
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

  RETURN public.admin_list_custom_city_pending(v_actor_user_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_custom_city_pending_with_session(text) TO PUBLIC;

CREATE OR REPLACE FUNCTION public.admin_assign_custom_city_with_session(
  p_session_token text,
  p_state_name text,
  p_district_name text,
  p_other_city_name_normalized text,
  p_approved_city_id uuid
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

  RETURN public.admin_assign_custom_city(
    v_actor_user_id,
    p_state_name,
    p_district_name,
    p_other_city_name_normalized,
    p_approved_city_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_assign_custom_city_with_session(text, text, text, text, uuid) TO PUBLIC;

CREATE OR REPLACE FUNCTION public.admin_add_city_approved_with_session(
  p_session_token text,
  p_city_name text,
  p_state_id uuid,
  p_district_id uuid,
  p_notes text DEFAULT NULL,
  p_is_popular boolean DEFAULT false
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

  RETURN public.admin_add_city_approved(
    v_actor_user_id,
    p_city_name,
    p_state_id,
    p_district_id,
    p_notes,
    p_is_popular
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_add_city_approved_with_session(text, text, uuid, uuid, text, boolean) TO PUBLIC;

CREATE OR REPLACE FUNCTION public.admin_delete_city_with_session(
  p_session_token text,
  p_city_id uuid
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

  RETURN public.admin_delete_city(
    v_actor_user_id,
    p_city_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_city_with_session(text, uuid) TO PUBLIC;

CREATE OR REPLACE FUNCTION public.update_form_field_configuration_with_session(
  p_field_name text,
  p_is_visible boolean,
  p_is_required boolean,
  p_session_token text
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

  RETURN public.update_form_field_configuration(
    p_field_name,
    p_is_visible,
    p_is_required,
    v_actor_user_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_form_field_configuration_with_session(text, boolean, boolean, text) TO PUBLIC;

CREATE OR REPLACE FUNCTION public.reset_form_field_configuration_defaults_with_session(
  p_session_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
  v_is_authorized boolean := false;
  v_rows_updated integer := 0;
BEGIN
  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);

  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  SELECT EXISTS(
    SELECT 1
    FROM users u
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    WHERE u.id = v_actor_user_id
      AND u.account_status = 'active'
      AND (
        u.account_type IN ('admin', 'both')
        OR ur.role IN ('super_admin', 'admin')
      )
  ) INTO v_is_authorized;

  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  UPDATE form_field_configurations
  SET
    is_visible = true,
    updated_by = v_actor_user_id,
    updated_at = now()
  WHERE is_system_field = false;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'rows_updated', v_rows_updated
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_form_field_configuration_defaults_with_session(text) TO PUBLIC;
