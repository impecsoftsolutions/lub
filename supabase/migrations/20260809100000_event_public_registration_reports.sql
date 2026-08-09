/*
  # COD-EVENT-PUBLIC-REPORT-001

  Password-protected public event registration reports.

  Security model:
  - Report tokens, password hashes, field allowlists, and short-lived view tokens
    live outside public.events in RLS-enabled tables with no browser policies.
  - Admin reads/writes derive the actor from the custom session token and enforce
    events edit permissions server-side.
  - The public password RPC never accepts a custom session token. It exchanges a
    valid report token/password for a two-hour bearer view token.
  - Row responses are built from an explicit object and filtered server-side so
    fields outside the current admin allowlist never reach the browser.
  - Aadhaar is intentionally not part of the public-report field universe.
*/

-- =============================================================================
-- 1. Private report configuration and short-lived public view sessions
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.event_public_reports (
  event_id uuid PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  password_hash text,
  fields text[] NOT NULL DEFAULT ARRAY['full_name', 'badge_code']::text[],
  is_enabled boolean NOT NULL DEFAULT false,
  failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  CONSTRAINT event_public_reports_token_format_check CHECK (token ~ '^[0-9a-f]{32}$'),
  CONSTRAINT event_public_reports_fields_not_empty_check CHECK (cardinality(fields) > 0)
);

CREATE TABLE IF NOT EXISTS public.event_public_report_view_sessions (
  view_token text PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_public_report_view_token_format_check CHECK (view_token ~ '^[0-9a-f]{32}$')
);

CREATE INDEX IF NOT EXISTS event_public_report_view_sessions_event_id_idx
  ON public.event_public_report_view_sessions(event_id);
CREATE INDEX IF NOT EXISTS event_public_report_view_sessions_expires_at_idx
  ON public.event_public_report_view_sessions(expires_at);

ALTER TABLE public.event_public_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_public_report_view_sessions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.event_public_reports FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.event_public_report_view_sessions FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.event_public_reports IS
  'Private per-event public registration-report configuration. Browser access is RPC-only.';
COMMENT ON TABLE public.event_public_report_view_sessions IS
  'Private two-hour bearer sessions minted after a successful public report password check.';

-- =============================================================================
-- 2. Token invariant for every event, including existing events
-- =============================================================================

CREATE OR REPLACE FUNCTION public.ensure_event_public_report_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  INSERT INTO public.event_public_reports (event_id, token)
  VALUES (NEW.id, encode(extensions.gen_random_bytes(16), 'hex'))
  ON CONFLICT (event_id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_event_public_report_row() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS events_after_insert_ensure_public_report ON public.events;
CREATE TRIGGER events_after_insert_ensure_public_report
AFTER INSERT ON public.events
FOR EACH ROW
EXECUTE FUNCTION public.ensure_event_public_report_row();

INSERT INTO public.event_public_reports (event_id, token)
SELECT e.id, encode(extensions.gen_random_bytes(16), 'hex')
FROM public.events e
LEFT JOIN public.event_public_reports r ON r.event_id = e.id
WHERE r.event_id IS NULL;

-- =============================================================================
-- 3. Canonical field catalog and current event eligibility
-- =============================================================================

CREATE OR REPLACE FUNCTION public.event_report_available_fields(p_event_id uuid)
RETURNS TABLE (
  field_key text,
  label text,
  display_order integer,
  is_sensitive boolean,
  is_available boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  WITH event_config AS (
    SELECT
      e.*,
      CASE
        WHEN e.ai_metadata ? 'rsvp_collect_email'
          THEN lower(btrim(COALESCE(e.ai_metadata->>'rsvp_collect_email', ''))) IN ('true','t','1','yes','y','on')
        ELSE true
      END AS collect_email_safe,
      CASE
        WHEN e.ai_metadata ? 'rsvp_collect_note'
          THEN lower(btrim(COALESCE(e.ai_metadata->>'rsvp_collect_note', ''))) IN ('true','t','1','yes','y','on')
        ELSE false
      END AS collect_note_safe,
      (
        e.start_at IS NOT NULL
        AND (COALESCE(e.end_at, e.start_at) AT TIME ZONE 'Asia/Kolkata')::date
          > (e.start_at AT TIME ZONE 'Asia/Kolkata')::date
      ) AS is_multi_day
    FROM public.events e
    WHERE e.id = p_event_id
  ), catalog(field_key, label, display_order, is_sensitive) AS (
    VALUES
      ('full_name'::text,       'Name'::text,                   10, false),
      ('email'::text,           'Email'::text,                  20, true),
      ('phone'::text,           'Mobile'::text,                 30, true),
      ('company'::text,         'Company / Organization'::text, 40, false),
      ('gender'::text,          'Gender'::text,                 50, true),
      ('meal_preference'::text, 'Meal Preference'::text,        60, true),
      ('profession'::text,      'Profession'::text,             70, false),
      ('designation'::text,     'Designation'::text,            80, false),
      ('notes'::text,           'Note'::text,                   90, false),
      ('visit_date'::text,      'Day of Visit'::text,          100, false),
      ('badge_code'::text,      'Badge Number'::text,          110, false)
  )
  SELECT
    c.field_key,
    c.label,
    c.display_order,
    c.is_sensitive,
    CASE c.field_key
      WHEN 'full_name'       THEN true
      WHEN 'email'           THEN e.collect_email_safe
      WHEN 'phone'           THEN COALESCE(e.rsvp_collect_phone, false)
      WHEN 'company'         THEN COALESCE(e.rsvp_collect_company, false)
      WHEN 'gender'          THEN COALESCE(e.rsvp_collect_gender, false)
      WHEN 'meal_preference' THEN COALESCE(e.rsvp_collect_meal, false)
      WHEN 'profession'      THEN COALESCE(e.rsvp_collect_profession, false)
      WHEN 'designation'     THEN COALESCE(e.rsvp_collect_designation, false)
      WHEN 'notes'           THEN e.collect_note_safe
      WHEN 'visit_date'      THEN e.is_multi_day
      WHEN 'badge_code'      THEN true
      ELSE false
    END AS is_available
  FROM event_config e
  CROSS JOIN catalog c
  ORDER BY c.display_order;
$$;

REVOKE ALL ON FUNCTION public.event_report_available_fields(uuid) FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- 4. Internal settings mutation helper (not browser executable)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.apply_event_public_report_settings_internal(
  p_actor_id uuid,
  p_event_id uuid,
  p_password text,
  p_selected_fields text[],
  p_is_enabled boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_report public.event_public_reports%ROWTYPE;
  v_normalized_fields text[];
  v_new_hash text;
BEGIN
  IF COALESCE(cardinality(p_selected_fields), 0) = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'fields_required',
      'error', 'Select at least one report field'
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(p_selected_fields) requested(field_key)
    WHERE requested.field_key IS NULL
       OR NOT EXISTS (
         SELECT 1
         FROM public.event_report_available_fields(p_event_id) available
         WHERE available.field_key = requested.field_key
           AND available.is_available
       )
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'invalid_fields',
      'error', 'One or more selected fields are not collected for this event'
    );
  END IF;

  SELECT array_agg(f.field_key ORDER BY f.display_order)
  INTO v_normalized_fields
  FROM public.event_report_available_fields(p_event_id) f
  WHERE f.is_available
    AND f.field_key = ANY(p_selected_fields);

  SELECT *
  INTO v_report
  FROM public.event_public_reports
  WHERE event_id = p_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'report_not_found',
      'error', 'Event report configuration not found'
    );
  END IF;

  IF p_password IS NOT NULL THEN
    IF btrim(p_password) = '' THEN
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'invalid_password',
        'error', 'Password cannot be blank'
      );
    END IF;
    IF length(p_password) > 200 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'invalid_password',
        'error', 'Password is too long'
      );
    END IF;
    v_new_hash := extensions.crypt(p_password, extensions.gen_salt('bf', 10));
  ELSE
    v_new_hash := v_report.password_hash;
  END IF;

  IF COALESCE(p_is_enabled, false) AND v_new_hash IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'password_required',
      'error', 'Set a password before enabling the report'
    );
  END IF;

  UPDATE public.event_public_reports
  SET password_hash = v_new_hash,
      fields = v_normalized_fields,
      is_enabled = COALESCE(p_is_enabled, false),
      failed_attempts = 0,
      locked_until = NULL,
      updated_at = now(),
      updated_by = p_actor_id
  WHERE event_id = p_event_id;

  IF p_password IS NOT NULL OR NOT COALESCE(p_is_enabled, false) THEN
    DELETE FROM public.event_public_report_view_sessions
    WHERE event_id = p_event_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'event_id', p_event_id,
      'is_enabled', COALESCE(p_is_enabled, false),
      'password_configured', v_new_hash IS NOT NULL,
      'selected_fields', to_jsonb(v_normalized_fields)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_event_public_report_settings_internal(uuid, uuid, text, text[], boolean)
  FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- 5. Admin read/write RPCs and atomic event-create wrapper
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_event_public_report_settings_with_session(
  p_session_token text,
  p_event_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_actor_id uuid;
  v_owner_id uuid;
  v_report public.event_public_reports%ROWTYPE;
  v_fields jsonb;
BEGIN
  v_actor_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_session', 'error', 'Invalid session');
  END IF;

  SELECT created_by INTO v_owner_id FROM public.events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'event_not_found', 'error', 'Event not found');
  END IF;

  IF NOT public.has_permission(v_actor_id, 'events.edit_any')
     AND NOT (public.has_permission(v_actor_id, 'events.edit_own') AND v_owner_id = v_actor_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'permission_denied', 'error', 'Not authorized');
  END IF;

  SELECT * INTO v_report
  FROM public.event_public_reports
  WHERE event_id = p_event_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'report_not_found', 'error', 'Event report configuration not found');
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'key', f.field_key,
        'label', f.label,
        'is_sensitive', f.is_sensitive,
        'is_available', f.is_available
      ) ORDER BY f.display_order
    ),
    '[]'::jsonb
  )
  INTO v_fields
  FROM public.event_report_available_fields(p_event_id) f
  WHERE f.is_available OR f.field_key = ANY(v_report.fields);

  RETURN jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'token', v_report.token,
      'is_enabled', v_report.is_enabled,
      'password_configured', v_report.password_hash IS NOT NULL,
      'selected_fields', to_jsonb(v_report.fields),
      'available_fields', v_fields,
      'locked_until', v_report.locked_until
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_event_public_report_settings_with_session(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_event_public_report_settings_with_session(text, uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.update_event_public_report_settings_with_session(
  p_session_token text,
  p_event_id uuid,
  p_password text,
  p_selected_fields text[],
  p_is_enabled boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_actor_id uuid;
  v_owner_id uuid;
BEGIN
  v_actor_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_session', 'error', 'Invalid session');
  END IF;

  SELECT created_by INTO v_owner_id FROM public.events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'event_not_found', 'error', 'Event not found');
  END IF;

  IF NOT public.has_permission(v_actor_id, 'events.edit_any')
     AND NOT (public.has_permission(v_actor_id, 'events.edit_own') AND v_owner_id = v_actor_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'permission_denied', 'error', 'Not authorized');
  END IF;

  RETURN public.apply_event_public_report_settings_internal(
    v_actor_id,
    p_event_id,
    p_password,
    p_selected_fields,
    p_is_enabled
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_event_public_report_settings_with_session(text, uuid, text, text[], boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_event_public_report_settings_with_session(text, uuid, text, text[], boolean)
  TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.regenerate_event_public_report_token_with_session(
  p_session_token text,
  p_event_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_actor_id uuid;
  v_owner_id uuid;
  v_token text;
BEGIN
  v_actor_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_session', 'error', 'Invalid session');
  END IF;

  SELECT created_by INTO v_owner_id FROM public.events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'event_not_found', 'error', 'Event not found');
  END IF;

  IF NOT public.has_permission(v_actor_id, 'events.edit_any')
     AND NOT (public.has_permission(v_actor_id, 'events.edit_own') AND v_owner_id = v_actor_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'permission_denied', 'error', 'Not authorized');
  END IF;

  v_token := encode(extensions.gen_random_bytes(16), 'hex');

  UPDATE public.event_public_reports
  SET token = v_token,
      failed_attempts = 0,
      locked_until = NULL,
      updated_at = now(),
      updated_by = v_actor_id
  WHERE event_id = p_event_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'report_not_found', 'error', 'Event report configuration not found');
  END IF;

  DELETE FROM public.event_public_report_view_sessions WHERE event_id = p_event_id;

  RETURN jsonb_build_object('success', true, 'data', jsonb_build_object('token', v_token));
END;
$$;

REVOKE ALL ON FUNCTION public.regenerate_event_public_report_token_with_session(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.regenerate_event_public_report_token_with_session(text, uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_event_with_public_report_with_session(
  p_session_token text,
  p_payload jsonb,
  p_report_password text,
  p_selected_fields text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_actor_id uuid;
  v_created jsonb;
  v_settings jsonb;
  v_event_id uuid;
  v_failure jsonb;
BEGIN
  v_actor_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_session', 'error', 'Invalid session');
  END IF;

  v_created := public.create_event_with_session(p_session_token, p_payload);
  IF NOT COALESCE((v_created->>'success')::boolean, false) THEN
    RETURN v_created;
  END IF;

  v_event_id := COALESCE(NULLIF(v_created->>'event_id', '')::uuid, NULLIF(v_created->>'id', '')::uuid);
  IF v_event_id IS NULL THEN
    v_failure := jsonb_build_object(
      'success', false,
      'error_code', 'event_create_contract_error',
      'error', 'Event creation returned no event id'
    );
    RAISE EXCEPTION 'Event creation returned no event id';
  END IF;

  v_settings := public.apply_event_public_report_settings_internal(
    v_actor_id,
    v_event_id,
    p_report_password,
    p_selected_fields,
    true
  );

  IF NOT COALESCE((v_settings->>'success')::boolean, false) THEN
    v_failure := v_settings;
    RAISE EXCEPTION 'Public report initialization failed';
  END IF;

  RETURN v_created || jsonb_build_object('public_report_initialized', true);
EXCEPTION WHEN OTHERS THEN
  IF v_failure IS NOT NULL THEN
    RETURN v_failure;
  END IF;
  RETURN jsonb_build_object('success', false, 'error_code', 'unexpected_error', 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.create_event_with_public_report_with_session(text, jsonb, text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_event_with_public_report_with_session(text, jsonb, text, text[])
  TO anon, authenticated;

-- =============================================================================
-- 6. Public password exchange (bcrypt once per viewer session)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.open_public_event_report(
  p_token text,
  p_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_report public.event_public_reports%ROWTYPE;
  v_event public.events%ROWTYPE;
  v_fields jsonb;
  v_total bigint;
  v_view_token text;
  v_expires_at timestamptz;
  v_failed_attempts integer;
  v_locked_until timestamptz;
  v_dummy_hash constant text := '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
BEGIN
  SELECT * INTO v_report
  FROM public.event_public_reports
  WHERE token = lower(btrim(COALESCE(p_token, '')))
  FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM extensions.crypt(COALESCE(p_password, ''), v_dummy_hash);
    RETURN jsonb_build_object('success', false, 'error_code', 'access_denied', 'error', 'Invalid report link or password');
  END IF;

  IF NOT v_report.is_enabled OR v_report.password_hash IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'report_disabled', 'error', 'This report is not currently available');
  END IF;

  IF v_report.locked_until IS NOT NULL AND v_report.locked_until > now() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'temporarily_locked',
      'error', 'Too many incorrect attempts. Try again in a few minutes.'
    );
  END IF;

  IF v_report.locked_until IS NOT NULL AND v_report.locked_until <= now() THEN
    UPDATE public.event_public_reports
    SET failed_attempts = 0, locked_until = NULL
    WHERE event_id = v_report.event_id;
    v_report.failed_attempts := 0;
    v_report.locked_until := NULL;
  END IF;

  IF extensions.crypt(COALESCE(p_password, ''), v_report.password_hash) <> v_report.password_hash THEN
    UPDATE public.event_public_reports
    SET failed_attempts = failed_attempts + 1,
        locked_until = CASE
          WHEN failed_attempts + 1 >= 20 THEN now() + interval '10 minutes'
          ELSE NULL
        END,
        updated_at = now()
    WHERE event_id = v_report.event_id
    RETURNING failed_attempts, locked_until INTO v_failed_attempts, v_locked_until;

    IF v_locked_until IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'temporarily_locked',
        'error', 'Too many incorrect attempts. Try again in a few minutes.'
      );
    END IF;

    RETURN jsonb_build_object('success', false, 'error_code', 'access_denied', 'error', 'Invalid report link or password');
  END IF;

  UPDATE public.event_public_reports
  SET failed_attempts = 0,
      locked_until = NULL,
      updated_at = now()
  WHERE event_id = v_report.event_id;

  SELECT * INTO v_event FROM public.events WHERE id = v_report.event_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'access_denied', 'error', 'Invalid report link or password');
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('key', f.field_key, 'label', f.label)
      ORDER BY f.display_order
    ),
    '[]'::jsonb
  )
  INTO v_fields
  FROM public.event_report_available_fields(v_report.event_id) f
  WHERE f.is_available
    AND f.field_key = ANY(v_report.fields);

  SELECT COUNT(*) INTO v_total
  FROM public.event_rsvps r
  WHERE r.event_id = v_report.event_id
    AND r.status IN ('confirmed', 'pending', 'waitlisted');

  DELETE FROM public.event_public_report_view_sessions WHERE expires_at <= now();

  v_view_token := encode(extensions.gen_random_bytes(16), 'hex');
  v_expires_at := now() + interval '2 hours';

  INSERT INTO public.event_public_report_view_sessions (view_token, event_id, expires_at)
  VALUES (v_view_token, v_report.event_id, v_expires_at);

  RETURN jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'view_token', v_view_token,
      'expires_at', v_expires_at,
      'event', jsonb_build_object(
        'title', v_event.title,
        'location', v_event.location,
        'start_at', v_event.start_at,
        'end_at', v_event.end_at
      ),
      'fields', v_fields,
      'total', v_total
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.open_public_event_report(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.open_public_event_report(text, text) TO anon, authenticated;

-- =============================================================================
-- 7. Public scoped/paginated rows
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_public_event_report_rows(
  p_view_token text,
  p_field_keys text[] DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_event_id uuid;
  v_report public.event_public_reports%ROWTYPE;
  v_current_keys text[];
  v_effective_keys text[];
  v_current_fields jsonb;
  v_rows jsonb;
  v_total bigint := 0;
  v_fetch_limit integer;
  v_truncated boolean := false;
BEGIN
  SELECT s.event_id
  INTO v_event_id
  FROM public.event_public_report_view_sessions s
  WHERE s.view_token = lower(btrim(COALESCE(p_view_token, '')))
    AND s.expires_at > now();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'view_session_invalid', 'error', 'Report session expired');
  END IF;

  SELECT * INTO v_report
  FROM public.event_public_reports
  WHERE event_id = v_event_id;

  IF NOT FOUND OR NOT v_report.is_enabled THEN
    DELETE FROM public.event_public_report_view_sessions
    WHERE view_token = lower(btrim(COALESCE(p_view_token, '')));
    RETURN jsonb_build_object('success', false, 'error_code', 'report_disabled', 'error', 'This report is not currently available');
  END IF;

  SELECT
    array_agg(f.field_key ORDER BY f.display_order),
    COALESCE(
      jsonb_agg(jsonb_build_object('key', f.field_key, 'label', f.label) ORDER BY f.display_order),
      '[]'::jsonb
    )
  INTO v_current_keys, v_current_fields
  FROM public.event_report_available_fields(v_event_id) f
  WHERE f.is_available
    AND f.field_key = ANY(v_report.fields);

  IF COALESCE(cardinality(v_current_keys), 0) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'fields_unavailable', 'error', 'No report fields are currently available');
  END IF;

  IF p_field_keys IS NULL THEN
    v_effective_keys := v_current_keys;
  ELSE
    IF cardinality(p_field_keys) = 0 OR EXISTS (SELECT 1 FROM unnest(p_field_keys) k WHERE k IS NULL) THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'fields_required', 'error', 'Select at least one report field');
    END IF;

    IF EXISTS (
      SELECT 1
      FROM unnest(p_field_keys) requested(field_key)
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.event_report_available_fields(v_event_id) catalog
        WHERE catalog.field_key = requested.field_key
      )
    ) THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'invalid_fields', 'error', 'Invalid report field');
    END IF;

    IF EXISTS (
      SELECT 1
      FROM unnest(p_field_keys) requested(field_key)
      WHERE NOT (requested.field_key = ANY(v_current_keys))
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'fields_changed',
        'error', 'The available report fields changed',
        'data', jsonb_build_object('fields', v_current_fields)
      );
    END IF;

    SELECT array_agg(f.field_key ORDER BY f.display_order)
    INTO v_effective_keys
    FROM public.event_report_available_fields(v_event_id) f
    WHERE f.field_key = ANY(p_field_keys);
  END IF;

  IF p_limit IS NOT NULL AND p_limit NOT IN (25, 50, 100) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_limit', 'error', 'Page size must be 25, 50, 100, or All');
  END IF;
  IF COALESCE(p_offset, 0) < 0 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_offset', 'error', 'Page offset cannot be negative');
  END IF;

  v_fetch_limit := COALESCE(p_limit, 10000);

  WITH base AS MATERIALIZED (
    SELECT
      r.id,
      r.created_at,
      jsonb_build_object(
        'full_name', r.full_name,
        'email', r.email,
        'phone', r.phone,
        'company', r.company,
        'gender', r.gender,
        'meal_preference', r.meal_preference,
        'profession', r.profession,
        'designation', r.designation,
        'notes', r.notes,
        'visit_date', CASE
          WHEN COALESCE(r.visit_all_days, false) THEN 'All days'
          WHEN r.visit_date IS NOT NULL THEN r.visit_date::text
          ELSE NULL
        END,
        'badge_code', badge.badge_code
      ) AS full_row,
      COUNT(*) OVER () AS total_count
    FROM public.event_rsvps r
    LEFT JOIN LATERAL (
      SELECT b.badge_code
      FROM public.event_badges b
      WHERE b.rsvp_id = r.id
      ORDER BY b.issued_at DESC, b.id DESC
      LIMIT 1
    ) badge ON true
    WHERE r.event_id = v_event_id
      AND r.status IN ('confirmed', 'pending', 'waitlisted')
  ), page_rows AS (
    SELECT *
    FROM base
    ORDER BY created_at ASC, id ASC
    LIMIT v_fetch_limit
    OFFSET COALESCE(p_offset, 0)
  )
  SELECT
    COALESCE(
      jsonb_agg(
        (
          SELECT COALESCE(jsonb_object_agg(item.key, item.value), '{}'::jsonb)
          FROM jsonb_each(page_rows.full_row) item
          WHERE item.key = ANY(v_effective_keys)
        )
        ORDER BY page_rows.created_at ASC, page_rows.id ASC
      ),
      '[]'::jsonb
    ),
    COALESCE(MAX(page_rows.total_count), (SELECT COUNT(*) FROM base))
  INTO v_rows, v_total
  FROM page_rows;

  v_truncated := p_limit IS NULL AND v_total > 10000;

  RETURN jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'fields', (
        SELECT COALESCE(
          jsonb_agg(jsonb_build_object('key', f.field_key, 'label', f.label) ORDER BY f.display_order),
          '[]'::jsonb
        )
        FROM public.event_report_available_fields(v_event_id) f
        WHERE f.field_key = ANY(v_effective_keys)
      ),
      'rows', v_rows,
      'total', v_total,
      'limit', p_limit,
      'offset', COALESCE(p_offset, 0),
      'truncated', v_truncated
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_event_report_rows(text, text[], integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_event_report_rows(text, text[], integer, integer) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
