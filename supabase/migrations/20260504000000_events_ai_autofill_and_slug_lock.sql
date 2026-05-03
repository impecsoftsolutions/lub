/*
  # Events AI autofill + slug lock + agenda visibility (COD-EVENTS-CMS-AI-AUTOFILL-038)

  Purpose:
  - Add three additive columns to public.events:
      show_agenda_publicly (boolean, default false)
      slug_locked          (boolean, default false)
      ai_metadata          (jsonb, nullable)
  - Add a slug-availability check RPC for the admin UI's
    pre-save validation flow.
  - Rewrite create/update event RPCs to honor slug_locked
    (admin chose this slug exactly; reject collisions instead
    of auto-suffixing) and to pass through the new columns.
  - Rewrite the public detail RPC to gate agenda_items by
    show_agenda_publicly so the agenda can be retained
    internally without leaking to the public surface.
  - Rewrite the public + admin list RPCs to fix a
    pre-existing pagination bug (LIMIT/OFFSET applied to the
    aggregated single-row resultset instead of slicing rows
    before aggregation), surfaced during 032 review.

  No destructive changes. No new permissions.
*/

-- =============================================================================
-- SECTION 1: Schema additions
-- =============================================================================

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS show_agenda_publicly boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS slug_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_metadata jsonb NULL;

COMMENT ON COLUMN public.events.show_agenda_publicly IS
  'When false, the public event detail RPC returns agenda_items as []. Admin RPCs always return the full agenda.';
COMMENT ON COLUMN public.events.slug_locked IS
  'True when an admin explicitly chose the slug. Server-side create/update rejects collisions instead of auto-suffixing.';
COMMENT ON COLUMN public.events.ai_metadata IS
  'Optional metadata captured when the event was AI-autofilled (model, generated_at, source_doc_count, brief_chars). Admin-only.';

-- =============================================================================
-- SECTION 2: Slug availability RPC
-- =============================================================================

CREATE OR REPLACE FUNCTION public.check_event_slug_available_with_session(
  p_session_token text,
  p_slug text,
  p_event_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_id uuid;
  v_normalized_slug text;
  v_exists boolean;
BEGIN
  v_actor_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'invalid_session',
      'error', 'Invalid session'
    );
  END IF;

  IF NOT (
    public.has_permission(v_actor_id, 'events.create')
    OR public.has_permission(v_actor_id, 'events.edit_any')
    OR public.has_permission(v_actor_id, 'events.edit_own')
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'permission_denied',
      'error', 'Not authorized'
    );
  END IF;

  v_normalized_slug := public.normalize_event_slug(COALESCE(p_slug, ''));

  IF v_normalized_slug IS NULL OR v_normalized_slug = '' OR v_normalized_slug = 'event' THEN
    -- 'event' is the helper's empty-input sentinel; treat as invalid for
    -- availability checks (admin must enter something meaningful).
    IF v_normalized_slug = 'event' AND COALESCE(trim(p_slug), '') = '' THEN
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'invalid_slug',
        'error', 'Slug is required',
        'normalized_slug', ''
      );
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.events
    WHERE slug = v_normalized_slug
      AND (p_event_id IS NULL OR id <> p_event_id)
  )
  INTO v_exists;

  RETURN jsonb_build_object(
    'success', true,
    'available', NOT v_exists,
    'normalized_slug', v_normalized_slug
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'unexpected_error',
      'error', SQLERRM
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_event_slug_available_with_session(text, text, uuid)
  TO authenticated, anon;

-- =============================================================================
-- SECTION 3: Public read RPCs (rewrite — also fixes pagination)
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

  -- Paginate BEFORE aggregating; jsonb_agg over a sliced subquery.
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      e.id,
      e.slug,
      e.title,
      e.excerpt,
      e.description,
      e.event_type,
      e.visibility,
      e.start_at,
      e.end_at,
      e.location,
      e.is_featured,
      e.published_at,
      e.show_agenda_publicly
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

  -- Gate agenda visibility per show_agenda_publicly. Admin RPCs (below) are
  -- not gated; they always return the full agenda so editors can manage it.
  IF v_event.show_agenda_publicly = true THEN
    v_agenda_items := COALESCE(v_event.agenda_items, '[]'::jsonb);
  ELSE
    v_agenda_items := '[]'::jsonb;
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
      'agenda_items', v_agenda_items,
      'show_agenda_publicly', v_event.show_agenda_publicly,
      'is_featured', v_event.is_featured,
      'published_at', v_event.published_at
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_event_by_slug(text, text) TO anon, authenticated;

-- =============================================================================
-- SECTION 4: Admin read RPCs (rewrite — also fixes pagination)
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
      'show_agenda_publicly', v_event.show_agenda_publicly,
      'slug_locked', v_event.slug_locked,
      'ai_metadata', v_event.ai_metadata,
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
-- SECTION 5: Write RPCs (rewrite — slug_locked + show_agenda_publicly + ai_metadata)
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
  v_normalized_slug text;
  v_slug_locked boolean;
  v_show_agenda_publicly boolean;
  v_ai_metadata jsonb;
  v_event_type text;
  v_visibility text;
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_agenda_items jsonb;
  v_new_id uuid;
  v_collision_exists boolean;
BEGIN
  v_actor_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_session', 'error', 'Invalid session');
  END IF;

  IF NOT public.has_permission(v_actor_id, 'events.create') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'permission_denied', 'error', 'Not authorized');
  END IF;

  v_title := NULLIF(trim(COALESCE(p_payload->>'title', '')), '');
  IF v_title IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_title', 'error', 'Title is required');
  END IF;

  v_slug_locked := COALESCE((p_payload->>'slug_locked')::boolean, false);
  v_show_agenda_publicly := COALESCE((p_payload->>'show_agenda_publicly')::boolean, false);

  IF jsonb_typeof(p_payload->'ai_metadata') IN ('object','array') THEN
    v_ai_metadata := p_payload->'ai_metadata';
  ELSE
    v_ai_metadata := NULL;
  END IF;

  v_event_type := COALESCE(NULLIF(trim(COALESCE(p_payload->>'event_type', '')), ''), 'general');
  IF v_event_type NOT IN ('workshop','seminar','webinar','meeting','exhibition','conference','networking','other','general') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_event_type', 'error', 'Invalid event type');
  END IF;

  v_visibility := COALESCE(NULLIF(trim(COALESCE(p_payload->>'visibility', '')), ''), 'public');
  IF v_visibility NOT IN ('public', 'member_only') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_visibility', 'error', 'Invalid visibility');
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
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_schedule', 'error', 'End time must be after start time');
  END IF;

  IF jsonb_typeof(p_payload->'agenda_items') = 'array' THEN
    v_agenda_items := p_payload->'agenda_items';
  ELSE
    v_agenda_items := '[]'::jsonb;
  END IF;

  -- Slug resolution: locked => exact normalized slug; else auto-suffix.
  v_slug := NULLIF(trim(COALESCE(p_payload->>'slug', '')), '');
  IF v_slug_locked THEN
    v_normalized_slug := public.normalize_event_slug(COALESCE(v_slug, v_title));
    SELECT EXISTS (
      SELECT 1 FROM public.events WHERE slug = v_normalized_slug
    ) INTO v_collision_exists;
    IF v_collision_exists THEN
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'slug_conflict',
        'error', 'Slug is already taken by another event',
        'conflict_slug', v_normalized_slug
      );
    END IF;
    v_slug := v_normalized_slug;
  ELSE
    v_slug := public.generate_unique_event_slug(COALESCE(v_slug, v_title));
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
    show_agenda_publicly,
    slug_locked,
    ai_metadata,
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
    v_show_agenda_publicly,
    v_slug_locked,
    v_ai_metadata,
    v_actor_id,
    now()
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object(
    'success', true,
    'event_id', v_new_id,
    'id', v_new_id,
    'slug', v_slug,
    'slug_locked', v_slug_locked
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'unexpected_error', 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_event_with_session(text, jsonb)
  TO authenticated, anon;

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
  v_normalized_slug text;
  v_slug_locked boolean;
  v_event_type text;
  v_visibility text;
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_agenda_items jsonb;
  v_show_agenda_publicly boolean;
  v_ai_metadata jsonb;
  v_collision_exists boolean;
BEGIN
  v_actor_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_session', 'error', 'Invalid session');
  END IF;

  SELECT * INTO v_event FROM public.events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'event_not_found', 'error', 'Event not found');
  END IF;

  IF NOT public.has_permission(v_actor_id, 'events.edit_any') THEN
    IF NOT public.has_permission(v_actor_id, 'events.edit_own') THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'permission_denied', 'error', 'Not authorized');
    END IF;
    IF v_event.created_by <> v_actor_id THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'permission_denied', 'error', 'Not authorized to edit this event');
    END IF;
  END IF;

  -- Determine slug_locked target. If absent in payload, retain existing.
  IF p_payload ? 'slug_locked' THEN
    v_slug_locked := COALESCE((p_payload->>'slug_locked')::boolean, false);
  ELSE
    v_slug_locked := v_event.slug_locked;
  END IF;

  -- Slug resolution.
  IF p_payload ? 'slug' THEN
    v_slug := NULLIF(trim(COALESCE(p_payload->>'slug', '')), '');
    IF v_slug IS NOT NULL THEN
      IF v_slug_locked THEN
        v_normalized_slug := public.normalize_event_slug(v_slug);
        IF v_normalized_slug <> v_event.slug THEN
          SELECT EXISTS (
            SELECT 1 FROM public.events
            WHERE slug = v_normalized_slug AND id <> p_event_id
          ) INTO v_collision_exists;
          IF v_collision_exists THEN
            RETURN jsonb_build_object(
              'success', false,
              'error_code', 'slug_conflict',
              'error', 'Slug is already taken by another event',
              'conflict_slug', v_normalized_slug
            );
          END IF;
        END IF;
        v_slug := v_normalized_slug;
      ELSE
        v_slug := public.generate_unique_event_slug(v_slug, p_event_id);
      END IF;
    END IF;
  END IF;

  IF p_payload ? 'event_type' THEN
    v_event_type := COALESCE(NULLIF(trim(COALESCE(p_payload->>'event_type', '')), ''), 'general');
    IF v_event_type NOT IN ('workshop','seminar','webinar','meeting','exhibition','conference','networking','other','general') THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'invalid_event_type', 'error', 'Invalid event type');
    END IF;
  ELSE
    v_event_type := v_event.event_type;
  END IF;

  IF p_payload ? 'visibility' THEN
    v_visibility := COALESCE(NULLIF(trim(COALESCE(p_payload->>'visibility', '')), ''), 'public');
    IF v_visibility NOT IN ('public', 'member_only') THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'invalid_visibility', 'error', 'Invalid visibility');
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
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_schedule', 'error', 'End time must be after start time');
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

  IF p_payload ? 'show_agenda_publicly' THEN
    v_show_agenda_publicly := COALESCE((p_payload->>'show_agenda_publicly')::boolean, false);
  ELSE
    v_show_agenda_publicly := v_event.show_agenda_publicly;
  END IF;

  IF p_payload ? 'ai_metadata' THEN
    IF jsonb_typeof(p_payload->'ai_metadata') IN ('object','array') THEN
      v_ai_metadata := p_payload->'ai_metadata';
    ELSE
      v_ai_metadata := NULL;
    END IF;
  ELSE
    v_ai_metadata := v_event.ai_metadata;
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
    show_agenda_publicly = v_show_agenda_publicly,
    slug_locked = v_slug_locked,
    ai_metadata = v_ai_metadata,
    updated_at = now()
  WHERE id = p_event_id;

  RETURN jsonb_build_object(
    'success', true,
    'slug', COALESCE(v_slug, v_event.slug),
    'slug_locked', v_slug_locked
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'unexpected_error', 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_event_with_session(text, uuid, jsonb)
  TO authenticated, anon;

COMMENT ON FUNCTION public.check_event_slug_available_with_session(text, text, uuid) IS
  'Slug availability check used by the admin event form for pre-save validation. Returns {success, available, normalized_slug}.';
COMMENT ON FUNCTION public.create_event_with_session(text, jsonb) IS
  'Create an event. Honors slug_locked (rejects collisions instead of auto-suffixing) and persists show_agenda_publicly + ai_metadata.';
COMMENT ON FUNCTION public.update_event_with_session(text, uuid, jsonb) IS
  'Update an event. Honors slug_locked (rejects collisions instead of auto-suffixing). Returns slug_conflict on locked-slug collision.';
COMMENT ON FUNCTION public.get_event_by_slug(text, text) IS
  'Public event detail. agenda_items returned only when show_agenda_publicly = true.';
COMMENT ON FUNCTION public.get_published_events(integer, integer, text) IS
  'Public published-events list with proper LIMIT/OFFSET pagination (rows sliced before aggregation).';
COMMENT ON FUNCTION public.get_all_events_with_session(text, text, integer, integer) IS
  'Admin events list with proper LIMIT/OFFSET pagination (rows sliced before aggregation).';
