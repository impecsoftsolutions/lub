/*
  # COD-EVENTS-VISITOR-DELETE-050 + COD-EVENTS-BADGE-TEMPLATE-PREVIEW-051

  050) Server-controlled delete of an event visitor registration (RSVP)
       with cascade through event_badges + event_badge_deliveries (FKs
       already declared with ON DELETE CASCADE in 048).
       New RPC: delete_event_rsvp_with_session(p_session_token, p_rsvp_id)
       gated by events.rsvp.manage.

  051) Per-event badge template selection. Stored in
       events.ai_metadata->>'badge_template_key' to avoid touching the
       create/update event RPCs (same JSONB convention used in 042 for
       rsvp_require_* flags). Edge function falls back to
       'classic_corporate' when missing or unrecognized.

  No new tables. No DDL on existing tables. Additive RPC only.
*/

CREATE OR REPLACE FUNCTION public.delete_event_rsvp_with_session(
  p_session_token text,
  p_rsvp_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
  v_rsvp public.event_rsvps%ROWTYPE;
BEGIN
  v_actor := public.resolve_custom_session_user_id(p_session_token);
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_session', 'error', 'Invalid session');
  END IF;
  IF NOT public.has_permission(v_actor, 'events.rsvp.manage') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'permission_denied', 'error', 'Not authorized');
  END IF;

  SELECT * INTO v_rsvp FROM public.event_rsvps WHERE id = p_rsvp_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'not_found', 'error', 'Registration not found');
  END IF;

  -- ON DELETE CASCADE already wired:
  --   event_badges.rsvp_id            → event_rsvps.id
  --   event_badge_deliveries.badge_id → event_badges.id
  -- so a single DELETE removes the visitor + their badge + delivery rows
  -- in one transactional sweep.
  DELETE FROM public.event_rsvps WHERE id = p_rsvp_id;

  RETURN jsonb_build_object(
    'success', true,
    'rsvp_id', p_rsvp_id,
    'event_id', v_rsvp.event_id
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error_code', 'unexpected_error', 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_event_rsvp_with_session(text, uuid)
  TO authenticated, anon;

COMMENT ON FUNCTION public.delete_event_rsvp_with_session(text, uuid) IS
  '050: Admin-only (events.rsvp.manage) hard-delete of an event visitor row. Cascades through event_badges + event_badge_deliveries via existing FK ON DELETE CASCADE.';
