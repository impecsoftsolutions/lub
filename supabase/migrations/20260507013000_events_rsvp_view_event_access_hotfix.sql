/*
  COD-EVENTS-RSVP-VIEW-EVENT-ACCESS-HOTFIX-057

  Problem:
  - Permissioned non-admin users with events.rsvp.view / events.rsvp.manage
    could enter the Events area but received empty/no-usable data because
    get_all_events_with_session and get_event_by_id_with_session only allowed
    events.view.
  - Registrations workflow depends on both list and event-detail reads.

  Fix:
  - Broaden read authorization for the two admin read RPCs to:
      events.view OR events.rsvp.view OR events.rsvp.manage
  - Keep payload shape unchanged.
  - Trigger PostgREST schema reload.
*/

-- =============================================================================
-- SECTION 1: get_all_events_with_session - allow RSVP viewers/managers
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_all_events_with_session(
  p_session_token text,
  p_status text DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_rows jsonb;
  v_total integer;
BEGIN
  v_actor_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT (
    public.has_permission(v_actor_id, 'events.view')
    OR public.has_permission(v_actor_id, 'events.rsvp.view')
    OR public.has_permission(v_actor_id, 'events.rsvp.manage')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  SELECT COUNT(*)::integer
  INTO v_total
  FROM public.events e
  WHERE (p_status IS NULL OR e.status = p_status);

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      e.id,
      e.slug,
      e.title,
      e.excerpt,
      e.event_type,
      e.visibility,
      e.status,
      e.is_featured,
      e.start_at,
      e.end_at,
      e.location,
      e.published_at,
      e.created_at,
      e.updated_at,
      e.show_agenda_publicly,
      e.slug_locked,
      (
        SELECT COALESCE(m.full_name, u.email)
        FROM public.users u
        LEFT JOIN public.member_registrations m ON m.user_id = u.id
        WHERE u.id = e.created_by
        ORDER BY m.created_at DESC NULLS LAST
        LIMIT 1
      ) AS created_by_name
    FROM public.events e
    WHERE (p_status IS NULL OR e.status = p_status)
    ORDER BY e.updated_at DESC
    LIMIT GREATEST(p_limit, 0)
    OFFSET GREATEST(p_offset, 0)
  ) t;

  RETURN jsonb_build_object(
    'success', true,
    'data', v_rows,
    'total', v_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_all_events_with_session(text, text, integer, integer)
  TO authenticated, anon;

-- =============================================================================
-- SECTION 2: get_event_by_id_with_session - allow RSVP viewers/managers
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_event_by_id_with_session(
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
  v_event public.events%ROWTYPE;
  v_used integer := 0;
  v_bridged_activity uuid;
  v_assets jsonb;
BEGIN
  v_actor_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT (
    public.has_permission(v_actor_id, 'events.view')
    OR public.has_permission(v_actor_id, 'events.rsvp.view')
    OR public.has_permission(v_actor_id, 'events.rsvp.manage')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  SELECT * INTO v_event FROM public.events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Event not found');
  END IF;

  SELECT COUNT(*)::integer INTO v_used
  FROM public.event_rsvps r
  WHERE r.event_id = v_event.id AND r.status = 'confirmed';

  SELECT a.id INTO v_bridged_activity
  FROM public.activities a
  WHERE a.source_event_id = v_event.id AND a.status <> 'archived'
  LIMIT 1;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.kind, t.display_order, t.created_at), '[]'::jsonb)
  INTO v_assets
  FROM (
    SELECT id, kind, storage_path, public_url, label, byte_size, mime_type, display_order, created_at
    FROM public.event_assets
    WHERE event_id = v_event.id
  ) t;

  RETURN jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'id', v_event.id,
      'slug', v_event.slug,
      'title', v_event.title,
      'excerpt', v_event.excerpt,
      'description', v_event.description,
      'event_type', v_event.event_type,
      'visibility', v_event.visibility,
      'status', v_event.status,
      'is_featured', v_event.is_featured,
      'start_at', v_event.start_at,
      'end_at', v_event.end_at,
      'location', v_event.location,
      'venue_map_url', v_event.venue_map_url,
      'whatsapp_invitation_message', v_event.whatsapp_invitation_message,
      'invitation_text', v_event.invitation_text,
      'agenda_items', COALESCE(v_event.agenda_items, '[]'::jsonb),
      'show_agenda_publicly', v_event.show_agenda_publicly,
      'slug_locked', v_event.slug_locked,
      'ai_metadata', v_event.ai_metadata,
      'banner_image_url', v_event.banner_image_url,
      'banner_object_key', v_event.banner_object_key,
      'assets', v_assets,
      'rsvp', jsonb_build_object(
        'enabled', v_event.rsvp_enabled,
        'capacity', v_event.rsvp_capacity,
        'capacity_mode', v_event.capacity_mode,
        'per_day_capacity', v_event.per_day_capacity,
        'deadline_at', v_event.rsvp_deadline_at,
        'collect_phone', v_event.rsvp_collect_phone,
        'collect_company', v_event.rsvp_collect_company,
        'collect_gender', v_event.rsvp_collect_gender,
        'collect_meal', v_event.rsvp_collect_meal,
        'collect_profession', v_event.rsvp_collect_profession,
        'require_login', v_event.rsvp_require_login,
        'used_count', v_used
      ),
      'bridge', jsonb_build_object(
        'activity_id', v_bridged_activity,
        'has_activity', v_bridged_activity IS NOT NULL
      ),
      'created_by', v_event.created_by,
      'published_by', v_event.published_by,
      'published_at', v_event.published_at,
      'created_at', v_event.created_at,
      'updated_at', v_event.updated_at
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_event_by_id_with_session(text, uuid)
  TO authenticated, anon;

-- =============================================================================
-- SECTION 3: PostgREST schema reload
-- =============================================================================

NOTIFY pgrst, 'reload schema';

