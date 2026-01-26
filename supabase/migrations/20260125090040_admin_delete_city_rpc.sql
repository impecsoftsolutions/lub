/*
  Create admin_delete_city RPC
  - Deletes city from cities_master with admin authorization.
*/

CREATE OR REPLACE FUNCTION public.admin_delete_city(
  p_requesting_user_id uuid,
  p_city_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_record RECORD;
  v_is_authorized boolean := false;
  v_deleted_count integer := 0;
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

  IF p_city_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'City ID is required'
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
      'error', 'not authorized'
    );
  END IF;

  -- ============================================================================
  -- STEP 4: DELETE CITY
  -- ============================================================================

  DELETE FROM public.cities_master
  WHERE id = p_city_id;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  IF v_deleted_count = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'city not found'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error in admin_delete_city: % %', SQLERRM, SQLSTATE;
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Database error: ' || SQLERRM
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_city(uuid, uuid) TO authenticated;
