-- Ensure Activities slugs are normalized and auto-de-duplicated server-side.
-- The activities.slug UNIQUE constraint remains the final safety net.

CREATE OR REPLACE FUNCTION public.normalize_activity_slug(p_value text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_slug text;
BEGIN
  v_slug := lower(
    regexp_replace(
      regexp_replace(COALESCE(p_value, ''), '[^a-zA-Z0-9\s-]', '', 'g'),
      '\s+', '-', 'g'
    )
  );
  v_slug := trim(both '-' from v_slug);
  v_slug := regexp_replace(v_slug, '-+', '-', 'g');
  v_slug := substring(v_slug, 1, 80);

  IF v_slug = '' THEN
    v_slug := 'activity';
  END IF;

  RETURN v_slug;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_unique_activity_slug(
  p_slug_source text,
  p_exclude_activity_id uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base_slug text;
  v_slug text;
  v_counter integer := 0;
BEGIN
  v_base_slug := public.normalize_activity_slug(p_slug_source);
  v_slug := v_base_slug;

  WHILE EXISTS (
    SELECT 1
    FROM public.activities
    WHERE slug = v_slug
      AND (p_exclude_activity_id IS NULL OR id <> p_exclude_activity_id)
  ) LOOP
    v_counter := v_counter + 1;
    v_slug := substring(v_base_slug, 1, GREATEST(1, 80 - length(('-' || v_counter)::text))) || '-' || v_counter;
  END LOOP;

  RETURN v_slug;
END;
$$;

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

  v_slug := public.generate_unique_activity_slug(COALESCE(NULLIF(trim(COALESCE(p_slug, '')), ''), p_title));

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

  RETURN jsonb_build_object('success', true, 'slug', COALESCE(v_slug, v_activity.slug));
END;
$$;
