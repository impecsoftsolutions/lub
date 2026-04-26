/*
  # Activities Cloudflare media support

  - Preserve original cover/gallery files in private Cloudflare R2
  - Keep display-facing URL fields (`cover_image_url`, `storage_url`) as worker URL seeds
  - Extend admin RPCs so the edit form can request signed original downloads
  - Keep public RPCs compatible
*/

ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS cover_storage_provider text,
  ADD COLUMN IF NOT EXISTS cover_original_object_key text,
  ADD COLUMN IF NOT EXISTS cover_original_filename text,
  ADD COLUMN IF NOT EXISTS cover_original_mime_type text,
  ADD COLUMN IF NOT EXISTS cover_original_bytes bigint,
  ADD COLUMN IF NOT EXISTS cover_original_width integer,
  ADD COLUMN IF NOT EXISTS cover_original_height integer;

ALTER TABLE public.activity_media
  ADD COLUMN IF NOT EXISTS storage_provider text,
  ADD COLUMN IF NOT EXISTS original_object_key text,
  ADD COLUMN IF NOT EXISTS original_filename text,
  ADD COLUMN IF NOT EXISTS mime_type text,
  ADD COLUMN IF NOT EXISTS file_size_bytes bigint,
  ADD COLUMN IF NOT EXISTS width integer,
  ADD COLUMN IF NOT EXISTS height integer;

UPDATE public.activities
SET cover_storage_provider = 'supabase_storage'
WHERE cover_image_url IS NOT NULL
  AND cover_storage_provider IS NULL;

UPDATE public.activity_media
SET storage_provider = 'supabase_storage'
WHERE storage_url IS NOT NULL
  AND storage_provider IS NULL;

COMMENT ON COLUMN public.activities.cover_storage_provider IS 'Storage provider for the current cover image (supabase_storage or cloudflare_r2).';
COMMENT ON COLUMN public.activities.cover_original_object_key IS 'Private original-object key for Cloudflare R2 cover downloads.';
COMMENT ON COLUMN public.activity_media.storage_provider IS 'Storage provider for the current gallery image (supabase_storage or cloudflare_r2).';
COMMENT ON COLUMN public.activity_media.original_object_key IS 'Private original-object key for Cloudflare R2 gallery downloads.';

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

  v_slug := NULLIF(trim(COALESCE(p_slug, '')), '');
  IF v_slug IS NULL THEN
    v_slug := public.generate_activity_slug(p_title);
  ELSIF EXISTS (SELECT 1 FROM public.activities WHERE slug = v_slug) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Slug already exists');
  END IF;

  INSERT INTO public.activities (
    slug,
    title,
    excerpt,
    description,
    activity_date,
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
    p_activity_date,
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

GRANT EXECUTE ON FUNCTION public.create_activity_with_session(text, text, text, text, text, date, text, boolean, text, text, text, text, text, bigint, integer, integer, text[]) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.update_activity_with_session(
  p_session_token text,
  p_activity_id uuid,
  p_title text DEFAULT NULL,
  p_slug text DEFAULT NULL,
  p_excerpt text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_activity_date date DEFAULT NULL,
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
  IF v_slug IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.activities WHERE slug = v_slug AND id <> p_activity_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Slug already exists');
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
    activity_date = COALESCE(p_activity_date, activity_date),
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

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_activity_with_session(text, uuid, text, text, text, text, date, text, boolean, text, boolean, text, text, text, text, bigint, integer, integer, text[]) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.add_activity_media_with_session(
  p_session_token text,
  p_activity_id uuid,
  p_storage_url text,
  p_storage_provider text DEFAULT NULL,
  p_original_object_key text DEFAULT NULL,
  p_original_filename text DEFAULT NULL,
  p_mime_type text DEFAULT NULL,
  p_file_size_bytes bigint DEFAULT NULL,
  p_width integer DEFAULT NULL,
  p_height integer DEFAULT NULL,
  p_display_order integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id  uuid;
  v_activity  public.activities%ROWTYPE;
  v_max_imgs  integer;
  v_cur_count integer;
  v_new_id    uuid;
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
    IF v_activity.created_by <> v_actor_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
    END IF;
  END IF;

  SELECT COALESCE(value::integer, 10) INTO v_max_imgs
  FROM public.activity_settings WHERE key = 'max_gallery_images';

  SELECT COUNT(*)::integer INTO v_cur_count
  FROM public.activity_media WHERE activity_id = p_activity_id;

  IF v_cur_count >= v_max_imgs THEN
    RETURN jsonb_build_object('success', false, 'error', 'Maximum photo limit reached (' || v_max_imgs || ' photos per activity)');
  END IF;

  INSERT INTO public.activity_media (
    activity_id,
    storage_url,
    storage_provider,
    original_object_key,
    original_filename,
    mime_type,
    file_size_bytes,
    width,
    height,
    display_order,
    uploaded_by
  ) VALUES (
    p_activity_id,
    p_storage_url,
    p_storage_provider,
    p_original_object_key,
    p_original_filename,
    p_mime_type,
    p_file_size_bytes,
    p_width,
    p_height,
    p_display_order,
    v_actor_id
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('success', true, 'media_id', v_new_id, 'id', v_new_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_activity_media_with_session(text, uuid, text, text, text, text, text, bigint, integer, integer, integer) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.remove_activity_media_with_session(
  p_session_token text,
  p_media_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_media public.activity_media%ROWTYPE;
  v_activity public.activities%ROWTYPE;
BEGIN
  v_actor_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  SELECT * INTO v_media FROM public.activity_media WHERE id = p_media_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Media not found');
  END IF;

  SELECT * INTO v_activity FROM public.activities WHERE id = v_media.activity_id;

  IF NOT public.has_permission(v_actor_id, 'activities.edit_any') THEN
    IF v_activity.created_by <> v_actor_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
    END IF;
  END IF;

  DELETE FROM public.activity_media WHERE id = p_media_id;

  RETURN jsonb_build_object(
    'success', true,
    'storage_url', v_media.storage_url,
    'storage_provider', v_media.storage_provider,
    'original_object_key', v_media.original_object_key
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_activity_media_with_session(text, uuid) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.reorder_activity_media_with_session(
  p_session_token text,
  p_activity_id uuid,
  p_media_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_activity public.activities%ROWTYPE;
  v_i integer;
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
    IF v_activity.created_by <> v_actor_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
    END IF;
  END IF;

  IF p_media_ids IS NULL OR array_length(p_media_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('success', true);
  END IF;

  FOR v_i IN 1..array_length(p_media_ids, 1) LOOP
    UPDATE public.activity_media
    SET display_order = v_i - 1
    WHERE id = p_media_ids[v_i] AND activity_id = p_activity_id;
  END LOOP;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reorder_activity_media_with_session(text, uuid, uuid[]) TO authenticated, anon;
