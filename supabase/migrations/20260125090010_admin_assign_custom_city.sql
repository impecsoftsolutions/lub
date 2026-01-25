/*
  Create admin_assign_custom_city RPC
  - Assigns approved city to custom city registrations.
*/

CREATE OR REPLACE FUNCTION public.admin_assign_custom_city(
  p_requesting_user_id uuid,
  p_state_name text,
  p_district_name text,
  p_other_city_name_normalized text,
  p_approved_city_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_record RECORD;
  v_is_authorized boolean := false;
  v_state_normalized text;
  v_district_normalized text;
  v_other_city_normalized text;
  v_state_id uuid;
  v_district_id uuid;
  v_city_name text;
  v_city_district_id uuid;
  v_city_state_id uuid;
  v_updated_count integer := 0;
BEGIN
  -- ============================================================================
  -- STEP 1: VALIDATE INPUT PARAMETERS
  -- ============================================================================

  IF p_requesting_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Requesting user ID is required'
    );
  END IF;

  IF p_state_name IS NULL OR btrim(p_state_name) = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'State name is required'
    );
  END IF;

  IF p_district_name IS NULL OR btrim(p_district_name) = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'District name is required'
    );
  END IF;

  IF p_other_city_name_normalized IS NULL OR btrim(p_other_city_name_normalized) = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Other city name is required'
    );
  END IF;

  IF p_approved_city_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Approved city ID is required'
    );
  END IF;

  -- ============================================================================
  -- STEP 2: AUTHENTICATE REQUESTING USER
  -- ============================================================================

  SELECT * INTO v_user_record
  FROM users
  WHERE id = p_requesting_user_id
    AND account_status = 'active';

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User not found or inactive'
    );
  END IF;

  -- ============================================================================
  -- STEP 3: AUTHORIZE USER
  -- ============================================================================

  IF v_user_record.account_type IN ('admin', 'both') THEN
    v_is_authorized := true;
  END IF;

  IF NOT v_is_authorized THEN
    SELECT EXISTS(
      SELECT 1 FROM user_roles
      WHERE user_id = p_requesting_user_id
        AND role IN ('super_admin', 'admin', 'editor')
    ) INTO v_is_authorized;
  END IF;

  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User does not have permission to assign custom cities'
    );
  END IF;

  -- ============================================================================
  -- STEP 4: NORMALIZE INPUTS
  -- ============================================================================

  v_state_normalized := lower(btrim(regexp_replace(p_state_name, '\s+', ' ', 'g')));
  v_district_normalized := lower(btrim(regexp_replace(p_district_name, '\s+', ' ', 'g')));
  v_other_city_normalized := lower(btrim(regexp_replace(p_other_city_name_normalized, '\s+', ' ', 'g')));

  -- ============================================================================
  -- STEP 5: RESOLVE DISTRICT/STATE
  -- ============================================================================

  SELECT d.id, d.state_id INTO v_district_id, v_state_id
  FROM districts_master d
  JOIN states_master s ON s.id = d.state_id
  WHERE lower(d.district_name) = v_district_normalized
    AND lower(s.state_name) = v_state_normalized
  LIMIT 1;

  IF v_district_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'District/state not found'
    );
  END IF;

  -- ============================================================================
  -- STEP 6: RESOLVE APPROVED CITY
  -- ============================================================================

  SELECT city_name, district_id, state_id
    INTO v_city_name, v_city_district_id, v_city_state_id
  FROM public.cities_master
  WHERE id = p_approved_city_id
    AND status = 'approved';

  IF v_city_name IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Approved city not found'
    );
  END IF;

  IF v_city_district_id IS DISTINCT FROM v_district_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Approved city does not belong to district'
    );
  END IF;

  IF v_city_state_id IS NOT NULL AND v_state_id IS NOT NULL AND v_city_state_id IS DISTINCT FROM v_state_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Approved city does not belong to state'
    );
  END IF;

  -- ============================================================================
  -- STEP 7: UPDATE MEMBER REGISTRATIONS
  -- ============================================================================

  UPDATE member_registrations
  SET
    city = v_city_name,
    is_custom_city = false,
    other_city_name = NULL
  WHERE is_custom_city = true
    AND other_city_name IS NOT NULL
    AND lower(btrim(regexp_replace(other_city_name, '\s+', ' ', 'g'))) = v_other_city_normalized
    AND lower(btrim(regexp_replace(district, '\s+', ' ', 'g'))) = v_district_normalized
    AND lower(btrim(regexp_replace(state, '\s+', ' ', 'g'))) = v_state_normalized;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'updated_count', v_updated_count,
    'assigned_city_name', v_city_name
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error in admin_assign_custom_city: % %', SQLERRM, SQLSTATE;
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Database error: ' || SQLERRM
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_assign_custom_city(uuid, text, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_assign_custom_city(uuid, text, text, text, uuid) TO anon;
