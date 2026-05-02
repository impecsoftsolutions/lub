/*
  # Events CMS Foundation (COD-EVENTS-CMS-032)

  Purpose:
  - Add a dedicated Events domain (separate from Activities).
  - Keep admin Events/Activities management separate.
  - Keep public Events & Activities UX combined.

  Security:
  - Public reads expose only published events.
  - Member-only visibility is unlocked only when a valid member/both
    session token is provided.
  - All writes flow through *_with_session RPC wrappers.
*/

-- =============================================================================
-- SECTION 1: Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  excerpt text,
  description text,
  event_type text NOT NULL DEFAULT 'general'
    CHECK (event_type IN ('workshop','seminar','webinar','meeting','exhibition','conference','networking','other','general')),
  visibility text NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public','member_only')),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','published','archived')),
  is_featured boolean NOT NULL DEFAULT false,
  start_at timestamptz,
  end_at timestamptz,
  location text,
  invitation_text text,
  agenda_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  published_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT events_end_after_start CHECK (
    end_at IS NULL OR start_at IS NULL OR end_at >= start_at
  )
);

COMMENT ON TABLE public.events IS
  'Dedicated Events CMS domain. Separate from Activities.';

CREATE INDEX IF NOT EXISTS events_status_idx ON public.events(status);
CREATE INDEX IF NOT EXISTS events_visibility_idx ON public.events(visibility);
CREATE INDEX IF NOT EXISTS events_start_at_idx ON public.events(start_at);
CREATE INDEX IF NOT EXISTS events_created_by_idx ON public.events(created_by);
CREATE INDEX IF NOT EXISTS events_updated_at_idx ON public.events(updated_at DESC);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY events_public_read
  ON public.events FOR SELECT
  TO anon, authenticated
  USING (status = 'published' AND visibility = 'public');

CREATE POLICY events_service_role_all
  ON public.events FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- SECTION 2: Permissions
-- =============================================================================

INSERT INTO public.permissions (code, name, description, category, is_active)
VALUES
  ('events.view',      'View Events',      'View events list and management area', 'events', true),
  ('events.create',    'Create Events',    'Create new event drafts',               'events', true),
  ('events.edit_own',  'Edit Own Events',  'Edit events created by the current user','events', true),
  ('events.edit_any',  'Edit Any Event',   'Edit any event regardless of author',   'events', true),
  ('events.publish',   'Publish Events',   'Publish or unpublish events',            'events', true),
  ('events.archive',   'Archive Events',   'Archive events',                         'events', true),
  ('events.delete',    'Delete Events',    'Permanently delete events',              'events', true)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    is_active = EXCLUDED.is_active,
    updated_at = now();

INSERT INTO public.role_permissions (role, permission_code, granted_by, is_revoked)
VALUES
  ('super_admin', 'events.view', NULL, false),
  ('super_admin', 'events.create', NULL, false),
  ('super_admin', 'events.edit_own', NULL, false),
  ('super_admin', 'events.edit_any', NULL, false),
  ('super_admin', 'events.publish', NULL, false),
  ('super_admin', 'events.archive', NULL, false),
  ('super_admin', 'events.delete', NULL, false),

  ('admin', 'events.view', NULL, false),
  ('admin', 'events.create', NULL, false),
  ('admin', 'events.edit_own', NULL, false),
  ('admin', 'events.edit_any', NULL, false),
  ('admin', 'events.publish', NULL, false),
  ('admin', 'events.archive', NULL, false),

  ('editor', 'events.view', NULL, false),
  ('editor', 'events.create', NULL, false),
  ('editor', 'events.edit_own', NULL, false),
  ('editor', 'events.publish', NULL, false)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- SECTION 3: Helpers
-- =============================================================================

CREATE OR REPLACE FUNCTION public.normalize_event_slug(p_value text)
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
    v_slug := 'event';
  END IF;

  RETURN v_slug;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_unique_event_slug(
  p_slug_source text,
  p_exclude_event_id uuid DEFAULT NULL
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
  v_base_slug := public.normalize_event_slug(p_slug_source);
  v_slug := v_base_slug;

  WHILE EXISTS (
    SELECT 1
    FROM public.events
    WHERE slug = v_slug
      AND (p_exclude_event_id IS NULL OR id <> p_exclude_event_id)
  ) LOOP
    v_counter := v_counter + 1;
    v_slug := substring(v_base_slug, 1, GREATEST(1, 80 - length(('-' || v_counter)::text))) || '-' || v_counter;
  END LOOP;

  RETURN v_slug;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_member_or_both_account(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_type text;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT u.account_type INTO v_account_type
  FROM public.users u
  WHERE u.id = p_user_id;

  RETURN v_account_type IN ('member', 'both');
END;
$$;

-- =============================================================================
-- SECTION 4: Public read RPCs
-- =============================================================================

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

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', e.id,
      'slug', e.slug,
      'title', e.title,
      'excerpt', e.excerpt,
      'description', e.description,
      'event_type', e.event_type,
      'visibility', e.visibility,
      'start_at', e.start_at,
      'end_at', e.end_at,
      'location', e.location,
      'is_featured', e.is_featured,
      'published_at', e.published_at
    )
    ORDER BY e.is_featured DESC, e.start_at ASC NULLS LAST, e.published_at DESC
  )
  INTO v_rows
  FROM public.events e
  WHERE e.status = 'published'
    AND (e.visibility = 'public' OR (v_include_member_only AND e.visibility = 'member_only'))
  LIMIT p_limit
  OFFSET p_offset;

  RETURN jsonb_build_object(
    'success', true,
    'data', COALESCE(v_rows, '[]'::jsonb),
    'total', v_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_published_events(integer, integer, text) TO anon, authenticated;

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
      'start_at', v_event.start_at,
      'end_at', v_event.end_at,
      'location', v_event.location,
      'invitation_text', v_event.invitation_text,
      'agenda_items', COALESCE(v_event.agenda_items, '[]'::jsonb),
      'is_featured', v_event.is_featured,
      'published_at', v_event.published_at
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_event_by_slug(text, text) TO anon, authenticated;

-- =============================================================================
-- SECTION 5: Privileged read RPCs
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

  IF NOT public.has_permission(v_actor_id, 'events.view') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  SELECT COUNT(*)::integer
  INTO v_total
  FROM public.events e
  WHERE (p_status IS NULL OR e.status = p_status);

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', e.id,
      'slug', e.slug,
      'title', e.title,
      'excerpt', e.excerpt,
      'event_type', e.event_type,
      'visibility', e.visibility,
      'status', e.status,
      'is_featured', e.is_featured,
      'start_at', e.start_at,
      'end_at', e.end_at,
      'location', e.location,
      'published_at', e.published_at,
      'created_at', e.created_at,
      'updated_at', e.updated_at,
      'created_by_name', (
        SELECT COALESCE(m.full_name, u.email)
        FROM public.users u
        LEFT JOIN public.member_registrations m ON m.user_id = u.id
        WHERE u.id = e.created_by
        ORDER BY m.created_at DESC NULLS LAST
        LIMIT 1
      )
    )
    ORDER BY e.updated_at DESC
  )
  INTO v_rows
  FROM public.events e
  WHERE (p_status IS NULL OR e.status = p_status)
  LIMIT p_limit
  OFFSET p_offset;

  RETURN jsonb_build_object(
    'success', true,
    'data', COALESCE(v_rows, '[]'::jsonb),
    'total', v_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_all_events_with_session(text, text, integer, integer) TO authenticated, anon;

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
BEGIN
  v_actor_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT public.has_permission(v_actor_id, 'events.view') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  SELECT * INTO v_event
  FROM public.events
  WHERE id = p_event_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Event not found');
  END IF;

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
      'invitation_text', v_event.invitation_text,
      'agenda_items', COALESCE(v_event.agenda_items, '[]'::jsonb),
      'created_by', v_event.created_by,
      'published_by', v_event.published_by,
      'published_at', v_event.published_at,
      'created_at', v_event.created_at,
      'updated_at', v_event.updated_at
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_event_by_id_with_session(text, uuid) TO authenticated, anon;

-- =============================================================================
-- SECTION 6: Privileged write RPCs
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_event_with_session(
  p_session_token text,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_title text;
  v_slug text;
  v_new_id uuid;
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_event_type text;
  v_visibility text;
  v_agenda_items jsonb;
BEGIN
  v_actor_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT public.has_permission(v_actor_id, 'events.create') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  v_title := NULLIF(trim(COALESCE(p_payload->>'title', '')), '');
  IF v_title IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Title is required');
  END IF;

  v_slug := public.generate_unique_event_slug(
    COALESCE(NULLIF(trim(COALESCE(p_payload->>'slug', '')), ''), v_title)
  );

  v_event_type := COALESCE(NULLIF(trim(COALESCE(p_payload->>'event_type', '')), ''), 'general');
  IF v_event_type NOT IN ('workshop','seminar','webinar','meeting','exhibition','conference','networking','other','general') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid event type');
  END IF;

  v_visibility := COALESCE(NULLIF(trim(COALESCE(p_payload->>'visibility', '')), ''), 'public');
  IF v_visibility NOT IN ('public', 'member_only') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid visibility');
  END IF;

  IF p_payload ? 'start_at' THEN
    v_start_at := NULLIF(trim(COALESCE(p_payload->>'start_at', '')), '')::timestamptz;
  ELSE
    v_start_at := NULL;
  END IF;

  IF p_payload ? 'end_at' THEN
    v_end_at := NULLIF(trim(COALESCE(p_payload->>'end_at', '')), '')::timestamptz;
  ELSE
    v_end_at := NULL;
  END IF;

  IF v_start_at IS NOT NULL AND v_end_at IS NOT NULL AND v_end_at < v_start_at THEN
    RETURN jsonb_build_object('success', false, 'error', 'End time must be after start time');
  END IF;

  IF jsonb_typeof(p_payload->'agenda_items') = 'array' THEN
    v_agenda_items := p_payload->'agenda_items';
  ELSE
    v_agenda_items := '[]'::jsonb;
  END IF;

  INSERT INTO public.events (
    slug,
    title,
    excerpt,
    description,
    event_type,
    visibility,
    status,
    is_featured,
    start_at,
    end_at,
    location,
    invitation_text,
    agenda_items,
    created_by,
    updated_at
  ) VALUES (
    v_slug,
    v_title,
    NULLIF(trim(COALESCE(p_payload->>'excerpt', '')), ''),
    NULLIF(trim(COALESCE(p_payload->>'description', '')), ''),
    v_event_type,
    v_visibility,
    'draft',
    COALESCE((p_payload->>'is_featured')::boolean, false),
    v_start_at,
    v_end_at,
    NULLIF(trim(COALESCE(p_payload->>'location', '')), ''),
    NULLIF(trim(COALESCE(p_payload->>'invitation_text', '')), ''),
    v_agenda_items,
    v_actor_id,
    now()
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('success', true, 'event_id', v_new_id, 'id', v_new_id, 'slug', v_slug);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_event_with_session(text, jsonb) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.update_event_with_session(
  p_session_token text,
  p_event_id uuid,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_event public.events%ROWTYPE;
  v_slug text := NULL;
  v_event_type text;
  v_visibility text;
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_agenda_items jsonb;
BEGIN
  v_actor_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  SELECT * INTO v_event FROM public.events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Event not found');
  END IF;

  IF NOT public.has_permission(v_actor_id, 'events.edit_any') THEN
    IF NOT public.has_permission(v_actor_id, 'events.edit_own') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
    END IF;
    IF v_event.created_by <> v_actor_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'Not authorized to edit this event');
    END IF;
  END IF;

  IF p_payload ? 'slug' THEN
    v_slug := NULLIF(trim(COALESCE(p_payload->>'slug', '')), '');
    IF v_slug IS NOT NULL THEN
      v_slug := public.generate_unique_event_slug(v_slug, p_event_id);
    END IF;
  END IF;

  IF p_payload ? 'event_type' THEN
    v_event_type := COALESCE(NULLIF(trim(COALESCE(p_payload->>'event_type', '')), ''), 'general');
    IF v_event_type NOT IN ('workshop','seminar','webinar','meeting','exhibition','conference','networking','other','general') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invalid event type');
    END IF;
  ELSE
    v_event_type := v_event.event_type;
  END IF;

  IF p_payload ? 'visibility' THEN
    v_visibility := COALESCE(NULLIF(trim(COALESCE(p_payload->>'visibility', '')), ''), 'public');
    IF v_visibility NOT IN ('public', 'member_only') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invalid visibility');
    END IF;
  ELSE
    v_visibility := v_event.visibility;
  END IF;

  IF p_payload ? 'start_at' THEN
    v_start_at := NULLIF(trim(COALESCE(p_payload->>'start_at', '')), '')::timestamptz;
  ELSE
    v_start_at := v_event.start_at;
  END IF;

  IF p_payload ? 'end_at' THEN
    v_end_at := NULLIF(trim(COALESCE(p_payload->>'end_at', '')), '')::timestamptz;
  ELSE
    v_end_at := v_event.end_at;
  END IF;

  IF v_start_at IS NOT NULL AND v_end_at IS NOT NULL AND v_end_at < v_start_at THEN
    RETURN jsonb_build_object('success', false, 'error', 'End time must be after start time');
  END IF;

  IF p_payload ? 'agenda_items' THEN
    IF jsonb_typeof(p_payload->'agenda_items') = 'array' THEN
      v_agenda_items := p_payload->'agenda_items';
    ELSE
      v_agenda_items := '[]'::jsonb;
    END IF;
  ELSE
    v_agenda_items := v_event.agenda_items;
  END IF;

  UPDATE public.events
  SET
    title = CASE WHEN p_payload ? 'title' THEN COALESCE(NULLIF(trim(COALESCE(p_payload->>'title', '')), ''), title) ELSE title END,
    slug = COALESCE(v_slug, slug),
    excerpt = CASE WHEN p_payload ? 'excerpt' THEN NULLIF(trim(COALESCE(p_payload->>'excerpt', '')), '') ELSE excerpt END,
    description = CASE WHEN p_payload ? 'description' THEN NULLIF(trim(COALESCE(p_payload->>'description', '')), '') ELSE description END,
    event_type = v_event_type,
    visibility = v_visibility,
    is_featured = CASE WHEN p_payload ? 'is_featured' THEN COALESCE((p_payload->>'is_featured')::boolean, false) ELSE is_featured END,
    start_at = v_start_at,
    end_at = v_end_at,
    location = CASE WHEN p_payload ? 'location' THEN NULLIF(trim(COALESCE(p_payload->>'location', '')), '') ELSE location END,
    invitation_text = CASE WHEN p_payload ? 'invitation_text' THEN NULLIF(trim(COALESCE(p_payload->>'invitation_text', '')), '') ELSE invitation_text END,
    agenda_items = v_agenda_items,
    updated_at = now()
  WHERE id = p_event_id;

  RETURN jsonb_build_object('success', true, 'slug', COALESCE(v_slug, v_event.slug));
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_event_with_session(text, uuid, jsonb) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.publish_event_with_session(
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
  SET status = 'published',
      published_by = v_actor_id,
      published_at = now(),
      updated_at = now()
  WHERE id = p_event_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Event not found');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.publish_event_with_session(text, uuid) TO authenticated, anon;

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
  SET status = 'draft',
      updated_at = now()
  WHERE id = p_event_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Event not found');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.unpublish_event_with_session(text, uuid) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.archive_event_with_session(
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

  IF NOT public.has_permission(v_actor_id, 'events.archive') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  UPDATE public.events
  SET status = 'archived',
      updated_at = now()
  WHERE id = p_event_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Event not found');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.archive_event_with_session(text, uuid) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.delete_event_with_session(
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

  IF NOT public.has_permission(v_actor_id, 'events.delete') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  DELETE FROM public.events
  WHERE id = p_event_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Event not found');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_event_with_session(text, uuid) TO authenticated, anon;

