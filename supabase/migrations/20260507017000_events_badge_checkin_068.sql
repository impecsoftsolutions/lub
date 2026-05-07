/*
  # COD-EVENTS-REGISTRATION-BADGE-EXPORT-AADHAAR-068

  Badge check-in / attendance support for event registrations.

  - Adds check-in columns to event_rsvps.
  - Adds lookup_event_badge_for_checkin_with_session.
  - Adds check_in_event_badge_with_session.

  Security:
  - Uses the existing custom-session resolver.
  - Uses public.has_permission(...) server-side.
  - Browser callers pass only p_session_token and badge code.
*/

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

ALTER TABLE public.event_rsvps
  ADD COLUMN IF NOT EXISTS checked_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS checked_in_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS check_in_source text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'event_rsvps_check_in_source_check'
      AND conrelid = 'public.event_rsvps'::regclass
  ) THEN
    ALTER TABLE public.event_rsvps
      ADD CONSTRAINT event_rsvps_check_in_source_check
      CHECK (check_in_source IS NULL OR check_in_source IN ('qr_scan', 'manual', 'admin'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS event_rsvps_checked_in_at_idx
  ON public.event_rsvps(event_id, checked_in_at)
  WHERE checked_in_at IS NOT NULL;

COMMENT ON COLUMN public.event_rsvps.checked_in_at IS
  'Timestamp when this event registration was checked in / marked attended.';
COMMENT ON COLUMN public.event_rsvps.checked_in_by IS
  'Custom auth user who checked in this event registration.';
COMMENT ON COLUMN public.event_rsvps.check_in_source IS
  'Source of check-in action: qr_scan, manual, or admin.';

-- ---------------------------------------------------------------------------
-- Lookup RPC: view registration/badge details for check-in staff.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.lookup_event_badge_for_checkin_with_session(
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
  v_event public.events%ROWTYPE;
  v_badge_code text := upper(btrim(COALESCE(p_badge_code, '')));
BEGIN
  v_actor_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'invalid_session',
      'error', 'Invalid session'
    );
  END IF;

  IF NOT (
    public.has_permission(v_actor_id, 'events.rsvp.view')
    OR public.has_permission(v_actor_id, 'events.rsvp.manage')
  ) THEN
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

  SELECT *
  INTO v_event
  FROM public.events
  WHERE id = v_rsvp.event_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'event_not_found',
      'error', 'Event not found'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'badge_code', v_badge.badge_code,
      'full_name', v_rsvp.full_name,
      'surname', v_rsvp.surname,
      'given_name', v_rsvp.given_name,
      'email', v_rsvp.email,
      'phone', v_rsvp.phone,
      'company', v_rsvp.company,
      'event_title', v_event.title,
      'event_id', v_event.id,
      'rsvp_id', v_rsvp.id,
      'rsvp_status', v_rsvp.status,
      'visit_date', v_rsvp.visit_date,
      'visit_all_days', COALESCE(v_rsvp.visit_all_days, false),
      'issued_at', v_badge.issued_at,
      'checked_in_at', v_rsvp.checked_in_at,
      'checked_in_by', v_rsvp.checked_in_by
    )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Check-in RPC: idempotently mark attendance.
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
      check_in_source = 'manual'
  WHERE id = v_rsvp.id;

  RETURN jsonb_build_object(
    'success', true,
    'already_checked_in', false,
    'checked_in_at', v_now
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_event_badge_for_checkin_with_session(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_in_event_badge_with_session(text, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
