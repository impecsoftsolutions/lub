/*
  # Activities CMS Foundation (CLAUDE-ACTIVITIES-CMS-001)

  1. Purpose
     - Build a complete Activities CMS for the LUB portal
     - Activities = completed/ongoing organisational work (NOT events/news)
     - Three tables: activities, activity_media, activity_settings
     - Permissions: activities.* category with editor/admin/super_admin mappings
     - Public read RPCs (no session) + session-wrapped privileged RPCs

  2. Security
     - Public reads allowed for published activities only
     - All writes require valid session token + appropriate permission
     - Editor role = contributor (create/edit_own/publish)
     - Admin/super_admin = full management
*/

-- =============================================================================
-- SECTION 1: Tables
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.activities (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text UNIQUE NOT NULL,
  title           text NOT NULL,
  excerpt         text,
  description     text,
  activity_date   date,
  location        text,
  status          text NOT NULL DEFAULT 'draft'
                  CONSTRAINT activities_status_check
                  CHECK (status IN ('draft', 'published', 'archived')),
  is_featured     boolean NOT NULL DEFAULT false,
  cover_image_url text,
  youtube_urls    text[] NOT NULL DEFAULT '{}',
  created_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  published_by    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  published_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.activities IS
  'Organisational activities — completed or ongoing initiatives, programmes, advocacy, training, etc. Not events.';

CREATE INDEX IF NOT EXISTS activities_status_idx ON public.activities (status);
CREATE INDEX IF NOT EXISTS activities_slug_idx ON public.activities (slug);
CREATE INDEX IF NOT EXISTS activities_activity_date_idx ON public.activities (activity_date DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS activities_created_by_idx ON public.activities (created_by);

ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

-- Public can read published activities
CREATE POLICY "activities_public_read"
  ON public.activities FOR SELECT
  TO anon, authenticated
  USING (status = 'published');

-- Authenticated users with session-derived permission can do all
-- (enforced by RPC layer — direct table access blocked for writes)
CREATE POLICY "activities_service_role_all"
  ON public.activities FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================

CREATE TABLE IF NOT EXISTS public.activity_media (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id   uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  storage_url   text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  uploaded_by   uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.activity_media IS
  'Gallery images for activities. One activity can have multiple ordered photos.';

CREATE INDEX IF NOT EXISTS activity_media_activity_idx ON public.activity_media (activity_id, display_order);

ALTER TABLE public.activity_media ENABLE ROW LEVEL SECURITY;

-- Public can read media for published activities only
CREATE POLICY "activity_media_public_read"
  ON public.activity_media FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.activities a
      WHERE a.id = activity_media.activity_id
        AND a.status = 'published'
    )
  );

CREATE POLICY "activity_media_service_role_all"
  ON public.activity_media FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================

CREATE TABLE IF NOT EXISTS public.activity_settings (
  key         text PRIMARY KEY,
  value       text NOT NULL,
  updated_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.activity_settings IS
  'Admin-configurable settings for the Activities CMS (key-value singletons).';

ALTER TABLE public.activity_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activity_settings_service_role_all"
  ON public.activity_settings FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Seed default settings
INSERT INTO public.activity_settings (key, value)
VALUES
  ('max_gallery_images', '10'),
  ('max_youtube_links', '5')
ON CONFLICT (key) DO NOTHING;

-- =============================================================================
-- SECTION 2: Permissions
-- =============================================================================

INSERT INTO public.permissions (code, name, description, category, is_active)
VALUES
  ('activities.view',             'View Activities',             'View activities list and management area',          'activities', true),
  ('activities.create',           'Create Activities',           'Create new activity drafts',                        'activities', true),
  ('activities.edit_own',         'Edit Own Activities',         'Edit activities created by the current user',       'activities', true),
  ('activities.edit_any',         'Edit Any Activity',           'Edit any activity regardless of author',            'activities', true),
  ('activities.publish',          'Publish Activities',          'Publish or unpublish activities',                   'activities', true),
  ('activities.archive',          'Archive Activities',          'Archive activities',                                'activities', true),
  ('activities.delete',           'Delete Activities',           'Permanently delete activities',                     'activities', true),
  ('activities.settings.view',    'View Activity Settings',      'View activity CMS configuration settings',         'activities', true),
  ('activities.settings.manage',  'Manage Activity Settings',    'Change activity CMS configuration settings',       'activities', true)
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name,
      description = EXCLUDED.description,
      category = EXCLUDED.category,
      is_active = EXCLUDED.is_active,
      updated_at = now();

-- super_admin: all activities permissions
INSERT INTO public.role_permissions (role, permission_code, granted_by, is_revoked)
VALUES
  ('super_admin', 'activities.view',            NULL, false),
  ('super_admin', 'activities.create',          NULL, false),
  ('super_admin', 'activities.edit_own',        NULL, false),
  ('super_admin', 'activities.edit_any',        NULL, false),
  ('super_admin', 'activities.publish',         NULL, false),
  ('super_admin', 'activities.archive',         NULL, false),
  ('super_admin', 'activities.delete',          NULL, false),
  ('super_admin', 'activities.settings.view',   NULL, false),
  ('super_admin', 'activities.settings.manage', NULL, false)
ON CONFLICT DO NOTHING;

-- admin: all except delete
INSERT INTO public.role_permissions (role, permission_code, granted_by, is_revoked)
VALUES
  ('admin', 'activities.view',            NULL, false),
  ('admin', 'activities.create',          NULL, false),
  ('admin', 'activities.edit_own',        NULL, false),
  ('admin', 'activities.edit_any',        NULL, false),
  ('admin', 'activities.publish',         NULL, false),
  ('admin', 'activities.archive',         NULL, false),
  ('admin', 'activities.settings.view',   NULL, false),
  ('admin', 'activities.settings.manage', NULL, false)
ON CONFLICT DO NOTHING;

-- editor (contributor): create, edit own, publish — no settings, no delete, no edit_any
INSERT INTO public.role_permissions (role, permission_code, granted_by, is_revoked)
VALUES
  ('editor', 'activities.view',    NULL, false),
  ('editor', 'activities.create',  NULL, false),
  ('editor', 'activities.edit_own',NULL, false),
  ('editor', 'activities.publish', NULL, false)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- SECTION 3: Helper — slug generation
-- =============================================================================

CREATE OR REPLACE FUNCTION public.generate_activity_slug(p_title text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base_slug  text;
  v_slug       text;
  v_counter    integer := 0;
BEGIN
  -- Convert title to slug: lowercase, replace non-alphanum with dash, trim dashes
  v_base_slug := lower(
    regexp_replace(
      regexp_replace(p_title, '[^a-zA-Z0-9\s-]', '', 'g'),
      '\s+', '-', 'g'
    )
  );
  v_base_slug := trim(both '-' from v_base_slug);
  v_base_slug := regexp_replace(v_base_slug, '-+', '-', 'g');

  -- Ensure slug is not empty
  IF v_base_slug = '' THEN
    v_base_slug := 'activity';
  END IF;

  -- Truncate to reasonable length
  v_base_slug := substring(v_base_slug, 1, 80);

  v_slug := v_base_slug;

  -- Check uniqueness and append counter if needed
  WHILE EXISTS (SELECT 1 FROM public.activities WHERE slug = v_slug) LOOP
    v_counter := v_counter + 1;
    v_slug := v_base_slug || '-' || v_counter;
  END LOOP;

  RETURN v_slug;
END;
$$;

-- =============================================================================
-- SECTION 4: Public Read RPCs (no session required)
-- =============================================================================

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
      'cover_image_url', a.cover_image_url,
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

-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_activity_by_slug(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_activity  public.activities%ROWTYPE;
  v_media     jsonb;
BEGIN
  SELECT * INTO v_activity
  FROM public.activities
  WHERE slug = p_slug AND status = 'published';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Activity not found');
  END IF;

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
      'cover_image_url', v_activity.cover_image_url,
      'is_featured',     v_activity.is_featured,
      'youtube_urls',    v_activity.youtube_urls,
      'published_at',    v_activity.published_at,
      'media',           COALESCE(v_media, '[]'::jsonb)
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_activity_by_slug(text) TO anon, authenticated;

-- =============================================================================
-- SECTION 5: Privileged Read RPCs (session required)
-- =============================================================================

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
      'cover_image_url', a.cover_image_url,
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

-- =============================================================================

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

  -- Edit-own check: editor can only load their own activities
  IF NOT public.has_permission(v_actor_id, 'activities.edit_any') THEN
    IF v_activity.created_by <> v_actor_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'Not authorized to view this activity');
    END IF;
  END IF;

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
      'status',          v_activity.status,
      'is_featured',     v_activity.is_featured,
      'cover_image_url', v_activity.cover_image_url,
      'youtube_urls',    v_activity.youtube_urls,
      'created_by',      v_activity.created_by,
      'published_at',    v_activity.published_at,
      'created_at',      v_activity.created_at,
      'updated_at',      v_activity.updated_at,
      'media',           COALESCE(v_media, '[]'::jsonb)
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_activity_by_id_with_session(text, uuid) TO authenticated, anon;

-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_activity_settings_with_session(p_session_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_rows     jsonb;
BEGIN
  v_actor_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT public.has_permission(v_actor_id, 'activities.settings.view') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  SELECT jsonb_object_agg(key, value)
  INTO v_rows
  FROM public.activity_settings;

  RETURN jsonb_build_object('success', true, 'data', COALESCE(v_rows, '{}'::jsonb));
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_activity_settings_with_session(text) TO authenticated, anon;

-- =============================================================================
-- SECTION 6: Privileged Write RPCs
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_activity_with_session(
  p_session_token text,
  p_data          jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id  uuid;
  v_slug      text;
  v_new_id    uuid;
BEGIN
  v_actor_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT public.has_permission(v_actor_id, 'activities.create') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  -- Generate slug from title
  v_slug := public.generate_activity_slug(p_data->>'title');

  INSERT INTO public.activities (
    slug, title, excerpt, description,
    activity_date, location, is_featured,
    cover_image_url, youtube_urls,
    status, created_by, updated_at
  )
  VALUES (
    v_slug,
    p_data->>'title',
    p_data->>'excerpt',
    p_data->>'description',
    CASE WHEN p_data->>'activity_date' IS NOT NULL AND p_data->>'activity_date' <> ''
         THEN (p_data->>'activity_date')::date ELSE NULL END,
    p_data->>'location',
    COALESCE((p_data->>'is_featured')::boolean, false),
    p_data->>'cover_image_url',
    COALESCE(
      ARRAY(SELECT jsonb_array_elements_text(p_data->'youtube_urls')),
      '{}'::text[]
    ),
    'draft',
    v_actor_id,
    now()
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('success', true, 'id', v_new_id, 'slug', v_slug);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_activity_with_session(text, jsonb) TO authenticated, anon;

-- =============================================================================

CREATE OR REPLACE FUNCTION public.update_activity_with_session(
  p_session_token text,
  p_activity_id   uuid,
  p_data          jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id  uuid;
  v_activity  public.activities%ROWTYPE;
BEGIN
  v_actor_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  SELECT * INTO v_activity FROM public.activities WHERE id = p_activity_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Activity not found');
  END IF;

  -- Permission: edit_any OR (edit_own AND is the creator)
  IF NOT public.has_permission(v_actor_id, 'activities.edit_any') THEN
    IF NOT public.has_permission(v_actor_id, 'activities.edit_own') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
    END IF;
    IF v_activity.created_by <> v_actor_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'Not authorized to edit this activity');
    END IF;
  END IF;

  UPDATE public.activities
  SET
    title           = COALESCE(p_data->>'title', title),
    excerpt         = p_data->>'excerpt',
    description     = p_data->>'description',
    activity_date   = CASE
                        WHEN p_data ? 'activity_date' AND p_data->>'activity_date' <> ''
                        THEN (p_data->>'activity_date')::date
                        WHEN p_data ? 'activity_date' AND p_data->>'activity_date' = ''
                        THEN NULL
                        ELSE activity_date
                      END,
    location        = p_data->>'location',
    is_featured     = COALESCE((p_data->>'is_featured')::boolean, is_featured),
    cover_image_url = CASE
                        WHEN p_data ? 'cover_image_url'
                        THEN p_data->>'cover_image_url'
                        ELSE cover_image_url
                      END,
    youtube_urls    = CASE
                        WHEN p_data ? 'youtube_urls'
                        THEN ARRAY(SELECT jsonb_array_elements_text(p_data->'youtube_urls'))
                        ELSE youtube_urls
                      END,
    updated_at      = now()
  WHERE id = p_activity_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_activity_with_session(text, uuid, jsonb) TO authenticated, anon;

-- =============================================================================

CREATE OR REPLACE FUNCTION public.publish_activity_with_session(
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
BEGIN
  v_actor_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT public.has_permission(v_actor_id, 'activities.publish') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  UPDATE public.activities
  SET status       = 'published',
      published_at = COALESCE(published_at, now()),
      published_by = COALESCE(published_by, v_actor_id),
      updated_at   = now()
  WHERE id = p_activity_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.publish_activity_with_session(text, uuid) TO authenticated, anon;

-- =============================================================================

CREATE OR REPLACE FUNCTION public.unpublish_activity_with_session(
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
BEGIN
  v_actor_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT public.has_permission(v_actor_id, 'activities.publish') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  UPDATE public.activities
  SET status = 'draft', updated_at = now()
  WHERE id = p_activity_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.unpublish_activity_with_session(text, uuid) TO authenticated, anon;

-- =============================================================================

CREATE OR REPLACE FUNCTION public.archive_activity_with_session(
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
BEGIN
  v_actor_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT public.has_permission(v_actor_id, 'activities.archive') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  UPDATE public.activities
  SET status = 'archived', updated_at = now()
  WHERE id = p_activity_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.archive_activity_with_session(text, uuid) TO authenticated, anon;

-- =============================================================================

CREATE OR REPLACE FUNCTION public.delete_activity_with_session(
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
BEGIN
  v_actor_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT public.has_permission(v_actor_id, 'activities.delete') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  DELETE FROM public.activities WHERE id = p_activity_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_activity_with_session(text, uuid) TO authenticated, anon;

-- =============================================================================

CREATE OR REPLACE FUNCTION public.add_activity_media_with_session(
  p_session_token text,
  p_activity_id   uuid,
  p_storage_url   text,
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

  -- Enforce max gallery limit from settings
  SELECT COALESCE(value::integer, 10) INTO v_max_imgs
  FROM public.activity_settings WHERE key = 'max_gallery_images';

  SELECT COUNT(*)::integer INTO v_cur_count
  FROM public.activity_media WHERE activity_id = p_activity_id;

  IF v_cur_count >= v_max_imgs THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Maximum photo limit reached (' || v_max_imgs || ' photos per activity)'
    );
  END IF;

  INSERT INTO public.activity_media (activity_id, storage_url, display_order, uploaded_by)
  VALUES (p_activity_id, p_storage_url, p_display_order, v_actor_id)
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('success', true, 'id', v_new_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_activity_media_with_session(text, uuid, text, integer) TO authenticated, anon;

-- =============================================================================

CREATE OR REPLACE FUNCTION public.remove_activity_media_with_session(
  p_session_token text,
  p_media_id      uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id  uuid;
  v_media     public.activity_media%ROWTYPE;
  v_activity  public.activities%ROWTYPE;
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

  RETURN jsonb_build_object('success', true, 'storage_url', v_media.storage_url);
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_activity_media_with_session(text, uuid) TO authenticated, anon;

-- =============================================================================

CREATE OR REPLACE FUNCTION public.reorder_activity_media_with_session(
  p_session_token text,
  p_activity_id   uuid,
  p_media_ids     uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_activity public.activities%ROWTYPE;
  v_i        integer;
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

  FOR v_i IN 1..array_length(p_media_ids, 1) LOOP
    UPDATE public.activity_media
    SET display_order = v_i - 1
    WHERE id = p_media_ids[v_i] AND activity_id = p_activity_id;
  END LOOP;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reorder_activity_media_with_session(text, uuid, uuid[]) TO authenticated, anon;

-- =============================================================================

CREATE OR REPLACE FUNCTION public.update_activity_setting_with_session(
  p_session_token text,
  p_key           text,
  p_value         text
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

  IF NOT public.has_permission(v_actor_id, 'activities.settings.manage') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  -- Validate known keys
  IF p_key NOT IN ('max_gallery_images', 'max_youtube_links') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unknown setting key');
  END IF;

  -- Validate numeric value
  IF p_value !~ '^\d+$' OR p_value::integer < 1 OR p_value::integer > 50 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Value must be a number between 1 and 50');
  END IF;

  INSERT INTO public.activity_settings (key, value, updated_by, updated_at)
  VALUES (p_key, p_value, v_actor_id, now())
  ON CONFLICT (key) DO UPDATE
  SET value      = EXCLUDED.value,
      updated_by = EXCLUDED.updated_by,
      updated_at = EXCLUDED.updated_at;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_activity_setting_with_session(text, text, text) TO authenticated, anon;
