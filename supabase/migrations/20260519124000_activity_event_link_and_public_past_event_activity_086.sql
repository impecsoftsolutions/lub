/*
  COD-EVENTS-ACTIVITY-LINKED-PAST-EVENT-086

  Purpose:
  1) Allow manual linking/unlinking of an Activity to a past/eligible Event from Activity create/edit.
  2) Expose source_event fields on activity admin fetch.
  3) Expose linked published activity reference in public get_event_by_slug payload,
     so past event detail can show "view activity" CTA.
*/

CREATE OR REPLACE FUNCTION public.get_activity_by_id_with_session(
  p_session_token text,
  p_activity_id   uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_activity public.activities%ROWTYPE;
  v_source_event public.events%ROWTYPE;
  v_media    jsonb;
BEGIN
  v_actor_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT public.has_permission(v_actor_id, 'activities.view') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  SELECT * INTO v_activity FROM public.activities WHERE id = p_activity_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Activity not found');
  END IF;

  IF NOT public.has_permission(v_actor_id, 'activities.edit_any') THEN
    IF v_activity.created_by <> v_actor_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'Not authorized to view this activity');
    END IF;
  END IF;

  IF v_activity.source_event_id IS NOT NULL THEN
    SELECT * INTO v_source_event FROM public.events WHERE id = v_activity.source_event_id;
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id',                  m.id,
      'storage_url',         m.storage_url,
      'storage_provider',    m.storage_provider,
      'original_object_key', m.original_object_key,
      'original_filename',   m.original_filename,
      'mime_type',           m.mime_type,
      'file_size_bytes',     m.file_size_bytes,
      'width',               m.width,
      'height',              m.height,
      'display_order',       m.display_order,
      'uploaded_by',         m.uploaded_by,
      'created_at',          m.created_at
    )
    ORDER BY m.display_order ASC
  )
  INTO v_media
  FROM public.activity_media m
  WHERE m.activity_id = v_activity.id;

  RETURN jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'id',                        v_activity.id,
      'slug',                      v_activity.slug,
      'title',                     v_activity.title,
      'excerpt',                   v_activity.excerpt,
      'description',               v_activity.description,
      'activity_date',             v_activity.activity_date,
      'start_at',                  v_activity.start_at,
      'end_at',                    v_activity.end_at,
      'location',                  v_activity.location,
      'status',                    v_activity.status,
      'is_featured',               v_activity.is_featured,
      'cover_image_url',           v_activity.cover_image_url,
      'cover_storage_provider',    v_activity.cover_storage_provider,
      'cover_original_object_key', v_activity.cover_original_object_key,
      'cover_original_filename',   v_activity.cover_original_filename,
      'cover_original_mime_type',  v_activity.cover_original_mime_type,
      'cover_original_bytes',      v_activity.cover_original_bytes,
      'cover_original_width',      v_activity.cover_original_width,
      'cover_original_height',     v_activity.cover_original_height,
      'youtube_urls',              v_activity.youtube_urls,
      'source_event_id',           v_activity.source_event_id,
      'source_event',              CASE
                                     WHEN v_source_event.id IS NULL THEN NULL
                                     ELSE jsonb_build_object(
                                       'id', v_source_event.id,
                                       'slug', v_source_event.slug,
                                       'title', v_source_event.title,
                                       'status', v_source_event.status,
                                       'start_at', v_source_event.start_at,
                                       'end_at', v_source_event.end_at
                                     )
                                   END,
      'created_by',                v_activity.created_by,
      'published_at',              v_activity.published_at,
      'created_at',                v_activity.created_at,
      'updated_at',                v_activity.updated_at,
      'media',                     COALESCE(v_media, '[]'::jsonb)
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_activity_by_id_with_session(text, uuid) TO authenticated, anon;


CREATE OR REPLACE FUNCTION public.create_activity_with_session(
  p_session_token text,
  p_title text,
  p_slug text DEFAULT NULL,
  p_excerpt text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_activity_date date DEFAULT NULL,
  p_start_at timestamptz DEFAULT NULL,
  p_end_at timestamptz DEFAULT NULL,
  p_location text DEFAULT NULL,
  p_is_featured boolean DEFAULT false,
  p_cover_image_url text DEFAULT NULL,
  p_cover_storage_provider text DEFAULT NULL,
  p_cover_original_object_key text DEFAULT NULL,
  p_cover_original_filename text DEFAULT NULL,
  p_cover_original_mime_type text DEFAULT NULL,
  p_cover_original_bytes bigint DEFAULT NULL,
  p_cover_original_width integer DEFAULT NULL,
  p_cover_original_height integer DEFAULT NULL,
  p_youtube_urls text[] DEFAULT '{}'::text[],
  p_source_event_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_slug text;
  v_new_id uuid;
  v_source_event public.events%ROWTYPE;
  v_existing_activity_id uuid;
  v_now timestamptz := now();
BEGIN
  v_actor_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT public.has_permission(v_actor_id, 'activities.create') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  IF p_source_event_id IS NOT NULL THEN
    IF NOT public.has_permission(v_actor_id, 'events.view') THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'permission_denied', 'error', 'Not authorized to read events');
    END IF;

    SELECT * INTO v_source_event FROM public.events WHERE id = p_source_event_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'event_not_found', 'error', 'Linked event not found');
    END IF;

    IF NOT (
      (
        v_source_event.status IN ('published','archived')
        AND (
          (v_source_event.end_at IS NOT NULL AND v_source_event.end_at < v_now)
          OR (v_source_event.start_at IS NOT NULL AND v_source_event.start_at < v_now - interval '1 day')
        )
      )
      OR (v_source_event.status = 'draft' AND v_source_event.created_by = v_actor_id)
    ) THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'event_not_eligible', 'error', 'Only completed published/archived events or your own draft events can be linked');
    END IF;

    SELECT id INTO v_existing_activity_id
    FROM public.activities
    WHERE source_event_id = p_source_event_id
      AND status <> 'archived'
    LIMIT 1;

    IF v_existing_activity_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'event_already_linked',
        'error', 'This event is already linked to another activity.',
        'activity_id', v_existing_activity_id
      );
    END IF;
  END IF;

  v_slug := public.generate_unique_activity_slug(COALESCE(NULLIF(trim(COALESCE(p_slug, '')), ''), p_title));

  INSERT INTO public.activities (
    slug,
    title,
    excerpt,
    description,
    activity_date,
    start_at,
    end_at,
    location,
    is_featured,
    source_event_id,
    cover_image_url,
    cover_storage_provider,
    cover_original_object_key,
    cover_original_filename,
    cover_original_mime_type,
    cover_original_bytes,
    cover_original_width,
    cover_original_height,
    youtube_urls,
    status,
    created_by,
    updated_at
  ) VALUES (
    v_slug,
    p_title,
    p_excerpt,
    p_description,
    COALESCE(p_start_at::date, p_activity_date),
    p_start_at,
    p_end_at,
    p_location,
    COALESCE(p_is_featured, false),
    p_source_event_id,
    p_cover_image_url,
    p_cover_storage_provider,
    p_cover_original_object_key,
    p_cover_original_filename,
    p_cover_original_mime_type,
    p_cover_original_bytes,
    p_cover_original_width,
    p_cover_original_height,
    COALESCE(p_youtube_urls, '{}'::text[]),
    'draft',
    v_actor_id,
    now()
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('success', true, 'activity_id', v_new_id, 'id', v_new_id, 'slug', v_slug);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_activity_with_session(text, text, text, text, text, date, timestamptz, timestamptz, text, boolean, text, text, text, text, text, bigint, integer, integer, text[], uuid) TO authenticated, anon;


CREATE OR REPLACE FUNCTION public.update_activity_with_session(
  p_session_token text,
  p_activity_id uuid,
  p_title text DEFAULT NULL,
  p_slug text DEFAULT NULL,
  p_excerpt text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_activity_date date DEFAULT NULL,
  p_start_at timestamptz DEFAULT NULL,
  p_end_at timestamptz DEFAULT NULL,
  p_clear_start_at boolean DEFAULT false,
  p_clear_end_at boolean DEFAULT false,
  p_location text DEFAULT NULL,
  p_is_featured boolean DEFAULT NULL,
  p_cover_image_url text DEFAULT NULL,
  p_clear_cover boolean DEFAULT false,
  p_cover_storage_provider text DEFAULT NULL,
  p_cover_original_object_key text DEFAULT NULL,
  p_cover_original_filename text DEFAULT NULL,
  p_cover_original_mime_type text DEFAULT NULL,
  p_cover_original_bytes bigint DEFAULT NULL,
  p_cover_original_width integer DEFAULT NULL,
  p_cover_original_height integer DEFAULT NULL,
  p_youtube_urls text[] DEFAULT NULL,
  p_source_event_id uuid DEFAULT NULL,
  p_clear_source_event boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_activity public.activities%ROWTYPE;
  v_slug text;
  v_cover_changed boolean;
  v_source_link_changed boolean;
  v_source_event public.events%ROWTYPE;
  v_existing_activity_id uuid;
  v_now timestamptz := now();
BEGIN
  v_actor_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  SELECT * INTO v_activity FROM public.activities WHERE id = p_activity_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Activity not found');
  END IF;

  IF NOT public.has_permission(v_actor_id, 'activities.edit_any') THEN
    IF NOT public.has_permission(v_actor_id, 'activities.edit_own') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
    END IF;
    IF v_activity.created_by <> v_actor_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'Not authorized to edit this activity');
    END IF;
  END IF;

  v_slug := NULLIF(trim(COALESCE(p_slug, '')), '');
  IF v_slug IS NOT NULL THEN
    v_slug := public.generate_unique_activity_slug(v_slug, p_activity_id);
  END IF;

  v_cover_changed := p_clear_cover
    OR p_cover_image_url IS NOT NULL
    OR p_cover_storage_provider IS NOT NULL
    OR p_cover_original_object_key IS NOT NULL
    OR p_cover_original_filename IS NOT NULL
    OR p_cover_original_mime_type IS NOT NULL
    OR p_cover_original_bytes IS NOT NULL
    OR p_cover_original_width IS NOT NULL
    OR p_cover_original_height IS NOT NULL;

  v_source_link_changed := p_clear_source_event OR p_source_event_id IS NOT NULL;

  IF p_source_event_id IS NOT NULL THEN
    IF NOT public.has_permission(v_actor_id, 'events.view') THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'permission_denied', 'error', 'Not authorized to read events');
    END IF;

    SELECT * INTO v_source_event FROM public.events WHERE id = p_source_event_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'event_not_found', 'error', 'Linked event not found');
    END IF;

    IF NOT (
      (
        v_source_event.status IN ('published','archived')
        AND (
          (v_source_event.end_at IS NOT NULL AND v_source_event.end_at < v_now)
          OR (v_source_event.start_at IS NOT NULL AND v_source_event.start_at < v_now - interval '1 day')
        )
      )
      OR (v_source_event.status = 'draft' AND v_source_event.created_by = v_actor_id)
    ) THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'event_not_eligible', 'error', 'Only completed published/archived events or your own draft events can be linked');
    END IF;

    SELECT id INTO v_existing_activity_id
    FROM public.activities
    WHERE source_event_id = p_source_event_id
      AND status <> 'archived'
      AND id <> p_activity_id
    LIMIT 1;

    IF v_existing_activity_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'event_already_linked',
        'error', 'This event is already linked to another activity.',
        'activity_id', v_existing_activity_id
      );
    END IF;
  END IF;

  UPDATE public.activities
  SET
    title = COALESCE(p_title, title),
    slug = COALESCE(v_slug, slug),
    excerpt = COALESCE(p_excerpt, excerpt),
    description = COALESCE(p_description, description),
    activity_date = CASE
      WHEN p_clear_start_at THEN NULL
      WHEN p_start_at IS NOT NULL THEN p_start_at::date
      WHEN p_activity_date IS NOT NULL THEN p_activity_date
      ELSE activity_date
    END,
    start_at = CASE
      WHEN p_clear_start_at THEN NULL
      WHEN p_start_at IS NOT NULL THEN p_start_at
      ELSE start_at
    END,
    end_at = CASE
      WHEN p_clear_end_at THEN NULL
      WHEN p_end_at IS NOT NULL THEN p_end_at
      ELSE end_at
    END,
    location = COALESCE(p_location, location),
    is_featured = COALESCE(p_is_featured, is_featured),
    source_event_id = CASE
      WHEN p_clear_source_event THEN NULL
      WHEN p_source_event_id IS NOT NULL THEN p_source_event_id
      ELSE source_event_id
    END,
    cover_image_url = CASE
      WHEN p_clear_cover THEN NULL
      WHEN v_cover_changed THEN p_cover_image_url
      ELSE cover_image_url
    END,
    cover_storage_provider = CASE
      WHEN p_clear_cover THEN NULL
      WHEN v_cover_changed THEN p_cover_storage_provider
      ELSE cover_storage_provider
    END,
    cover_original_object_key = CASE
      WHEN p_clear_cover THEN NULL
      WHEN v_cover_changed THEN p_cover_original_object_key
      ELSE cover_original_object_key
    END,
    cover_original_filename = CASE
      WHEN p_clear_cover THEN NULL
      WHEN v_cover_changed THEN p_cover_original_filename
      ELSE cover_original_filename
    END,
    cover_original_mime_type = CASE
      WHEN p_clear_cover THEN NULL
      WHEN v_cover_changed THEN p_cover_original_mime_type
      ELSE cover_original_mime_type
    END,
    cover_original_bytes = CASE
      WHEN p_clear_cover THEN NULL
      WHEN v_cover_changed THEN p_cover_original_bytes
      ELSE cover_original_bytes
    END,
    cover_original_width = CASE
      WHEN p_clear_cover THEN NULL
      WHEN v_cover_changed THEN p_cover_original_width
      ELSE cover_original_width
    END,
    cover_original_height = CASE
      WHEN p_clear_cover THEN NULL
      WHEN v_cover_changed THEN p_cover_original_height
      ELSE cover_original_height
    END,
    youtube_urls = COALESCE(p_youtube_urls, youtube_urls),
    updated_at = now()
  WHERE id = p_activity_id;

  RETURN jsonb_build_object('success', true, 'slug', COALESCE(v_slug, v_activity.slug));
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_activity_with_session(text, uuid, text, text, text, text, date, timestamptz, timestamptz, boolean, boolean, text, boolean, text, boolean, text, text, text, text, bigint, integer, integer, text[], uuid, boolean) TO authenticated, anon;


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
  v_public_deadline timestamptz;
  v_deadline_enabled boolean := false;
  v_hide_capacity_publicly boolean := false;
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
  v_linked_activity_id uuid;
  v_linked_activity_slug text;
  v_linked_activity_title text;
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

  v_deadline_enabled := COALESCE(
    (v_event.ai_metadata->>'rsvp_deadline_enabled')::boolean,
    v_event.rsvp_deadline_at IS NOT NULL
  );

  v_hide_capacity_publicly := COALESCE(
    (v_event.ai_metadata->>'rsvp_hide_capacity_publicly')::boolean,
    false
  );

  IF v_deadline_enabled THEN
    v_deadline := COALESCE(v_event.rsvp_deadline_at, v_event.end_at, v_event.start_at);
    v_public_deadline := COALESCE(v_event.rsvp_deadline_at, v_deadline);
  ELSE
    v_deadline := COALESCE(v_event.end_at, v_event.start_at);
    v_public_deadline := NULL;
  END IF;

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

  SELECT a.id, a.slug, a.title
  INTO v_linked_activity_id, v_linked_activity_slug, v_linked_activity_title
  FROM public.activities a
  WHERE a.source_event_id = v_event.id
    AND a.status = 'published'
  ORDER BY COALESCE(a.end_at, a.start_at, (a.activity_date::timestamp AT TIME ZONE 'Asia/Kolkata')) DESC NULLS LAST,
           a.published_at DESC NULLS LAST
  LIMIT 1;

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
      'linked_activity', CASE
                           WHEN v_linked_activity_id IS NULL THEN NULL
                           ELSE jsonb_build_object(
                             'id', v_linked_activity_id,
                             'slug', v_linked_activity_slug,
                             'title', v_linked_activity_title
                           )
                         END,
      'rsvp', jsonb_build_object(
        'enabled', v_event.rsvp_enabled,
        'open', v_open,
        'hide_capacity_publicly', v_hide_capacity_publicly,
        'deadline_enabled', v_deadline_enabled,
        'deadline_at', v_public_deadline,
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
