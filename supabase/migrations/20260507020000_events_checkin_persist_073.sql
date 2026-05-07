/*
  # COD-EVENTS-CHECKIN-PERSIST-073

  - Ensure check-in persistence uses source='admin' for admin web actions.
  - Expose check-in fields in get_event_rsvps_with_session roster output.
  - Add uncheck_in_event_badge_with_session RPC to reverse attendance marks.
*/

-- ---------------------------------------------------------------------------
-- Patch check-in source for admin check-ins.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.check_in_event_badge_with_session(
  p_session_token text,
  p_badge_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_badge public.event_badges%ROWTYPE;
  v_rsvp public.event_rsvps%ROWTYPE;
  v_badge_code text := upper(btrim(COALESCE(p_badge_code, '')));
  v_now timestamptz := now();
BEGIN
  v_actor_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'invalid_session',
      'error', 'Invalid session'
    );
  END IF;

  IF NOT public.has_permission(v_actor_id, 'events.rsvp.manage') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'permission_denied',
      'error', 'Not authorized'
    );
  END IF;

  IF v_badge_code = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'invalid_badge_code',
      'error', 'Badge code is required'
    );
  END IF;

  SELECT *
  INTO v_badge
  FROM public.event_badges
  WHERE upper(badge_code) = v_badge_code
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'badge_not_found',
      'error', 'Badge not found'
    );
  END IF;

  SELECT *
  INTO v_rsvp
  FROM public.event_rsvps
  WHERE id = v_badge.rsvp_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'registration_not_found',
      'error', 'Registration not found'
    );
  END IF;

  IF v_rsvp.checked_in_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_checked_in', true,
      'checked_in_at', v_rsvp.checked_in_at
    );
  END IF;

  UPDATE public.event_rsvps
  SET checked_in_at = v_now,
      checked_in_by = v_actor_id,
      check_in_source = 'admin'
  WHERE id = v_rsvp.id;

  RETURN jsonb_build_object(
    'success', true,
    'already_checked_in', false,
    'checked_in_at', v_now
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_in_event_badge_with_session(text, text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Extend roster payload with check-in fields.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_event_rsvps_with_session(
  p_session_token text,
  p_event_id uuid,
  p_status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
  v_rows jsonb;
  v_summary jsonb;
BEGIN
  v_actor := public.resolve_custom_session_user_id(p_session_token);
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;
  IF NOT (public.has_permission(v_actor, 'events.rsvp.view') OR public.has_permission(v_actor, 'events.rsvp.manage')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT id, event_id, full_name, surname, given_name,
           email, phone, company,
           gender, meal_preference, profession, designation,
           aadhaar_number,
           visit_date, visit_all_days,
           checked_in_at, checked_in_by, check_in_source,
           notes, status, created_at, updated_at
    FROM public.event_rsvps
    WHERE event_id = p_event_id
      AND (p_status IS NULL OR status = p_status)
    ORDER BY created_at DESC
  ) t;

  SELECT jsonb_build_object(
    'total', COUNT(*),
    'confirmed', COUNT(*) FILTER (WHERE status='confirmed'),
    'cancelled', COUNT(*) FILTER (WHERE status='cancelled'),
    'pending',   COUNT(*) FILTER (WHERE status='pending'),
    'waitlisted',COUNT(*) FILTER (WHERE status='waitlisted')
  ) INTO v_summary
  FROM public.event_rsvps
  WHERE event_id = p_event_id;

  RETURN jsonb_build_object('success', true, 'data', v_rows, 'summary', v_summary);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_event_rsvps_with_session(text, uuid, text) TO authenticated, anon;

-- ---------------------------------------------------------------------------
-- Reverse check-in RPC (idempotent).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.uncheck_in_event_badge_with_session(
  p_session_token text,
  p_badge_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_badge public.event_badges%ROWTYPE;
  v_rsvp public.event_rsvps%ROWTYPE;
  v_badge_code text := upper(btrim(COALESCE(p_badge_code, '')));
BEGIN
  v_actor_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_session', 'error', 'Invalid session');
  END IF;

  IF NOT public.has_permission(v_actor_id, 'events.rsvp.manage') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'permission_denied', 'error', 'Not authorized');
  END IF;

  IF v_badge_code = '' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_badge_code', 'error', 'Badge code is required');
  END IF;

  SELECT *
  INTO v_badge
  FROM public.event_badges
  WHERE upper(badge_code) = v_badge_code
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'badge_not_found', 'error', 'Badge not found');
  END IF;

  SELECT *
  INTO v_rsvp
  FROM public.event_rsvps
  WHERE id = v_badge.rsvp_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'registration_not_found', 'error', 'Registration not found');
  END IF;

  IF v_rsvp.checked_in_at IS NULL THEN
    RETURN jsonb_build_object('success', true, 'already_cleared', true);
  END IF;

  UPDATE public.event_rsvps
  SET checked_in_at = NULL,
      checked_in_by = NULL,
      check_in_source = NULL
  WHERE id = v_rsvp.id;

  RETURN jsonb_build_object('success', true, 'already_cleared', false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.uncheck_in_event_badge_with_session(text, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
