/*
  COD-EVENTS-EXCERPT-INVITE-VISIBILITY-078

  Add public visibility toggles for Event Excerpt and Invitation Text.
  Toggles are persisted in events.ai_metadata:
    - show_excerpt_publicly (default true)
    - show_invitation_text_publicly (default true)

  Public reads now honor these toggles:
    - get_published_events: excerpt hidden when disabled
    - get_event_by_slug: excerpt and invitation_text hidden when disabled
*/

CREATE OR REPLACE FUNCTION public.get_published_events(
  p_limit integer DEFAULT 12,
  p_offset integer DEFAULT 0,
  p_session_token text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_include_member_only boolean := false;
  v_rows jsonb;
  v_total integer;
BEGIN
  IF p_session_token IS NOT NULL AND length(trim(p_session_token)) > 0 THEN
    v_actor_id := public.resolve_custom_session_user_id(p_session_token);
    IF v_actor_id IS NOT NULL THEN
      v_include_member_only := public.is_member_or_both_account(v_actor_id);
    END IF;
  END IF;

  SELECT COUNT(*)::integer
  INTO v_total
  FROM public.events e
  WHERE e.status = 'published'
    AND (e.visibility = 'public' OR (v_include_member_only AND e.visibility = 'member_only'));

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      e.id,
      e.slug,
      e.title,
      CASE
        WHEN (
          CASE
            WHEN lower(COALESCE(e.ai_metadata->>'show_excerpt_publicly', '')) IN ('true', 'false')
              THEN (e.ai_metadata->>'show_excerpt_publicly')::boolean
            ELSE true
          END
        )
          THEN e.excerpt
        ELSE NULL
      END AS excerpt,
      e.description,
      e.event_type,
      e.visibility,
      e.start_at,
      e.end_at,
      e.location,
      e.is_featured,
      e.published_at,
      e.show_agenda_publicly,
      e.banner_image_url
    FROM public.events e
    WHERE e.status = 'published'
      AND (e.visibility = 'public' OR (v_include_member_only AND e.visibility = 'member_only'))
    ORDER BY e.is_featured DESC, e.start_at ASC NULLS LAST, e.published_at DESC
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

GRANT EXECUTE ON FUNCTION public.get_published_events(integer, integer, text)
  TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_event_by_slug(
  p_slug text,
  p_session_token text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_include_member_only boolean := false;
  v_event public.events%ROWTYPE;
  v_agenda_items jsonb;
  v_now timestamptz := now();
  v_deadline timestamptz;
  v_used_count integer := 0;
  v_remaining integer;
  v_open boolean := false;
  v_assets jsonb;
  v_per_day_usage jsonb := '{}'::jsonb;
  v_collect_email boolean;
  v_require_email boolean;
  v_require_phone boolean;
  v_require_company boolean;
  v_require_gender boolean;
  v_require_meal boolean;
  v_require_profession boolean;
  v_collect_note boolean;
  v_require_note boolean;
  v_require_designation boolean;
  v_profession_options jsonb;
  v_show_excerpt_publicly boolean := true;
  v_show_invitation_text_publicly boolean := true;
BEGIN
  IF p_session_token IS NOT NULL AND length(trim(p_session_token)) > 0 THEN
    v_actor_id := public.resolve_custom_session_user_id(p_session_token);
    IF v_actor_id IS NOT NULL THEN
      v_include_member_only := public.is_member_or_both_account(v_actor_id);
    END IF;
  END IF;

  SELECT * INTO v_event
  FROM public.events
  WHERE slug = p_slug
    AND status = 'published'
    AND (visibility = 'public' OR (v_include_member_only AND visibility = 'member_only'));

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Event not found');
  END IF;

  IF v_event.show_agenda_publicly = true THEN
    v_agenda_items := COALESCE(v_event.agenda_items, '[]'::jsonb);
  ELSE
    v_agenda_items := '[]'::jsonb;
  END IF;

  v_deadline := COALESCE(v_event.rsvp_deadline_at, v_event.start_at);
  IF v_event.rsvp_enabled THEN
    SELECT COUNT(*)::integer INTO v_used_count
    FROM public.event_rsvps r
    WHERE r.event_id = v_event.id AND r.status = 'confirmed';

    v_open := (v_deadline IS NULL OR v_deadline > v_now)
      AND (
        (v_event.capacity_mode = 'per_day')
        OR (v_event.rsvp_capacity IS NULL OR v_used_count < v_event.rsvp_capacity)
      );
    IF v_event.capacity_mode = 'global' AND v_event.rsvp_capacity IS NOT NULL THEN
      v_remaining := GREATEST(v_event.rsvp_capacity - v_used_count, 0);
    END IF;
  END IF;

  IF v_event.start_at IS NOT NULL THEN
    SELECT COALESCE(jsonb_object_agg(d.day::text, d.used_count), '{}'::jsonb)
    INTO v_per_day_usage
    FROM (
      SELECT
        gs::date AS day,
        (
          SELECT COUNT(*)::integer
          FROM public.event_rsvps r
          WHERE r.event_id = v_event.id
            AND r.status = 'confirmed'
            AND (r.visit_all_days = true OR r.visit_date = gs::date)
        ) AS used_count
      FROM generate_series(
        v_event.start_at::date,
        COALESCE(v_event.end_at, v_event.start_at)::date,
        interval '1 day'
      ) AS gs
    ) d;
  END IF;

  v_collect_email := COALESCE((v_event.ai_metadata->>'rsvp_collect_email')::boolean, true);
  v_require_email := v_collect_email AND COALESCE((v_event.ai_metadata->>'rsvp_require_email')::boolean, false);
  v_require_phone := COALESCE((v_event.ai_metadata->>'rsvp_require_phone')::boolean, v_event.rsvp_collect_phone);
  v_require_company := COALESCE((v_event.ai_metadata->>'rsvp_require_company')::boolean, v_event.rsvp_collect_company);
  v_require_gender := COALESCE((v_event.ai_metadata->>'rsvp_require_gender')::boolean, v_event.rsvp_collect_gender);
  v_require_meal := COALESCE((v_event.ai_metadata->>'rsvp_require_meal')::boolean, v_event.rsvp_collect_meal);
  v_require_profession := COALESCE((v_event.ai_metadata->>'rsvp_require_profession')::boolean, v_event.rsvp_collect_profession);
  v_collect_note := COALESCE((v_event.ai_metadata->>'rsvp_collect_note')::boolean, false);
  v_require_note := v_collect_note AND COALESCE((v_event.ai_metadata->>'rsvp_require_note')::boolean, false);
  v_require_designation := v_event.rsvp_collect_designation
    AND COALESCE((v_event.ai_metadata->>'rsvp_require_designation')::boolean, false);
  v_profession_options := public.event_rsvp_profession_options(v_event.ai_metadata);

  v_show_excerpt_publicly := CASE
    WHEN lower(COALESCE(v_event.ai_metadata->>'show_excerpt_publicly', '')) IN ('true', 'false')
      THEN (v_event.ai_metadata->>'show_excerpt_publicly')::boolean
    ELSE true
  END;
  v_show_invitation_text_publicly := CASE
    WHEN lower(COALESCE(v_event.ai_metadata->>'show_invitation_text_publicly', '')) IN ('true', 'false')
      THEN (v_event.ai_metadata->>'show_invitation_text_publicly')::boolean
    ELSE true
  END;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.kind, t.display_order, t.created_at), '[]'::jsonb)
  INTO v_assets
  FROM (
    SELECT id, kind, storage_path, public_url, label, byte_size, mime_type, display_order, created_at
    FROM public.event_assets
    WHERE event_id = v_event.id
      AND kind IN ('banner','flyer','gallery','document')
  ) t;

  RETURN jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'id', v_event.id,
      'slug', v_event.slug,
      'title', v_event.title,
      'excerpt', CASE WHEN v_show_excerpt_publicly THEN v_event.excerpt ELSE NULL END,
      'show_excerpt_publicly', v_show_excerpt_publicly,
      'description', v_event.description,
      'event_type', v_event.event_type,
      'visibility', v_event.visibility,
      'start_at', v_event.start_at,
      'end_at', v_event.end_at,
      'location', v_event.location,
      'venue_map_url', v_event.venue_map_url,
      'whatsapp_invitation_message', v_event.whatsapp_invitation_message,
      'invitation_text', CASE WHEN v_show_invitation_text_publicly THEN v_event.invitation_text ELSE NULL END,
      'show_invitation_text_publicly', v_show_invitation_text_publicly,
      'agenda_items', v_agenda_items,
      'show_agenda_publicly', v_event.show_agenda_publicly,
      'is_featured', v_event.is_featured,
      'published_at', v_event.published_at,
      'banner_image_url', v_event.banner_image_url,
      'assets', v_assets,
      'rsvp', jsonb_build_object(
        'enabled', v_event.rsvp_enabled,
        'open', v_open,
        'deadline_at', v_deadline,
        'capacity', v_event.rsvp_capacity,
        'capacity_mode', v_event.capacity_mode,
        'per_day_capacity', v_event.per_day_capacity,
        'used_count', v_used_count,
        'remaining', v_remaining,
        'per_day_used', v_per_day_usage,
        'collect_email', v_collect_email,
        'collect_phone', v_event.rsvp_collect_phone,
        'collect_company', v_event.rsvp_collect_company,
        'collect_gender', v_event.rsvp_collect_gender,
        'collect_meal', v_event.rsvp_collect_meal,
        'collect_profession', v_event.rsvp_collect_profession,
        'profession_options', v_profession_options,
        'collect_note', v_collect_note,
        'collect_designation', v_event.rsvp_collect_designation,
        'collect_aadhaar', v_event.rsvp_collect_aadhaar,
        'require_email', v_require_email,
        'require_phone', v_require_phone,
        'require_company', v_require_company,
        'require_gender', v_require_gender,
        'require_meal', v_require_meal,
        'require_profession', v_require_profession,
        'require_note', v_require_note,
        'require_designation', v_require_designation,
        'require_aadhaar', v_event.rsvp_collect_aadhaar AND v_event.rsvp_require_aadhaar,
        'require_login', v_event.rsvp_require_login
      )
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_event_by_slug(text, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
