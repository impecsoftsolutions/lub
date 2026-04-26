-- Give the admin Activities list an explicit first gallery image URL so the
-- thumbnail can render even when cover_image_url is absent/stale.

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
