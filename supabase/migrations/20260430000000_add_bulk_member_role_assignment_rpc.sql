/*
  # Bulk Member LUB Role Assignment RPC

  1. Purpose
    - Allow admins to assign one role/scope/year/period to many members in a single request
    - Partial success: good rows commit, bad rows return structured skip reasons
    - Server-side cap: max 50 members per batch
    - Each successful assignment creates an audit row via existing admin_assign_member_lub_role logic
    - Session-token wrapper follows the same pattern as all other designation RPCs

  2. New Functions
    - public.admin_assign_member_lub_roles_bulk(...)  — base function, called by session wrapper
    - public.admin_assign_member_lub_roles_bulk_with_session(...)  — session-token secured entry point

  3. Partial-success strategy
    - Delegates each row to public.admin_assign_member_lub_role(), which has its own EXCEPTION handler
    - That inner function catches exceptions and returns {success: false, error: '...'} instead of raising
    - So a failure on row N does NOT abort the outer transaction; rows 1..N-1 remain committed
    - No explicit SAVEPOINTs needed because the inner function's EXCEPTION block handles rollback of
      its own partial work (INSERT + audit) atomically

  4. No schema changes
    - Reuses existing member_lub_role_assignments table and member_audit_history table
    - Reuses existing unique/partial indexes on member_lub_role_assignments
    - No new constraints required
*/

-- ============================================================
-- Base bulk function (accepts requesting_user_id, not session)
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_assign_member_lub_roles_bulk(
  p_requesting_user_id uuid,
  p_member_ids          uuid[],
  p_role_id             uuid,
  p_level               text,
  p_state               text    DEFAULT NULL,
  p_district            text    DEFAULT NULL,
  p_role_start_date     date    DEFAULT NULL,
  p_role_end_date       date    DEFAULT NULL,
  p_committee_year      text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_member_id   uuid;
  v_unique_ids  uuid[];
  v_added       uuid[]   := '{}';
  v_skipped     jsonb[]  := '{}';
  v_row_result  jsonb;
  v_reason      text;
  v_reason_code text;
BEGIN
  -- -------- 1. Validate request-level params ----------

  IF p_requesting_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'global_error_code', 'invalid_request',
      'global_error', 'Requesting user ID is required'
    );
  END IF;

  IF p_role_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'global_error_code', 'invalid_request',
      'global_error', 'Role ID is required'
    );
  END IF;

  IF p_level IS NULL OR p_level NOT IN ('national', 'state', 'district', 'city') THEN
    RETURN jsonb_build_object(
      'success', false,
      'global_error_code', 'invalid_request',
      'global_error', 'Level must be one of national/state/district/city'
    );
  END IF;

  IF p_member_ids IS NULL OR array_length(p_member_ids, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'global_error_code', 'invalid_request',
      'global_error', 'At least one member ID is required'
    );
  END IF;

  IF p_committee_year IS NOT NULL AND p_committee_year !~ '^[0-9]{4}$' THEN
    RETURN jsonb_build_object(
      'success', false,
      'global_error_code', 'committee_year_invalid',
      'global_error', 'Committee year must be a 4-digit year (e.g., 2025)'
    );
  END IF;

  IF p_role_start_date IS NOT NULL AND p_role_end_date IS NOT NULL THEN
    IF p_role_end_date < p_role_start_date THEN
      RETURN jsonb_build_object(
        'success', false,
        'global_error_code', 'period_invalid',
        'global_error', 'role_end_date cannot be before role_start_date'
      );
    END IF;
  END IF;

  -- -------- 2. Deduplicate member IDs ----------
  SELECT array_agg(DISTINCT mid ORDER BY mid)
  INTO v_unique_ids
  FROM unnest(p_member_ids) AS mid;

  -- -------- 3. Enforce server-side batch cap ----------
  IF array_length(v_unique_ids, 1) > 50 THEN
    RETURN jsonb_build_object(
      'success', false,
      'global_error_code', 'batch_too_large',
      'global_error', 'Batch size cannot exceed 50 members (received ' || array_length(v_unique_ids, 1) || ')'
    );
  END IF;

  -- -------- 4. Process each member ----------
  FOREACH v_member_id IN ARRAY v_unique_ids LOOP

    -- Delegate to the single-row function.  It has its own EXCEPTION handler so it
    -- never raises; it returns {success: false, error: '...'} on any failure, which
    -- means a failing row does NOT abort the outer transaction.
    v_row_result := public.admin_assign_member_lub_role(
      p_requesting_user_id,
      v_member_id,
      p_role_id,
      p_level,
      p_state,
      p_district,
      p_role_start_date,
      p_role_end_date,
      p_committee_year
    );

    IF (v_row_result ->> 'success')::boolean THEN
      v_added := array_append(v_added, v_member_id);
    ELSE
      -- Map error message to stable reason codes
      v_reason := COALESCE(v_row_result ->> 'error', 'Unknown error');

      v_reason_code := CASE
        WHEN v_reason ILIKE '%identical role assignment already exists%'
          OR v_reason ILIKE '%duplicate%'
          OR v_reason ILIKE '%unique%'          THEN 'already_has_assignment'
        WHEN v_reason ILIKE '%not found or not active%'
          OR v_reason ILIKE '%not eligible%'    THEN 'member_not_eligible'
        WHEN v_reason ILIKE '%role not found or inactive%' THEN 'role_inactive'
        WHEN v_reason ILIKE '%state is required%'
          OR v_reason ILIKE '%scope%required%'  THEN 'scope_required'
        WHEN v_reason ILIKE '%district is required%'      THEN 'scope_required'
        WHEN v_reason ILIKE '%end_date%before%'
          OR v_reason ILIKE '%cannot be before%'          THEN 'period_invalid'
        WHEN v_reason ILIKE '%committee year%'             THEN 'committee_year_invalid'
        WHEN v_reason ILIKE '%authorization%'
          OR v_reason ILIKE '%insufficient permission%'
          OR v_reason ILIKE '%not authorized%'            THEN 'permission_denied'
        ELSE 'unexpected_error'
      END;

      v_skipped := array_append(v_skipped, jsonb_build_object(
        'member_id',   v_member_id,
        'reason_code', v_reason_code,
        'reason',      v_reason
      ));
    END IF;

  END LOOP;

  -- -------- 5. Return batch result ----------
  RETURN jsonb_build_object(
    'success',          true,
    'added_count',      COALESCE(array_length(v_added,   1), 0),
    'skipped_count',    COALESCE(array_length(v_skipped, 1), 0),
    'added_member_ids', to_jsonb(v_added),
    'skipped',          to_jsonb(v_skipped)
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'admin_assign_member_lub_roles_bulk error: % %', SQLERRM, SQLSTATE;
    RETURN jsonb_build_object(
      'success', false,
      'global_error_code', 'unexpected_error',
      'global_error', SQLERRM
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_assign_member_lub_roles_bulk(uuid, uuid[], uuid, text, text, text, date, date, text) TO authenticated, anon;

COMMENT ON FUNCTION public.admin_assign_member_lub_roles_bulk(uuid, uuid[], uuid, text, text, text, date, date, text) IS
  'Bulk SECURITY DEFINER function to assign one LUB role to many members in a single batch. '
  'Partial success supported: per-row failures are captured as skip entries without aborting the batch. '
  'Max 50 members per call. Each successful row creates an audit record via admin_assign_member_lub_role.';


-- ============================================================
-- Session-token wrapper (mirrors pattern from 20260312121000)
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_assign_member_lub_roles_bulk_with_session(
  p_session_token   text,
  p_member_ids      uuid[],
  p_role_id         uuid,
  p_level           text,
  p_state           text  DEFAULT NULL,
  p_district        text  DEFAULT NULL,
  p_role_start_date date  DEFAULT NULL,
  p_role_end_date   date  DEFAULT NULL,
  p_committee_year  text  DEFAULT NULL
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
    RETURN jsonb_build_object(
      'success', false,
      'global_error_code', 'invalid_session',
      'global_error', 'Invalid session'
    );
  END IF;

  IF NOT public.has_permission(v_actor_user_id, 'organization.designations.manage') THEN
    RETURN jsonb_build_object(
      'success', false,
      'global_error_code', 'permission_denied',
      'global_error', 'not authorized'
    );
  END IF;

  RETURN public.admin_assign_member_lub_roles_bulk(
    v_actor_user_id,
    p_member_ids,
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

GRANT EXECUTE ON FUNCTION public.admin_assign_member_lub_roles_bulk_with_session(text, uuid[], uuid, text, text, text, date, date, text) TO PUBLIC;

COMMENT ON FUNCTION public.admin_assign_member_lub_roles_bulk_with_session(text, uuid[], uuid, text, text, text, date, date, text) IS
  'Session-token secured wrapper for admin_assign_member_lub_roles_bulk. '
  'Derives actor from custom session token and enforces organization.designations.manage permission '
  'before delegating to the base bulk function.';
