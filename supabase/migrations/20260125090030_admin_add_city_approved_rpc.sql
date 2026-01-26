/*
  Create admin_add_city_approved RPC
  - Inserts approved city into cities_master with admin authorization.
*/

CREATE OR REPLACE FUNCTION public.admin_add_city_approved(
  p_requesting_user_id uuid,
  p_city_name text,
  p_state_id uuid,
  p_district_id uuid,
  p_notes text DEFAULT NULL,
  p_is_popular boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_record RECORD;
  v_is_authorized boolean := false;
  v_city_id uuid;
  v_city_name text;
  v_existing_count integer := 0;
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

  IF p_city_name IS NULL OR btrim(p_city_name) = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'City name is required'
    );
  END IF;

  IF p_state_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'State ID is required'
    );
  END IF;

  IF p_district_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'District ID is required'
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
        AND role IN ('super_admin', 'admin')
    ) INTO v_is_authorized;
  END IF;

  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User does not have permission to add cities'
    );
  END IF;

  -- ============================================================================
  -- STEP 4: CHECK FOR DUPLICATE APPROVED CITY
  -- ============================================================================

  v_city_name := btrim(p_city_name);

  SELECT COUNT(*) INTO v_existing_count
  FROM public.cities_master
  WHERE district_id = p_district_id
    AND status = 'approved'
    AND lower(city_name) = lower(v_city_name);

  IF v_existing_count > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'City already exists in this district'
    );
  END IF;

  -- ============================================================================
  -- STEP 5: INSERT APPROVED CITY
  -- ============================================================================

  INSERT INTO public.cities_master (
    city_name,
    district_id,
    state_id,
    status,
    submission_source,
    notes
  ) VALUES (
    v_city_name,
    p_district_id,
    p_state_id,
    'approved',
    'admin_entry',
    p_notes
  )
  RETURNING id, city_name INTO v_city_id, v_city_name;

  RETURN jsonb_build_object(
    'success', true,
    'city_id', v_city_id,
    'city_name', v_city_name
  );

EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'City already exists in this district'
    );
  WHEN OTHERS THEN
    RAISE WARNING 'Error in admin_add_city_approved: % %', SQLERRM, SQLSTATE;
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Database error: ' || SQLERRM
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_add_city_approved(uuid, text, uuid, uuid, text, boolean) TO authenticated;
