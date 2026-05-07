/*
  # Events short share URL (COD-EVENTS-SHORT-URL-077)

  Purpose:
  - Provide a permanent, short website URL for published events that survives
    slug changes.
  - Allow admins to refresh/regenerate the short URL when needed.
  - Keep short URL as a redirect-only surface for visitors.
*/

-- =============================================================================
-- SECTION 1: Schema
-- =============================================================================

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS short_url_code text;

COMMENT ON COLUMN public.events.short_url_code IS
  'Permanent short redirect code for published event sharing (e.g., /r/abc123x).';

-- =============================================================================
-- SECTION 2: Code generation helpers
-- =============================================================================

CREATE OR REPLACE FUNCTION public.gen_event_short_url_code_candidate()
RETURNS text
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  v_chars constant text := '23456789abcdefghjkmnpqrstuvwxyz';
  v_code text := '';
  v_i integer;
BEGIN
  -- 7-char base32-like token (no ambiguous 0/O/1/I)
  FOR v_i IN 1..7 LOOP
    v_code := v_code || substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1);
  END LOOP;
  RETURN v_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_unique_event_short_url_code(
  p_exclude_event_id uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  v_code text;
  v_attempt integer := 0;
BEGIN
  LOOP
    v_attempt := v_attempt + 1;
    v_code := public.gen_event_short_url_code_candidate();

    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.events e
      WHERE lower(e.short_url_code) = lower(v_code)
        AND (p_exclude_event_id IS NULL OR e.id <> p_exclude_event_id)
    );

    IF v_attempt >= 50 THEN
      RAISE EXCEPTION 'Could not generate unique event short URL code after % attempts', v_attempt;
    END IF;
  END LOOP;

  RETURN lower(v_code);
END;
$$;

-- =============================================================================
-- SECTION 3: Trigger to auto-seed short code on insert
-- =============================================================================

CREATE OR REPLACE FUNCTION public.events_before_insert_set_short_url_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.short_url_code IS NULL OR btrim(NEW.short_url_code) = '' THEN
    NEW.short_url_code := public.generate_unique_event_short_url_code(NEW.id);
  ELSE
    NEW.short_url_code := lower(btrim(NEW.short_url_code));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS events_before_insert_set_short_url_code ON public.events;
CREATE TRIGGER events_before_insert_set_short_url_code
BEFORE INSERT ON public.events
FOR EACH ROW
EXECUTE FUNCTION public.events_before_insert_set_short_url_code();

-- Backfill existing rows.
UPDATE public.events e
SET short_url_code = public.generate_unique_event_short_url_code(e.id)
WHERE e.short_url_code IS NULL OR btrim(e.short_url_code) = '';

-- Normalize existing non-null values to lowercase.
UPDATE public.events
SET short_url_code = lower(btrim(short_url_code))
WHERE short_url_code IS NOT NULL
  AND short_url_code <> lower(btrim(short_url_code));

CREATE UNIQUE INDEX IF NOT EXISTS events_short_url_code_uidx
  ON public.events (lower(short_url_code));

-- =============================================================================
-- SECTION 4: Public resolver (redirect target)
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
  v_slug text;
BEGIN
  IF v_code = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'invalid_code',
      'error', 'Short URL code is required'
    );
  END IF;

  SELECT e.slug
  INTO v_slug
  FROM public.events e
  WHERE lower(e.short_url_code) = v_code
    AND e.status = 'published'
  LIMIT 1;

  IF v_slug IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'not_found',
      'error', 'Short URL not found'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'slug', v_slug,
      'short_code', v_code,
      'target_path', '/events/' || v_slug
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_event_short_url(text) TO anon, authenticated;

-- =============================================================================
-- SECTION 5: Admin wrappers (ensure + refresh)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.ensure_event_short_url_with_session(
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
  v_short_code text;
BEGIN
  v_actor_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_session', 'error', 'Invalid session');
  END IF;

  IF NOT (
    public.has_permission(v_actor_id, 'events.view')
    OR public.has_permission(v_actor_id, 'events.rsvp.view')
    OR public.has_permission(v_actor_id, 'events.rsvp.manage')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'permission_denied', 'error', 'Not authorized');
  END IF;

  SELECT * INTO v_event FROM public.events WHERE id = p_event_id LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'not_found', 'error', 'Event not found');
  END IF;

  v_short_code := lower(btrim(COALESCE(v_event.short_url_code, '')));
  IF v_short_code = '' THEN
    v_short_code := public.generate_unique_event_short_url_code(v_event.id);
    UPDATE public.events
    SET short_url_code = v_short_code,
        updated_at = now()
    WHERE id = v_event.id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'event_id', v_event.id,
      'short_code', v_short_code
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_event_short_url_with_session(text, uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.refresh_event_short_url_with_session(
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

  IF NOT public.has_permission(v_actor_id, 'events.edit_any') THEN
    IF NOT public.has_permission(v_actor_id, 'events.edit_own') THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'permission_denied', 'error', 'Not authorized');
    END IF;
    IF v_event.created_by IS DISTINCT FROM v_actor_id THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'permission_denied', 'error', 'Not authorized');
    END IF;
  END IF;

  v_short_code := public.generate_unique_event_short_url_code(v_event.id);
  UPDATE public.events
  SET short_url_code = v_short_code,
      updated_at = now()
  WHERE id = v_event.id;

  RETURN jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'event_id', v_event.id,
      'short_code', v_short_code
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_event_short_url_with_session(text, uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

