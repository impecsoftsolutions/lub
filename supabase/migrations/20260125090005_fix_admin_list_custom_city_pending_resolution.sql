/*
  Fix admin_list_custom_city_pending resolution to require state match
  - Ensures district_id/state_id are set only when state join succeeds.
*/

CREATE OR REPLACE FUNCTION public.admin_list_custom_city_pending(
  p_requesting_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_record RECORD;
  v_is_authorized boolean := false;
  v_items jsonb := '[]'::jsonb;
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
      'error', 'User does not have permission to view pending cities'
    );
  END IF;

  -- ============================================================================
  -- STEP 4: BUILD PENDING LIST
  -- ============================================================================

  WITH normalized AS (
    SELECT
      mr.other_city_name,
      mr.state,
      mr.district,
      mr.created_at,
      lower(btrim(regexp_replace(mr.other_city_name, '\s+', ' ', 'g'))) AS other_city_name_normalized,
      lower(btrim(regexp_replace(mr.district, '\s+', ' ', 'g'))) AS district_normalized,
      lower(btrim(regexp_replace(mr.state, '\s+', ' ', 'g'))) AS state_normalized
    FROM member_registrations mr
    WHERE mr.is_custom_city = true
      AND mr.other_city_name IS NOT NULL
      AND btrim(mr.other_city_name) <> ''
  ), resolved AS (
    SELECT
      n.*,
      CASE WHEN s.id IS NOT NULL THEN d.id ELSE NULL END AS district_id,
      CASE WHEN s.id IS NOT NULL THEN d.state_id ELSE NULL END AS state_id
    FROM normalized n
    LEFT JOIN districts_master d
      ON lower(d.district_name) = n.district_normalized
    LEFT JOIN states_master s
      ON s.id = d.state_id
      AND lower(s.state_name) = n.state_normalized
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'key',
        resolved.other_city_name_normalized || '|' ||
        COALESCE(resolved.district_id::text, 'null') || '|' ||
        COALESCE(resolved.state_id::text, 'null'),
      'other_city_name_normalized', resolved.other_city_name_normalized,
      'other_city_name_display', MIN(btrim(resolved.other_city_name)),
      'state_name', MIN(btrim(resolved.state)),
      'district_name', MIN(btrim(resolved.district)),
      'state_id', resolved.state_id,
      'district_id', resolved.district_id,
      'registrations_count', COUNT(*),
      'latest_created_at', MAX(resolved.created_at)
    )
  ), '[]'::jsonb) INTO v_items
  FROM resolved
  GROUP BY
    resolved.other_city_name_normalized,
    resolved.district_normalized,
    resolved.state_normalized,
    resolved.district_id,
    resolved.state_id;

  RETURN jsonb_build_object(
    'success', true,
    'items', v_items
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error in admin_list_custom_city_pending: % %', SQLERRM, SQLSTATE;
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Database error: ' || SQLERRM
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_custom_city_pending(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_custom_city_pending(uuid) TO anon;
