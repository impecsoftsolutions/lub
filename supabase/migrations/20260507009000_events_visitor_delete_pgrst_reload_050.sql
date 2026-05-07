/*
  # COD-EVENTS-VISITOR-DELETE-050 — runtime hotfix

  Production observed PostgREST PGRST202 ("Could not find the function
  public.delete_event_rsvp_with_session") on the live admin Delete flow,
  even though `supabase db push --linked` for the 20260507008000 migration
  reported success. Two defenses:

    1) Re-CREATE OR REPLACE the function so this migration is the
       authoritative source if the original DDL is missing or stale.
    2) NOTIFY pgrst 'reload schema' so PostgREST refreshes its function
       cache on apply (the `pgrst` channel is the standard refresh
       trigger used by Supabase).

  Both are idempotent and safe to re-run.
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

  -- ON DELETE CASCADE on event_badges.rsvp_id and event_badge_deliveries.badge_id
  -- removes the badge + delivery rows in the same transaction.
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

-- Force PostgREST to reload its schema cache so the RPC becomes
-- callable from the JS client without redeploying anything else.
NOTIFY pgrst, 'reload schema';
