/*
  # Events RSVP fields v2 — gender, meal preference, profession + collect toggles
  # COD-EVENTS-NEXT-040A

  Purpose:
  - Capture additional RSVP details (gender, meal preference, profession)
    when an event opts in via the new collect toggles.
  - Add per-event toggles for the three new optional-by-default fields.
  - Update RPCs to round-trip the new fields and enforce required-when-
    collected validation server-side.

  Notes:
  - All new RSVP columns are NULLABLE; existing rows from 039 remain
    valid without backfill.
  - Profession enum is locked to a closed set in alphabetical order
    (matches the public form / admin form display order).
*/

-- =============================================================================
-- SECTION 1: Schema additions
-- =============================================================================

ALTER TABLE public.event_rsvps
  ADD COLUMN IF NOT EXISTS gender          text,
  ADD COLUMN IF NOT EXISTS meal_preference text,
  ADD COLUMN IF NOT EXISTS profession      text;

ALTER TABLE public.event_rsvps
  ADD CONSTRAINT event_rsvps_gender_check CHECK (
    gender IS NULL OR gender IN ('male','female','other','prefer_not_to_say')
  );

ALTER TABLE public.event_rsvps
  ADD CONSTRAINT event_rsvps_meal_preference_check CHECK (
    meal_preference IS NULL OR meal_preference IN ('veg','non_veg')
  );

ALTER TABLE public.event_rsvps
  ADD CONSTRAINT event_rsvps_profession_check CHECK (
    profession IS NULL OR profession IN (
      'company_owner','director','official','other','partner','student'
    )
  );

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS rsvp_collect_gender     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rsvp_collect_meal       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rsvp_collect_profession boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.event_rsvps.gender IS
  'Gender captured at RSVP time. NULL if event did not collect it.';
COMMENT ON COLUMN public.event_rsvps.meal_preference IS
  'veg | non_veg meal preference. NULL if event did not collect it.';
COMMENT ON COLUMN public.event_rsvps.profession IS
  'Closed enum profession. Alphabetical: company_owner, director, official, other, partner, student.';
COMMENT ON COLUMN public.events.rsvp_collect_gender IS
  'Show + require gender on the public RSVP form.';
COMMENT ON COLUMN public.events.rsvp_collect_meal IS
  'Show + require meal preference on the public RSVP form.';
COMMENT ON COLUMN public.events.rsvp_collect_profession IS
  'Show + require profession on the public RSVP form.';

-- =============================================================================
-- SECTION 2: get_event_by_slug — surface new collect_* flags
-- =============================================================================

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
      AND (v_event.rsvp_capacity IS NULL OR v_used_count < v_event.rsvp_capacity);
    IF v_event.rsvp_capacity IS NOT NULL THEN
      v_remaining := GREATEST(v_event.rsvp_capacity - v_used_count, 0);
    END IF;
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
      'venue_map_url', v_event.venue_map_url,
      'whatsapp_invitation_message', v_event.whatsapp_invitation_message,
      'invitation_text', v_event.invitation_text,
      'agenda_items', v_agenda_items,
      'show_agenda_publicly', v_event.show_agenda_publicly,
      'is_featured', v_event.is_featured,
      'published_at', v_event.published_at,
      'rsvp', jsonb_build_object(
        'enabled', v_event.rsvp_enabled,
        'open', v_open,
        'deadline_at', v_deadline,
        'capacity', v_event.rsvp_capacity,
        'used_count', v_used_count,
        'remaining', v_remaining,
        'collect_phone', v_event.rsvp_collect_phone,
        'collect_company', v_event.rsvp_collect_company,
        'collect_gender', v_event.rsvp_collect_gender,
        'collect_meal', v_event.rsvp_collect_meal,
        'collect_profession', v_event.rsvp_collect_profession,
        'require_login', v_event.rsvp_require_login
      )
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_event_by_slug(text, text) TO anon, authenticated;

-- =============================================================================
-- SECTION 3: get_event_by_id_with_session — surface admin collect_* flags
-- =============================================================================

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
  v_used integer := 0;
  v_bridged_activity uuid;
BEGIN
  v_actor_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT public.has_permission(v_actor_id, 'events.view') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  SELECT * INTO v_event FROM public.events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Event not found');
  END IF;

  SELECT COUNT(*)::integer INTO v_used
  FROM public.event_rsvps r
  WHERE r.event_id = v_event.id AND r.status = 'confirmed';

  SELECT a.id INTO v_bridged_activity
  FROM public.activities a
  WHERE a.source_event_id = v_event.id AND a.status <> 'archived'
  LIMIT 1;

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
      'venue_map_url', v_event.venue_map_url,
      'whatsapp_invitation_message', v_event.whatsapp_invitation_message,
      'invitation_text', v_event.invitation_text,
      'agenda_items', COALESCE(v_event.agenda_items, '[]'::jsonb),
      'show_agenda_publicly', v_event.show_agenda_publicly,
      'slug_locked', v_event.slug_locked,
      'ai_metadata', v_event.ai_metadata,
      'rsvp', jsonb_build_object(
        'enabled', v_event.rsvp_enabled,
        'capacity', v_event.rsvp_capacity,
        'deadline_at', v_event.rsvp_deadline_at,
        'collect_phone', v_event.rsvp_collect_phone,
        'collect_company', v_event.rsvp_collect_company,
        'collect_gender', v_event.rsvp_collect_gender,
        'collect_meal', v_event.rsvp_collect_meal,
        'collect_profession', v_event.rsvp_collect_profession,
        'require_login', v_event.rsvp_require_login,
        'used_count', v_used
      ),
      'bridge', jsonb_build_object(
        'activity_id', v_bridged_activity,
        'has_activity', v_bridged_activity IS NOT NULL
      ),
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
-- SECTION 4: create_event_with_session — accept new collect_* flags
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
  v_rsvp_capacity integer;
  v_rsvp_deadline timestamptz;
  v_venue_map_url text;
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
  END IF;
  IF p_payload ? 'end_at' THEN
    v_end_at := NULLIF(trim(COALESCE(p_payload->>'end_at', '')), '')::timestamptz;
  END IF;

  IF v_start_at IS NOT NULL AND v_end_at IS NOT NULL AND v_end_at < v_start_at THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_schedule', 'error', 'End time must be after start time');
  END IF;

  IF jsonb_typeof(p_payload->'agenda_items') = 'array' THEN
    v_agenda_items := p_payload->'agenda_items';
  ELSE
    v_agenda_items := '[]'::jsonb;
  END IF;

  v_venue_map_url := NULLIF(trim(COALESCE(p_payload->>'venue_map_url', '')), '');
  IF v_venue_map_url IS NOT NULL AND v_venue_map_url !~* '^https?://' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_venue_map_url', 'error', 'Venue map URL must start with http:// or https://');
  END IF;
  IF v_venue_map_url IS NOT NULL AND length(v_venue_map_url) > 500 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_venue_map_url', 'error', 'Venue map URL is too long (max 500 chars)');
  END IF;

  IF p_payload ? 'rsvp_capacity' AND length(trim(COALESCE(p_payload->>'rsvp_capacity', ''))) > 0 THEN
    v_rsvp_capacity := (p_payload->>'rsvp_capacity')::integer;
    IF v_rsvp_capacity IS NOT NULL AND v_rsvp_capacity <= 0 THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'invalid_rsvp_capacity', 'error', 'RSVP capacity must be a positive integer');
    END IF;
  END IF;

  IF p_payload ? 'rsvp_deadline_at' AND length(trim(COALESCE(p_payload->>'rsvp_deadline_at', ''))) > 0 THEN
    v_rsvp_deadline := (p_payload->>'rsvp_deadline_at')::timestamptz;
  END IF;

  v_slug := NULLIF(trim(COALESCE(p_payload->>'slug', '')), '');
  IF v_slug_locked THEN
    v_normalized_slug := public.normalize_event_slug(COALESCE(v_slug, v_title));
    SELECT EXISTS(SELECT 1 FROM public.events WHERE slug = v_normalized_slug) INTO v_collision_exists;
    IF v_collision_exists THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'slug_conflict', 'error', 'Slug is already taken by another event', 'conflict_slug', v_normalized_slug);
    END IF;
    v_slug := v_normalized_slug;
  ELSE
    v_slug := public.generate_unique_event_slug(COALESCE(v_slug, v_title));
  END IF;

  INSERT INTO public.events (
    slug, title, excerpt, description, event_type, visibility, status, is_featured,
    start_at, end_at, location, invitation_text, agenda_items,
    show_agenda_publicly, slug_locked, ai_metadata,
    venue_map_url, whatsapp_invitation_message,
    rsvp_enabled, rsvp_capacity, rsvp_deadline_at,
    rsvp_collect_phone, rsvp_collect_company,
    rsvp_collect_gender, rsvp_collect_meal, rsvp_collect_profession,
    rsvp_require_login,
    created_by, updated_at
  ) VALUES (
    v_slug,
    v_title,
    NULLIF(trim(COALESCE(p_payload->>'excerpt', '')), ''),
    NULLIF(trim(COALESCE(p_payload->>'description', '')), ''),
    v_event_type,
    v_visibility,
    'draft',
    COALESCE((p_payload->>'is_featured')::boolean, false),
    v_start_at, v_end_at,
    NULLIF(trim(COALESCE(p_payload->>'location', '')), ''),
    NULLIF(trim(COALESCE(p_payload->>'invitation_text', '')), ''),
    v_agenda_items,
    v_show_agenda_publicly, v_slug_locked, v_ai_metadata,
    v_venue_map_url,
    NULLIF(trim(COALESCE(p_payload->>'whatsapp_invitation_message', '')), ''),
    COALESCE((p_payload->>'rsvp_enabled')::boolean, false),
    v_rsvp_capacity,
    v_rsvp_deadline,
    COALESCE((p_payload->>'rsvp_collect_phone')::boolean, true),
    COALESCE((p_payload->>'rsvp_collect_company')::boolean, false),
    COALESCE((p_payload->>'rsvp_collect_gender')::boolean, false),
    COALESCE((p_payload->>'rsvp_collect_meal')::boolean, false),
    COALESCE((p_payload->>'rsvp_collect_profession')::boolean, false),
    COALESCE((p_payload->>'rsvp_require_login')::boolean, false),
    v_actor_id, now()
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('success', true, 'event_id', v_new_id, 'id', v_new_id, 'slug', v_slug, 'slug_locked', v_slug_locked);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error_code', 'unexpected_error', 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_event_with_session(text, jsonb) TO authenticated, anon;

-- =============================================================================
-- SECTION 5: update_event_with_session — accept new collect_* flags
-- =============================================================================

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
  v_venue_map_url text;
  v_rsvp_capacity integer;
  v_rsvp_deadline timestamptz;
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

  IF p_payload ? 'slug_locked' THEN
    v_slug_locked := COALESCE((p_payload->>'slug_locked')::boolean, false);
  ELSE
    v_slug_locked := v_event.slug_locked;
  END IF;

  IF p_payload ? 'slug' THEN
    v_slug := NULLIF(trim(COALESCE(p_payload->>'slug', '')), '');
    IF v_slug IS NOT NULL THEN
      IF v_slug_locked THEN
        v_normalized_slug := public.normalize_event_slug(v_slug);
        IF v_normalized_slug <> v_event.slug THEN
          SELECT EXISTS(SELECT 1 FROM public.events WHERE slug = v_normalized_slug AND id <> p_event_id) INTO v_collision_exists;
          IF v_collision_exists THEN
            RETURN jsonb_build_object('success', false, 'error_code', 'slug_conflict', 'error', 'Slug is already taken by another event', 'conflict_slug', v_normalized_slug);
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
    IF v_visibility NOT IN ('public','member_only') THEN
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

  IF p_payload ? 'venue_map_url' THEN
    v_venue_map_url := NULLIF(trim(COALESCE(p_payload->>'venue_map_url', '')), '');
    IF v_venue_map_url IS NOT NULL AND v_venue_map_url !~* '^https?://' THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'invalid_venue_map_url', 'error', 'Venue map URL must start with http:// or https://');
    END IF;
    IF v_venue_map_url IS NOT NULL AND length(v_venue_map_url) > 500 THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'invalid_venue_map_url', 'error', 'Venue map URL is too long (max 500 chars)');
    END IF;
  ELSE
    v_venue_map_url := v_event.venue_map_url;
  END IF;

  IF p_payload ? 'rsvp_capacity' THEN
    IF length(trim(COALESCE(p_payload->>'rsvp_capacity', ''))) > 0 THEN
      v_rsvp_capacity := (p_payload->>'rsvp_capacity')::integer;
      IF v_rsvp_capacity IS NOT NULL AND v_rsvp_capacity <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'invalid_rsvp_capacity', 'error', 'RSVP capacity must be a positive integer');
      END IF;
    ELSE
      v_rsvp_capacity := NULL;
    END IF;
  ELSE
    v_rsvp_capacity := v_event.rsvp_capacity;
  END IF;

  IF p_payload ? 'rsvp_deadline_at' THEN
    IF length(trim(COALESCE(p_payload->>'rsvp_deadline_at', ''))) > 0 THEN
      v_rsvp_deadline := (p_payload->>'rsvp_deadline_at')::timestamptz;
    ELSE
      v_rsvp_deadline := NULL;
    END IF;
  ELSE
    v_rsvp_deadline := v_event.rsvp_deadline_at;
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
    venue_map_url = v_venue_map_url,
    whatsapp_invitation_message = CASE WHEN p_payload ? 'whatsapp_invitation_message' THEN NULLIF(trim(COALESCE(p_payload->>'whatsapp_invitation_message', '')), '') ELSE whatsapp_invitation_message END,
    rsvp_enabled = CASE WHEN p_payload ? 'rsvp_enabled' THEN COALESCE((p_payload->>'rsvp_enabled')::boolean, false) ELSE rsvp_enabled END,
    rsvp_capacity = v_rsvp_capacity,
    rsvp_deadline_at = v_rsvp_deadline,
    rsvp_collect_phone = CASE WHEN p_payload ? 'rsvp_collect_phone' THEN COALESCE((p_payload->>'rsvp_collect_phone')::boolean, true) ELSE rsvp_collect_phone END,
    rsvp_collect_company = CASE WHEN p_payload ? 'rsvp_collect_company' THEN COALESCE((p_payload->>'rsvp_collect_company')::boolean, false) ELSE rsvp_collect_company END,
    rsvp_collect_gender = CASE WHEN p_payload ? 'rsvp_collect_gender' THEN COALESCE((p_payload->>'rsvp_collect_gender')::boolean, false) ELSE rsvp_collect_gender END,
    rsvp_collect_meal = CASE WHEN p_payload ? 'rsvp_collect_meal' THEN COALESCE((p_payload->>'rsvp_collect_meal')::boolean, false) ELSE rsvp_collect_meal END,
    rsvp_collect_profession = CASE WHEN p_payload ? 'rsvp_collect_profession' THEN COALESCE((p_payload->>'rsvp_collect_profession')::boolean, false) ELSE rsvp_collect_profession END,
    rsvp_require_login = CASE WHEN p_payload ? 'rsvp_require_login' THEN COALESCE((p_payload->>'rsvp_require_login')::boolean, false) ELSE rsvp_require_login END,
    updated_at = now()
  WHERE id = p_event_id;

  RETURN jsonb_build_object('success', true, 'slug', COALESCE(v_slug, v_event.slug), 'slug_locked', v_slug_locked);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error_code', 'unexpected_error', 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_event_with_session(text, uuid, jsonb) TO authenticated, anon;

-- =============================================================================
-- SECTION 6: get_event_rsvps_with_session — return new fields
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_event_rsvps_with_session(
  p_session_token text,
  p_event_id uuid,
  p_status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
  v_rows jsonb;
  v_summary jsonb;
BEGIN
  v_actor := public.resolve_custom_session_user_id(p_session_token);
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;
  IF NOT (public.has_permission(v_actor, 'events.rsvp.view') OR public.has_permission(v_actor, 'events.rsvp.manage')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT id, event_id, full_name, email, phone, company,
           gender, meal_preference, profession,
           notes, status, created_at, updated_at
    FROM public.event_rsvps
    WHERE event_id = p_event_id
      AND (p_status IS NULL OR status = p_status)
    ORDER BY created_at DESC
  ) t;

  SELECT jsonb_build_object(
    'total', COUNT(*),
    'confirmed', COUNT(*) FILTER (WHERE status='confirmed'),
    'cancelled', COUNT(*) FILTER (WHERE status='cancelled'),
    'pending',   COUNT(*) FILTER (WHERE status='pending'),
    'waitlisted',COUNT(*) FILTER (WHERE status='waitlisted')
  ) INTO v_summary
  FROM public.event_rsvps
  WHERE event_id = p_event_id;

  RETURN jsonb_build_object('success', true, 'data', v_rows, 'summary', v_summary);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_event_rsvps_with_session(text, uuid, text) TO authenticated, anon;

-- =============================================================================
-- SECTION 7: submit_event_rsvp — accept + validate new fields
-- =============================================================================

CREATE OR REPLACE FUNCTION public.submit_event_rsvp(
  p_event_slug text,
  p_full_name  text,
  p_email      text,
  p_phone      text DEFAULT NULL,
  p_company    text DEFAULT NULL,
  p_notes      text DEFAULT NULL,
  p_session_token text DEFAULT NULL,
  p_gender          text DEFAULT NULL,
  p_meal_preference text DEFAULT NULL,
  p_profession      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event public.events%ROWTYPE;
  v_actor_id uuid;
  v_full_name text;
  v_email text;
  v_phone text;
  v_company text;
  v_notes text;
  v_gender text;
  v_meal text;
  v_profession text;
  v_now timestamptz := now();
  v_deadline timestamptz;
  v_used integer := 0;
  v_existing public.event_rsvps%ROWTYPE;
  v_new_id uuid;
BEGIN
  IF p_session_token IS NOT NULL AND length(trim(p_session_token)) > 0 THEN
    v_actor_id := public.resolve_custom_session_user_id(p_session_token);
  END IF;

  v_full_name := NULLIF(trim(COALESCE(p_full_name, '')), '');
  v_email := lower(NULLIF(trim(COALESCE(p_email, '')), ''));
  v_phone := NULLIF(trim(COALESCE(p_phone, '')), '');
  v_company := NULLIF(trim(COALESCE(p_company, '')), '');
  v_notes := NULLIF(trim(COALESCE(p_notes, '')), '');
  v_gender := lower(NULLIF(trim(COALESCE(p_gender, '')), ''));
  v_meal := lower(NULLIF(trim(COALESCE(p_meal_preference, '')), ''));
  v_profession := lower(NULLIF(trim(COALESCE(p_profession, '')), ''));

  IF v_full_name IS NULL OR length(v_full_name) > 200 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_full_name', 'error', 'Name is required (max 200 chars)');
  END IF;
  IF v_email IS NULL OR v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR length(v_email) > 254 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_email', 'error', 'A valid email is required');
  END IF;
  IF v_phone IS NOT NULL AND length(v_phone) > 40 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_phone', 'error', 'Phone is too long');
  END IF;
  IF v_company IS NOT NULL AND length(v_company) > 200 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_company', 'error', 'Company is too long');
  END IF;
  IF v_notes IS NOT NULL AND length(v_notes) > 1000 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_notes', 'error', 'Notes too long (max 1000 chars)');
  END IF;

  IF v_gender IS NOT NULL AND v_gender NOT IN ('male','female','other','prefer_not_to_say') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_gender', 'error', 'Invalid gender value');
  END IF;
  IF v_meal IS NOT NULL AND v_meal NOT IN ('veg','non_veg') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_meal_preference', 'error', 'Invalid meal preference');
  END IF;
  IF v_profession IS NOT NULL AND v_profession NOT IN ('company_owner','director','official','other','partner','student') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_profession', 'error', 'Invalid profession');
  END IF;

  SELECT * INTO v_event FROM public.events
  WHERE slug = p_event_slug AND status = 'published';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'event_not_found', 'error', 'Event not found');
  END IF;

  IF NOT v_event.rsvp_enabled THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'rsvp_closed', 'error', 'RSVP is not open for this event');
  END IF;

  IF v_event.visibility = 'member_only' THEN
    IF v_actor_id IS NULL OR NOT public.is_member_or_both_account(v_actor_id) THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'permission_denied', 'error', 'This event is for members only. Please sign in.');
    END IF;
  END IF;

  IF v_event.rsvp_require_login THEN
    IF v_actor_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'login_required', 'error', 'Please sign in to RSVP for this event.');
    END IF;
  END IF;

  -- Required-when-collected enforcement
  IF v_event.rsvp_collect_gender AND v_gender IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'gender_required', 'error', 'Gender is required for this event');
  END IF;
  IF v_event.rsvp_collect_meal AND v_meal IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'meal_required', 'error', 'Meal preference is required for this event');
  END IF;
  IF v_event.rsvp_collect_profession AND v_profession IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'profession_required', 'error', 'Profession is required for this event');
  END IF;

  v_deadline := COALESCE(v_event.rsvp_deadline_at, v_event.start_at);
  IF v_deadline IS NOT NULL AND v_deadline <= v_now THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'rsvp_deadline_passed', 'error', 'The RSVP deadline has passed');
  END IF;

  -- Idempotent: same email + active row → return that row.
  SELECT * INTO v_existing FROM public.event_rsvps
  WHERE event_id = v_event.id
    AND lower(email) = v_email
    AND status IN ('confirmed','pending','waitlisted')
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'rsvp_id', v_existing.id, 'status', v_existing.status, 'duplicate', true);
  END IF;

  IF v_event.rsvp_capacity IS NOT NULL THEN
    SELECT COUNT(*)::integer INTO v_used FROM public.event_rsvps r
    WHERE r.event_id = v_event.id AND r.status = 'confirmed';
    IF v_used >= v_event.rsvp_capacity THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'capacity_full', 'error', 'This event is full');
    END IF;
  END IF;

  INSERT INTO public.event_rsvps (
    event_id, user_id, full_name, email, phone, company, notes, status,
    gender, meal_preference, profession
  )
  VALUES (
    v_event.id, v_actor_id, v_full_name, v_email, v_phone, v_company, v_notes, 'confirmed',
    v_gender, v_meal, v_profession
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('success', true, 'rsvp_id', v_new_id, 'status', 'confirmed', 'duplicate', false);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error_code', 'unexpected_error', 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_event_rsvp(text, text, text, text, text, text, text, text, text, text) TO anon, authenticated;

COMMENT ON FUNCTION public.submit_event_rsvp(text, text, text, text, text, text, text, text, text, text) IS
  'Public RSVP submission v2. Adds optional gender / meal_preference / profession with required-when-collected enforcement.';
