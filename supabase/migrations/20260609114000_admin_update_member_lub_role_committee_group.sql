/*
  COD-COMMITTEE-EDIT-001

  Adds a session-token secured RPC for editing the shared fields of an entire
  LUB committee group. A group is identified by:

    committee_year + level + state + district

  This lets admins correct mistakes such as a wrong committee year without
  editing every assignment row individually.
*/

CREATE OR REPLACE FUNCTION public.admin_update_member_lub_role_committee_group_with_session(
  p_session_token text,
  p_current_level text,
  p_current_state text DEFAULT NULL,
  p_current_district text DEFAULT NULL,
  p_current_committee_year text DEFAULT NULL,
  p_new_level text DEFAULT NULL,
  p_new_state text DEFAULT NULL,
  p_new_district text DEFAULT NULL,
  p_new_committee_year text DEFAULT NULL,
  p_new_role_start_date date DEFAULT NULL,
  p_new_role_end_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
  v_current_state text := NULLIF(trim(COALESCE(p_current_state, '')), '');
  v_current_district text := NULLIF(trim(COALESCE(p_current_district, '')), '');
  v_new_state text := NULLIF(trim(COALESCE(p_new_state, '')), '');
  v_new_district text := NULLIF(trim(COALESCE(p_new_district, '')), '');
  v_matched_count integer := 0;
  v_updated_count integer := 0;
BEGIN
  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);

  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT public.has_permission(v_actor_user_id, 'organization.designations.manage') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  IF p_current_level IS NULL OR p_current_level NOT IN ('national', 'state', 'district', 'city') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Current level must be one of national/state/district/city');
  END IF;

  IF p_new_level IS NULL OR p_new_level NOT IN ('national', 'state', 'district', 'city') THEN
    RETURN jsonb_build_object('success', false, 'error', 'New level must be one of national/state/district/city');
  END IF;

  IF p_current_committee_year IS NULL OR p_current_committee_year !~ '^[0-9]{4}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Current committee year must be a 4-digit year');
  END IF;

  IF p_new_committee_year IS NULL OR p_new_committee_year !~ '^[0-9]{4}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'New committee year must be a 4-digit year');
  END IF;

  IF p_current_level IN ('state', 'district', 'city') AND v_current_state IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Current state is required for this level');
  END IF;

  IF p_current_level IN ('district', 'city') AND v_current_district IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Current district is required for this level');
  END IF;

  IF p_new_level IN ('state', 'district', 'city') AND v_new_state IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'State is required for this level');
  END IF;

  IF p_new_level IN ('district', 'city') AND v_new_district IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'District is required for this level');
  END IF;

  IF p_current_level = 'national' THEN
    v_current_state := NULL;
    v_current_district := NULL;
  ELSIF p_current_level = 'state' THEN
    v_current_district := NULL;
  END IF;

  IF p_new_level = 'national' THEN
    v_new_state := NULL;
    v_new_district := NULL;
  ELSIF p_new_level = 'state' THEN
    v_new_district := NULL;
  END IF;

  IF p_new_role_start_date IS NOT NULL
     AND p_new_role_end_date IS NOT NULL
     AND p_new_role_end_date < p_new_role_start_date
  THEN
    RETURN jsonb_build_object('success', false, 'error', 'Period To date cannot be before Period From date');
  END IF;

  SELECT count(*)
  INTO v_matched_count
  FROM public.member_lub_role_assignments a
  WHERE a.level = p_current_level
    AND lower(trim(COALESCE(a.state, ''))) = lower(trim(COALESCE(v_current_state, '')))
    AND lower(trim(COALESCE(a.district, ''))) = lower(trim(COALESCE(v_current_district, '')))
    AND COALESCE(a.committee_year, '') = p_current_committee_year;

  IF v_matched_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No assignments found for the selected committee');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.member_lub_role_assignments target
    WHERE target.level = p_new_level
      AND lower(trim(COALESCE(target.state, ''))) = lower(trim(COALESCE(v_new_state, '')))
      AND lower(trim(COALESCE(target.district, ''))) = lower(trim(COALESCE(v_new_district, '')))
      AND NOT (
        target.level = p_current_level
        AND lower(trim(COALESCE(target.state, ''))) = lower(trim(COALESCE(v_current_state, '')))
        AND lower(trim(COALESCE(target.district, ''))) = lower(trim(COALESCE(v_current_district, '')))
        AND COALESCE(target.committee_year, '') = p_current_committee_year
      )
      AND EXISTS (
        SELECT 1
        FROM public.member_lub_role_assignments source
        WHERE source.level = p_current_level
          AND lower(trim(COALESCE(source.state, ''))) = lower(trim(COALESCE(v_current_state, '')))
          AND lower(trim(COALESCE(source.district, ''))) = lower(trim(COALESCE(v_current_district, '')))
          AND COALESCE(source.committee_year, '') = p_current_committee_year
          AND source.member_id = target.member_id
          AND source.role_id = target.role_id
          AND COALESCE(source.assignee_kind, 'main') = COALESCE(target.assignee_kind, 'main')
      )
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Target committee conflicts with existing assignments for the same member and role'
    );
  END IF;

  WITH updated AS (
    UPDATE public.member_lub_role_assignments a
    SET
      level = p_new_level,
      state = v_new_state,
      district = v_new_district,
      committee_year = p_new_committee_year,
      role_start_date = p_new_role_start_date,
      role_end_date = p_new_role_end_date,
      updated_at = now()
    WHERE a.level = p_current_level
      AND lower(trim(COALESCE(a.state, ''))) = lower(trim(COALESCE(v_current_state, '')))
      AND lower(trim(COALESCE(a.district, ''))) = lower(trim(COALESCE(v_current_district, '')))
      AND COALESCE(a.committee_year, '') = p_current_committee_year
    RETURNING a.member_id
  )
  INSERT INTO public.member_audit_history (
    member_id,
    action_type,
    changed_by,
    field_name,
    change_reason
  )
  SELECT
    updated.member_id,
    'update',
    v_actor_user_id,
    'member_lub_role_committee_group',
    format(
      'Updated committee group: level=%s->%s, state=%s->%s, district=%s->%s, year=%s->%s',
      p_current_level,
      p_new_level,
      COALESCE(v_current_state, 'N/A'),
      COALESCE(v_new_state, 'N/A'),
      COALESCE(v_current_district, 'N/A'),
      COALESCE(v_new_district, 'N/A'),
      p_current_committee_year,
      p_new_committee_year
    )
  FROM updated;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  NOTIFY pgrst, 'reload schema';

  RETURN jsonb_build_object(
    'success', true,
    'updated_count', v_updated_count
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('database error: %s', SQLERRM)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_member_lub_role_committee_group_with_session(
  text, text, text, text, text, text, text, text, text, date, date
) TO PUBLIC;

COMMENT ON FUNCTION public.admin_update_member_lub_role_committee_group_with_session(
  text, text, text, text, text, text, text, text, text, date, date
) IS
  'Session-token secured admin RPC for editing shared committee group fields across matching member_lub_role_assignments rows.';

NOTIFY pgrst, 'reload schema';
