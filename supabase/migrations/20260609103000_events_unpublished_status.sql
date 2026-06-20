/*
  COD-EVENTS-UNPUBLISH-001

  Add a distinct unpublished event status for postponed events.

  - draft: not ready yet
  - published: visible publicly
  - unpublished: was published before, temporarily hidden from public pages
  - archived: completed/retired event
*/

DO $$
DECLARE
  v_constraint record;
BEGIN
  FOR v_constraint IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.events'::regclass
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%status%'
      AND pg_get_constraintdef(c.oid) ILIKE '%published%'
      AND pg_get_constraintdef(c.oid) ILIKE '%archived%'
  LOOP
    EXECUTE format('ALTER TABLE public.events DROP CONSTRAINT %I', v_constraint.conname);
  END LOOP;
END;
$$;

ALTER TABLE public.events
  ADD CONSTRAINT events_status_check
  CHECK (status IN ('draft', 'published', 'unpublished', 'archived'));

CREATE OR REPLACE FUNCTION public.unpublish_event_with_session(
  p_session_token text,
  p_event_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
BEGIN
  v_actor_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT public.has_permission(v_actor_id, 'events.publish') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  UPDATE public.events
  SET status = 'unpublished',
      updated_at = now()
  WHERE id = p_event_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Event not found');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.unpublish_event_with_session(text, uuid) TO authenticated, anon;

NOTIFY pgrst, 'reload schema';
