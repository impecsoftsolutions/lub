/*
  # Activities slug UX parity + multi-day datetime support (083)

  - add activities.start_at / activities.end_at
  - keep activity_date for backward compatibility (derived from start_at)
  - expose start_at/end_at in public/admin activity read RPCs
  - extend create/update activity RPCs to accept datetime fields
  - align create_activity_from_event_with_session to carry start/end datetimes
*/

ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS start_at timestamptz,
  ADD COLUMN IF NOT EXISTS end_at timestamptz;

UPDATE public.activities
SET start_at = (activity_date::timestamp AT TIME ZONE 'Asia/Kolkata')
WHERE start_at IS NULL
  AND activity_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS activities_start_at_idx ON public.activities (start_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS activities_end_at_idx ON public.activities (end_at DESC NULLS LAST);

CREATE OR REPLACE FUNCTION public.get_published_activities(
  p_limit  integer DEFAULT 12,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows   jsonb;
  v_total  integer;
BEGIN
  SELECT COUNT(*)::integer
  INTO v_total
  FROM public.activities
  WHERE status = 'published';

  SELECT jsonb_agg(
    jsonb_build_object(
      'id',              a.id,
      'slug',            a.slug,
      'title',           a.title,
      'excerpt',         a.excerpt,
      'activity_date',   a.activity_date,
      'start_at',        a.start_at,
      'end_at',          a.end_at,
      'location',        a.location,
      'cover_image_url', public.activity_cover_seed_url(COALESCE(
        NULLIF(a.cover_image_url, ''),
        (
          SELECT m.storage_url
          FROM public.activity_media m
          WHERE m.activity_id = a.id
          ORDER BY m.display_order ASC, m.created_at ASC
          LIMIT 1
        )
      )),
      'is_featured',     a.is_featured,
      'published_at',    a.published_at,
      'media_count',     (
        SELECT COUNT(*)::integer
        FROM public.activity_media m
        WHERE m.activity_id = a.id
      )
    )
    ORDER BY a.is_featured DESC,
      COALESCE(a.start_at, (a.activity_date::timestamp AT TIME ZONE 'Asia/Kolkata')) DESC NULLS LAST,
      a.published_at DESC
  )
  INTO v_rows
  FROM public.activities a
  WHERE a.status = 'published'
  LIMIT p_limit
  OFFSET p_offset;

  RETURN jsonb_build_object(
    'success', true,
    'data',    COALESCE(v_rows, '[]'::jsonb),
    'total',   v_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_published_activities(integer, integer) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_activity_by_slug(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_activity  public.activities%ROWTYPE;
  v_media     jsonb;
  v_first_media_url text;
BEGIN
  SELECT * INTO v_activity
  FROM public.activities
  WHERE slug = p_slug AND status = 'published';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Activity not found');
  END IF;

  SELECT m.storage_url INTO v_first_media_url
  FROM public.activity_media m
  WHERE m.activity_id = v_activity.id
  ORDER BY m.display_order ASC, m.created_at ASC
  LIMIT 1;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id',            m.id,
      'storage_url',   m.storage_url,
      'display_order', m.display_order
    )
    ORDER BY m.display_order ASC
  )
  INTO v_media
  FROM public.activity_media m
  WHERE m.activity_id = v_activity.id;

  RETURN jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'id',              v_activity.id,
      'slug',            v_activity.slug,
      'title',           v_activity.title,
      'excerpt',         v_activity.excerpt,
      'description',     v_activity.description,
      'activity_date',   v_activity.activity_date,
      'start_at',        v_activity.start_at,
      'end_at',          v_activity.end_at,
      'location',        v_activity.location,
      'cover_image_url', public.activity_cover_seed_url(COALESCE(NULLIF(v_activity.cover_image_url, ''), v_first_media_url)),
      'is_featured',     v_activity.is_featured,
      'youtube_urls',    v_activity.youtube_urls,
      'published_at',    v_activity.published_at,
      'media',           COALESCE(v_media, '[]'::jsonb)
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_activity_by_slug(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_all_activities_with_session(
  p_session_token text,
  p_status        text DEFAULT NULL,
  p_limit         integer DEFAULT 50,
  p_offset        integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_rows     jsonb;
  v_total    integer;
BEGIN
  v_actor_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT public.has_permission(v_actor_id, 'activities.view') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  SELECT COUNT(*)::integer
  INTO v_total
  FROM public.activities a
  WHERE (p_status IS NULL OR a.status = p_status);

  SELECT jsonb_agg(
    jsonb_build_object(
      'id',              a.id,
      'slug',            a.slug,
      'title',           a.title,
      'excerpt',         a.excerpt,
      'activity_date',   a.activity_date,
      'start_at',        a.start_at,
      'end_at',          a.end_at,
      'location',        a.location,
      'status',          a.status,
      'is_featured',     a.is_featured,
      'cover_image_url', public.activity_cover_seed_url(COALESCE(NULLIF(a.cover_image_url, ''), first_media.storage_url)),
      'first_media_url', first_media.storage_url,
      'created_by',      a.created_by,
      'created_by_email',(SELECT u.email FROM public.users u WHERE u.id = a.created_by),
      'published_at',    a.published_at,
      'created_at',      a.created_at,
      'updated_at',      a.updated_at,
      'media_count',     (
        SELECT COUNT(*)::integer
        FROM public.activity_media m
        WHERE m.activity_id = a.id
      )
    )
    ORDER BY a.updated_at DESC
  )
  INTO v_rows
  FROM public.activities a
  LEFT JOIN LATERAL (
    SELECT m.storage_url
    FROM public.activity_media m
    WHERE m.activity_id = a.id
    ORDER BY m.display_order ASC, m.created_at ASC
    LIMIT 1
  ) first_media ON true
  WHERE (p_status IS NULL OR a.status = p_status)
  LIMIT p_limit
  OFFSET p_offset;

  RETURN jsonb_build_object(
    'success', true,
    'data',    COALESCE(v_rows, '[]'::jsonb),
    'total',   v_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_all_activities_with_session(text, text, integer, integer) TO authenticated, anon;

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
  p_youtube_urls text[] DEFAULT '{}'::text[]
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
BEGIN
  v_actor_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT public.has_permission(v_actor_id, 'activities.create') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
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

GRANT EXECUTE ON FUNCTION public.create_activity_with_session(text, text, text, text, text, date, timestamptz, timestamptz, text, boolean, text, text, text, text, text, bigint, integer, integer, text[]) TO authenticated, anon;

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
  p_youtube_urls text[] DEFAULT NULL
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

GRANT EXECUTE ON FUNCTION public.update_activity_with_session(text, uuid, text, text, text, text, date, timestamptz, timestamptz, boolean, boolean, text, boolean, text, boolean, text, text, text, text, bigint, integer, integer, text[]) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.create_activity_from_event_with_session(
  p_session_token text,
  p_event_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
  v_event public.events%ROWTYPE;
  v_existing_activity_id uuid;
  v_existing_slug text;
  v_new_id uuid;
  v_slug text;
  v_activity_date date;
  v_description text;
  v_agenda_block text;
  v_item jsonb;
BEGIN
  v_actor := public.resolve_custom_session_user_id(p_session_token);
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_session', 'error', 'Invalid session');
  END IF;
  IF NOT public.has_permission(v_actor, 'activities.create') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'permission_denied', 'error', 'Not authorized to create activities');
  END IF;

  SELECT * INTO v_event FROM public.events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'event_not_found', 'error', 'Event not found');
  END IF;

  SELECT id, slug INTO v_existing_activity_id, v_existing_slug
  FROM public.activities
  WHERE source_event_id = p_event_id AND status <> 'archived'
  LIMIT 1;
  IF v_existing_activity_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'activity_id', v_existing_activity_id,
      'slug', v_existing_slug,
      'reused', true
    );
  END IF;

  v_slug := public.generate_unique_activity_slug(v_event.title);

  v_activity_date := CASE
    WHEN v_event.start_at IS NOT NULL THEN v_event.start_at::date
    WHEN v_event.end_at IS NOT NULL THEN v_event.end_at::date
    ELSE NULL
  END;

  v_description := COALESCE(v_event.description, v_event.excerpt, '');
  IF jsonb_typeof(v_event.agenda_items) = 'array' THEN
    v_agenda_block := '';
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_event.agenda_items) LOOP
      v_agenda_block := v_agenda_block
        || COALESCE(v_item->>'time', '') || ' '
        || COALESCE(v_item->>'title', '')
        || CASE WHEN v_item ? 'note' AND length(COALESCE(v_item->>'note','')) > 0 THEN ' - ' || (v_item->>'note') ELSE '' END
        || E'\n';
    END LOOP;
    IF length(trim(v_agenda_block)) > 0 THEN
      v_description := trim(v_description) || E'\n\nAgenda:\n' || trim(v_agenda_block);
    END IF;
  END IF;

  INSERT INTO public.activities (
    slug, title, excerpt, description, activity_date, start_at, end_at, location,
    status, is_featured, source_event_id, created_by, updated_at
  )
  VALUES (
    v_slug,
    v_event.title,
    v_event.excerpt,
    NULLIF(trim(v_description), ''),
    v_activity_date,
    v_event.start_at,
    v_event.end_at,
    v_event.location,
    'draft',
    v_event.is_featured,
    v_event.id,
    v_actor,
    now()
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('success', true, 'activity_id', v_new_id, 'slug', v_slug, 'reused', false);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error_code', 'unexpected_error', 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_activity_from_event_with_session(text, uuid) TO authenticated, anon;

NOTIFY pgrst, 'reload schema';
