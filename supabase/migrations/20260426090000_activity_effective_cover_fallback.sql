-- Make Activities list/detail RPCs expose an effective cover image.
-- If no explicit cover exists, use the first gallery image. If a previous
-- fallback saved a gallery-route seed as cover_image_url, normalize it to the
-- cover route so cover variants are valid for Worker rendering.

CREATE OR REPLACE FUNCTION public.activity_cover_seed_url(p_url text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_url IS NULL OR trim(p_url) = '' THEN NULL
    WHEN p_url LIKE '%/v1/activities/gallery/%'
      THEN replace(p_url, '/v1/activities/gallery/', '/v1/activities/cover/')
    ELSE p_url
  END;
$$;

UPDATE public.activities
SET cover_image_url = public.activity_cover_seed_url(cover_image_url)
WHERE cover_image_url LIKE '%/v1/activities/gallery/%';

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
    ORDER BY a.is_featured DESC, a.activity_date DESC NULLS LAST, a.published_at DESC
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
      'location',        a.location,
      'status',          a.status,
      'is_featured',     a.is_featured,
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
