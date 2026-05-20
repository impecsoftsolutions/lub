/*
  # Short URL enable/disable toggle + permanence enforcement
  (COD-SHORT-URL-ENABLE-DISABLE-089)

  Purpose:
  - Replace the short URL refresh (regenerate) action with a permanent enable/disable toggle.
  - Short URL codes are now immutable once generated; only enabled/disabled state changes.
  - Resolvers now check short_url_enabled so disabled short URLs redirect to an error.
  - New set_*_short_url_enabled_with_session RPCs handle the toggle.
  - Refresh RPCs are neutered to return a clear error (function signatures preserved).
  - get_activity_by_id_with_session and get_event_by_id_with_session now include
    short_url_enabled (and get_event_by_id_with_session also includes short_url_code).
  - get_activity_by_slug now includes short_url_enabled.
*/

-- =============================================================================
-- SECTION 1: Schema — add short_url_enabled to activities + events
-- =============================================================================

ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS short_url_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.activities.short_url_enabled IS
  'When false the short redirect /a/:code returns not-found even though the code is preserved in DB.';

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS short_url_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.events.short_url_enabled IS
  'When false the short redirect /r/:code returns not-found even though the code is preserved in DB.';

-- =============================================================================
-- SECTION 2: Resolver — resolve_activity_short_url (respect enabled flag)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.resolve_activity_short_url(
  p_short_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text := lower(btrim(COALESCE(p_short_code, '')));
  v_row  record;
BEGIN
  IF v_code = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'invalid_code',
      'error', 'Short URL code is required'
    );
  END IF;

  SELECT a.slug, a.short_url_enabled
  INTO v_row
  FROM public.activities a
  WHERE lower(a.short_url_code) = v_code
    AND a.status = 'published'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'not_found',
      'error', 'Short URL not found'
    );
  END IF;

  IF NOT v_row.short_url_enabled THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'short_url_disabled',
      'error', 'Short URL is currently disabled'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'slug', v_row.slug,
      'short_code', v_code,
      'target_path', '/events/' || v_row.slug
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_activity_short_url(text) TO anon, authenticated;

-- =============================================================================
-- SECTION 3: Resolver — resolve_event_short_url (respect enabled flag)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.resolve_event_short_url(
  p_short_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text := lower(btrim(COALESCE(p_short_code, '')));
  v_row  record;
BEGIN
  IF v_code = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'invalid_code',
      'error', 'Short URL code is required'
    );
  END IF;

  SELECT e.slug, e.short_url_enabled
  INTO v_row
  FROM public.events e
  WHERE lower(e.short_url_code) = v_code
    AND e.status = 'published'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'not_found',
      'error', 'Short URL not found'
    );
  END IF;

  IF NOT v_row.short_url_enabled THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'short_url_disabled',
      'error', 'Short URL is currently disabled'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'slug', v_row.slug,
      'short_code', v_code,
      'target_path', '/events/' || v_row.slug
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_event_short_url(text) TO anon, authenticated;

-- =============================================================================
-- SECTION 4: Neuter refresh RPCs — return error, preserve signatures
-- =============================================================================

CREATE OR REPLACE FUNCTION public.refresh_activity_short_url_with_session(
  p_session_token text,
  p_activity_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Short URL codes are now permanent. Refresh is no longer supported.
  -- Use set_activity_short_url_enabled_with_session to enable/disable instead.
  RETURN jsonb_build_object(
    'success', false,
    'error_code', 'short_url_refresh_disabled',
    'error', 'Short URL refresh is disabled. Short URLs are permanent. Use enable/disable instead.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_activity_short_url_with_session(text, uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.refresh_event_short_url_with_session(
  p_session_token text,
  p_event_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Short URL codes are now permanent. Refresh is no longer supported.
  -- Use set_event_short_url_enabled_with_session to enable/disable instead.
  RETURN jsonb_build_object(
    'success', false,
    'error_code', 'short_url_refresh_disabled',
    'error', 'Short URL refresh is disabled. Short URLs are permanent. Use enable/disable instead.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_event_short_url_with_session(text, uuid) TO anon, authenticated;

-- =============================================================================
-- SECTION 5: Toggle RPC — set_activity_short_url_enabled_with_session
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_activity_short_url_enabled_with_session(
  p_session_token text,
  p_activity_id   uuid,
  p_enabled       boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id   uuid;
  v_activity   public.activities%ROWTYPE;
  v_short_code text;
BEGIN
  v_actor_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_session', 'error', 'Invalid session');
  END IF;

  SELECT * INTO v_activity FROM public.activities WHERE id = p_activity_id LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'not_found', 'error', 'Activity not found');
  END IF;

  -- Permission check: edit_any or edit_own
  IF NOT public.has_permission(v_actor_id, 'activities.edit_any') THEN
    IF NOT public.has_permission(v_actor_id, 'activities.edit_own') THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'permission_denied', 'error', 'Not authorized');
    END IF;
    IF v_activity.created_by IS DISTINCT FROM v_actor_id THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'permission_denied', 'error', 'Not authorized');
    END IF;
  END IF;

  v_short_code := lower(btrim(COALESCE(v_activity.short_url_code, '')));

  -- When enabling: generate a code once if missing (should never happen due to trigger, but safe)
  IF p_enabled AND v_short_code = '' THEN
    v_short_code := public.generate_unique_activity_short_url_code(v_activity.id);
    UPDATE public.activities
    SET short_url_code    = v_short_code,
        short_url_enabled = true,
        updated_at        = now()
    WHERE id = v_activity.id;
  ELSE
    -- Just flip the enabled flag; NEVER change the existing code
    UPDATE public.activities
    SET short_url_enabled = p_enabled,
        updated_at        = now()
    WHERE id = v_activity.id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'activity_id',      v_activity.id,
      'short_url_enabled', p_enabled,
      'short_code',       CASE WHEN v_short_code = '' THEN NULL ELSE v_short_code END
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_activity_short_url_enabled_with_session(text, uuid, boolean) TO anon, authenticated;

-- =============================================================================
-- SECTION 6: Toggle RPC — set_event_short_url_enabled_with_session
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_event_short_url_enabled_with_session(
  p_session_token text,
  p_event_id      uuid,
  p_enabled       boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id   uuid;
  v_event      public.events%ROWTYPE;
  v_short_code text;
BEGIN
  v_actor_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_session', 'error', 'Invalid session');
  END IF;

  SELECT * INTO v_event FROM public.events WHERE id = p_event_id LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'not_found', 'error', 'Event not found');
  END IF;

  -- Permission check: edit_any or edit_own
  IF NOT public.has_permission(v_actor_id, 'events.edit_any') THEN
    IF NOT public.has_permission(v_actor_id, 'events.edit_own') THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'permission_denied', 'error', 'Not authorized');
    END IF;
    IF v_event.created_by IS DISTINCT FROM v_actor_id THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'permission_denied', 'error', 'Not authorized');
    END IF;
  END IF;

  v_short_code := lower(btrim(COALESCE(v_event.short_url_code, '')));

  -- When enabling: generate a code once if missing (should never happen due to trigger, but safe)
  IF p_enabled AND v_short_code = '' THEN
    v_short_code := public.generate_unique_event_short_url_code(v_event.id);
    UPDATE public.events
    SET short_url_code    = v_short_code,
        short_url_enabled = true,
        updated_at        = now()
    WHERE id = v_event.id;
  ELSE
    -- Just flip the enabled flag; NEVER change the existing code
    UPDATE public.events
    SET short_url_enabled = p_enabled,
        updated_at        = now()
    WHERE id = v_event.id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'event_id',          v_event.id,
      'short_url_enabled', p_enabled,
      'short_code',        CASE WHEN v_short_code = '' THEN NULL ELSE v_short_code END
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_event_short_url_enabled_with_session(text, uuid, boolean) TO anon, authenticated;

-- =============================================================================
-- SECTION 7: Read RPC — get_activity_by_slug (add short_url_enabled)
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
      'id',                v_activity.id,
      'slug',              v_activity.slug,
      'short_url_code',    v_activity.short_url_code,
      'short_url_enabled', v_activity.short_url_enabled,
      'share_message',     v_activity.share_message,
      'title',             v_activity.title,
      'excerpt',           v_activity.excerpt,
      'description',       v_activity.description,
      'activity_date',     v_activity.activity_date,
      'start_at',          v_activity.start_at,
      'end_at',            v_activity.end_at,
      'location',          v_activity.location,
      'cover_image_url',   public.activity_cover_seed_url(COALESCE(NULLIF(v_activity.cover_image_url, ''), v_first_media_url)),
      'is_featured',       v_activity.is_featured,
      'youtube_urls',      v_activity.youtube_urls,
      'published_at',      v_activity.published_at,
      'media',             COALESCE(v_media, '[]'::jsonb)
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_activity_by_slug(text) TO anon, authenticated;

-- =============================================================================
-- SECTION 8: Read RPC — get_activity_by_id_with_session (add short_url_enabled)
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
  v_actor_id    uuid;
  v_activity    public.activities%ROWTYPE;
  v_source_event public.events%ROWTYPE;
  v_media       jsonb;
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
      'short_url_code',            v_activity.short_url_code,
      'short_url_enabled',         v_activity.short_url_enabled,
      'share_message',             v_activity.share_message,
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

-- =============================================================================
-- SECTION 9: Read RPC — get_event_by_id_with_session
--            (add short_url_code + short_url_enabled; preserve all other fields)
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
  v_assets jsonb;
  v_collect_email boolean;
  v_require_email boolean;
  v_collect_note boolean;
  v_require_note boolean;
  v_require_phone boolean;
  v_require_company boolean;
  v_require_gender boolean;
  v_require_meal boolean;
  v_require_profession boolean;
  v_require_designation boolean;
BEGIN
  v_actor_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT (
    public.has_permission(v_actor_id, 'events.view')
    OR public.has_permission(v_actor_id, 'events.rsvp.view')
    OR public.has_permission(v_actor_id, 'events.rsvp.manage')
  ) THEN
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

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.kind, t.display_order, t.created_at), '[]'::jsonb)
  INTO v_assets
  FROM (
    SELECT id, kind, storage_path, public_url, label, byte_size, mime_type, display_order, created_at
    FROM public.event_assets
    WHERE event_id = v_event.id
  ) t;

  v_collect_email := COALESCE((v_event.ai_metadata->>'rsvp_collect_email')::boolean, true);
  v_require_email := v_collect_email AND COALESCE((v_event.ai_metadata->>'rsvp_require_email')::boolean, false);
  v_collect_note := COALESCE((v_event.ai_metadata->>'rsvp_collect_note')::boolean, false);
  v_require_note := v_collect_note AND COALESCE((v_event.ai_metadata->>'rsvp_require_note')::boolean, false);
  v_require_phone := COALESCE((v_event.ai_metadata->>'rsvp_require_phone')::boolean, v_event.rsvp_collect_phone);
  v_require_company := COALESCE((v_event.ai_metadata->>'rsvp_require_company')::boolean, v_event.rsvp_collect_company);
  v_require_gender := COALESCE((v_event.ai_metadata->>'rsvp_require_gender')::boolean, v_event.rsvp_collect_gender);
  v_require_meal := COALESCE((v_event.ai_metadata->>'rsvp_require_meal')::boolean, v_event.rsvp_collect_meal);
  v_require_profession := COALESCE((v_event.ai_metadata->>'rsvp_require_profession')::boolean, v_event.rsvp_collect_profession);
  v_require_designation := v_event.rsvp_collect_designation
    AND COALESCE((v_event.ai_metadata->>'rsvp_require_designation')::boolean, false);

  RETURN jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'id',                  v_event.id,
      'slug',                v_event.slug,
      'short_url_code',      v_event.short_url_code,
      'short_url_enabled',   v_event.short_url_enabled,
      'title',               v_event.title,
      'excerpt',             v_event.excerpt,
      'description',         v_event.description,
      'event_type',          v_event.event_type,
      'visibility',          v_event.visibility,
      'status',              v_event.status,
      'is_featured',         v_event.is_featured,
      'start_at',            v_event.start_at,
      'end_at',              v_event.end_at,
      'location',            v_event.location,
      'venue_map_url',       v_event.venue_map_url,
      'whatsapp_invitation_message', v_event.whatsapp_invitation_message,
      'invitation_text',     v_event.invitation_text,
      'agenda_items',        COALESCE(v_event.agenda_items, '[]'::jsonb),
      'show_agenda_publicly', v_event.show_agenda_publicly,
      'slug_locked',         v_event.slug_locked,
      'ai_metadata',         v_event.ai_metadata,
      'banner_image_url',    v_event.banner_image_url,
      'banner_object_key',   v_event.banner_object_key,
      'assets',              v_assets,
      'rsvp', jsonb_build_object(
        'enabled',            v_event.rsvp_enabled,
        'capacity',           v_event.rsvp_capacity,
        'capacity_mode',      v_event.capacity_mode,
        'per_day_capacity',   v_event.per_day_capacity,
        'deadline_at',        v_event.rsvp_deadline_at,
        'collect_email',      v_collect_email,
        'collect_phone',      v_event.rsvp_collect_phone,
        'collect_company',    v_event.rsvp_collect_company,
        'collect_gender',     v_event.rsvp_collect_gender,
        'collect_meal',       v_event.rsvp_collect_meal,
        'collect_profession', v_event.rsvp_collect_profession,
        'collect_note',       v_collect_note,
        'collect_designation', v_event.rsvp_collect_designation,
        'collect_aadhaar',    v_event.rsvp_collect_aadhaar,
        'require_email',      v_require_email,
        'require_phone',      v_require_phone,
        'require_company',    v_require_company,
        'require_gender',     v_require_gender,
        'require_meal',       v_require_meal,
        'require_profession', v_require_profession,
        'require_note',       v_require_note,
        'require_designation', v_require_designation,
        'require_aadhaar',    v_event.rsvp_collect_aadhaar AND v_event.rsvp_require_aadhaar,
        'require_login',      v_event.rsvp_require_login,
        'used_count',         v_used
      ),
      'bridge', jsonb_build_object(
        'activity_id', v_bridged_activity,
        'has_activity', v_bridged_activity IS NOT NULL
      ),
      'created_by',   v_event.created_by,
      'published_by', v_event.published_by,
      'published_at', v_event.published_at,
      'created_at',   v_event.created_at,
      'updated_at',   v_event.updated_at
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_event_by_id_with_session(text, uuid)
  TO authenticated, anon;

-- =============================================================================
-- SECTION 10: Schema reload
-- =============================================================================

NOTIFY pgrst, 'reload schema';
