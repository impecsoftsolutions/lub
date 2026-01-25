/*
  Fix admin_list_custom_city_pending nested aggregates
  - Uses 2-stage aggregation to avoid nested aggregate errors.
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
  ),
  resolved AS (
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
  ),
  grouped AS (
    SELECT
      other_city_name_normalized,
      district_normalized,
      state_normalized,
      district_id,
      state_id,
      MIN(btrim(other_city_name)) AS other_city_name_display,
      MIN(btrim(state)) AS state_name,
      MIN(btrim(district)) AS district_name,
      COUNT(*) AS registrations_count,
      MAX(created_at) AS latest_created_at
    FROM resolved
    GROUP BY
      other_city_name_normalized,
      district_normalized,
      state_normalized,
      district_id,
      state_id
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'key',
          grouped.other_city_name_normalized || '|' ||
          COALESCE(grouped.district_id::text, 'null') || '|' ||
          COALESCE(grouped.state_id::text, 'null'),
        'other_city_name_normalized', grouped.other_city_name_normalized,
        'other_city_name_display', grouped.other_city_name_display,
        'state_name', grouped.state_name,
        'district_name', grouped.district_name,
        'state_id', grouped.state_id,
        'district_id', grouped.district_id,
        'registrations_count', grouped.registrations_count,
        'latest_created_at', grouped.latest_created_at
      )
      ORDER BY grouped.latest_created_at DESC
    ),
    '[]'::jsonb
  ) INTO v_items
  FROM grouped;

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
