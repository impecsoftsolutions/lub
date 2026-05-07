/*
  # COD-EVENTS-DESIGNATION-CODE-V3-TEMPLATE-UPLOADS-052

  Bundles four small additive changes:

  1) Badge code v3 — 6-char alphanumeric: ^[A-Z]{2}[0-9]{4}$ (e.g. YX3214).
     Replaces v2 (LUBAP[A-Z]{2}[0-9]{4}) for newly-issued badges only.
     Legacy codes from 048 (Crockford 10-char) and 049 (LUBAPxx####)
     remain valid. UNIQUE index on event_badges.badge_code unchanged.

  2) Designation field on registration:
       events.rsvp_collect_designation boolean default false
       event_rsvps.designation text                (nullable, free text)
     "Required when collected" lives in events.ai_metadata.rsvp_require_designation
     (same JSONB convention used in 042 for rsvp_require_*).

  3) event_assets.kind allow-list extended with two new kinds for the
     admin badge-design feature:
       'badge_template'  — admin-uploaded reference badge layout
       'badge_sample'    — admin-uploaded sample/expected badge
     These are surfaced through the existing event-media-upload pipeline.

  4) NOTIFY pgrst, 'reload schema'; so the new RPCs/columns are visible
     to PostgREST without a redeploy.
*/

-- =============================================================================
-- SECTION 1: schema additions
-- =============================================================================

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS rsvp_collect_designation boolean NOT NULL DEFAULT false;

ALTER TABLE public.event_rsvps
  ADD COLUMN IF NOT EXISTS designation text;

-- Extend event_assets.kind allow-list. Drop+recreate to add new values.
ALTER TABLE public.event_assets
  DROP CONSTRAINT IF EXISTS event_assets_kind_check;

ALTER TABLE public.event_assets
  ADD CONSTRAINT event_assets_kind_check
  CHECK (kind IN ('banner','flyer','gallery','document','badge_template','badge_sample'));

-- One badge_template / badge_sample per event (latest replaces).
CREATE UNIQUE INDEX IF NOT EXISTS event_assets_one_badge_template_per_event_uidx
  ON public.event_assets(event_id) WHERE kind = 'badge_template';
CREATE UNIQUE INDEX IF NOT EXISTS event_assets_one_badge_sample_per_event_uidx
  ON public.event_assets(event_id) WHERE kind = 'badge_sample';

-- =============================================================================
-- SECTION 2: badge code v3 (6 chars: 2 letters + 4 digits)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.gen_event_badge_code_v3()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  letters text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  l1 text;
  l2 text;
  digits text;
BEGIN
  l1 := substr(letters, 1 + floor(random() * 26)::int, 1);
  l2 := substr(letters, 1 + floor(random() * 26)::int, 1);
  digits := lpad(floor(random() * 10000)::int::text, 4, '0');
  RETURN l1 || l2 || digits;
END;
$$;

COMMENT ON FUNCTION public.gen_event_badge_code_v3() IS
  '052: 6-char badge code in the format [A-Z]{2}[0-9]{4} (e.g. YX3214). Caller retries on unique_violation.';

-- =============================================================================
-- SECTION 3: trigger — issue v3 codes for new confirmed RSVPs
-- =============================================================================

CREATE OR REPLACE FUNCTION public.event_rsvps_after_insert_issue_badge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event public.events%ROWTYPE;
  v_code text;
  v_badge_id uuid;
  v_snapshot jsonb;
  v_attempt int := 0;
BEGIN
  IF NEW.status <> 'confirmed' THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM public.event_badges WHERE rsvp_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_event FROM public.events WHERE id = NEW.event_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_snapshot := jsonb_build_object(
    'full_name', NEW.full_name,
    'email',     NEW.email,
    'phone',     NEW.phone,
    'company',   NEW.company,
    'gender',    NEW.gender,
    'profession', NEW.profession,
    'designation', NEW.designation,
    'visit_date', NEW.visit_date,
    'visit_all_days', NEW.visit_all_days,
    'event_id', v_event.id,
    'event_slug', v_event.slug,
    'event_title', v_event.title,
    'event_start_at', v_event.start_at,
    'event_end_at', v_event.end_at,
    'event_location', v_event.location
  );

  -- 052: switch to v3 (6-char) generator. Retry on collision; never silently fall back.
  LOOP
    v_attempt := v_attempt + 1;
    v_code := public.gen_event_badge_code_v3();
    BEGIN
      INSERT INTO public.event_badges (event_id, rsvp_id, badge_code, snapshot)
      VALUES (NEW.event_id, NEW.id, v_code, v_snapshot)
      RETURNING id INTO v_badge_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_attempt >= 12 THEN
        RAISE EXCEPTION 'Could not allocate a unique 6-char badge code after % attempts.', v_attempt;
      END IF;
    END;
  END LOOP;

  IF NEW.email IS NOT NULL AND length(trim(NEW.email)) > 0 THEN
    INSERT INTO public.event_badge_deliveries (badge_id, channel, recipient, status)
    VALUES (v_badge_id, 'email', lower(trim(NEW.email)), 'pending');
  END IF;

  RETURN NEW;
END;
$$;

-- =============================================================================
-- SECTION 4: record_event_asset_with_session — accept new badge kinds
--   (Re-creates the function with the same body as 041 but extends kind
--    allow-list and supports the partial unique indexes by deleting any
--    existing row with the same banner/badge_template/badge_sample kind
--    before insert.)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.record_event_asset_with_session(
  p_session_token text,
  p_event_id uuid,
  p_kind text,
  p_storage_path text,
  p_public_url text,
  p_label text DEFAULT NULL,
  p_byte_size integer DEFAULT NULL,
  p_mime_type text DEFAULT NULL,
  p_display_order integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
  v_event public.events%ROWTYPE;
  v_id uuid;
  v_existing uuid;
BEGIN
  v_actor := public.resolve_custom_session_user_id(p_session_token);
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_session', 'error', 'Invalid session');
  END IF;

  SELECT * INTO v_event FROM public.events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'event_not_found', 'error', 'Event not found');
  END IF;

  IF NOT public.has_permission(v_actor, 'events.edit_any') THEN
    IF NOT public.has_permission(v_actor, 'events.edit_own') THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'permission_denied', 'error', 'Not authorized');
    END IF;
    IF v_event.created_by <> v_actor THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'permission_denied', 'error', 'Not authorized');
    END IF;
  END IF;

  IF p_kind NOT IN ('banner','flyer','gallery','document','badge_template','badge_sample') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_kind', 'error', 'Invalid asset kind');
  END IF;

  -- Singleton kinds (partial-unique) — replace the existing row.
  IF p_kind IN ('banner','badge_template','badge_sample') THEN
    SELECT id INTO v_existing
    FROM public.event_assets
    WHERE event_id = p_event_id AND kind = p_kind
    LIMIT 1;
    IF v_existing IS NOT NULL THEN
      DELETE FROM public.event_assets WHERE id = v_existing;
    END IF;
    IF p_kind = 'banner' THEN
      UPDATE public.events
      SET banner_image_url = p_public_url,
          banner_object_key = p_storage_path,
          updated_at = now()
      WHERE id = p_event_id;
    END IF;
  END IF;

  INSERT INTO public.event_assets (
    event_id, kind, storage_path, public_url, label, byte_size, mime_type, display_order, created_by
  ) VALUES (
    p_event_id, p_kind, p_storage_path, p_public_url,
    NULLIF(trim(COALESCE(p_label, '')), ''),
    p_byte_size, p_mime_type, COALESCE(p_display_order, 0),
    v_actor
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'asset_id', v_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error_code', 'unexpected_error', 'error', SQLERRM);
END;
$$;

-- =============================================================================
-- SECTION 5: submit_event_rsvp — accept + persist designation
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
  p_profession      text DEFAULT NULL,
  p_visit_date      date DEFAULT NULL,
  p_visit_all_days  boolean DEFAULT false,
  p_designation     text DEFAULT NULL
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
  v_designation text;
  v_now timestamptz := now();
  v_deadline timestamptz;
  v_used integer := 0;
  v_used_day integer := 0;
  v_new_id uuid;
  v_existing public.event_rsvps%ROWTYPE;
  v_visit_date date := NULL;
  v_visit_all_days boolean := false;
  v_event_first_day date := NULL;
  v_event_last_day date := NULL;
  v_is_multiday boolean := false;
  v_require_phone boolean;
  v_require_company boolean;
  v_require_gender boolean;
  v_require_meal boolean;
  v_require_profession boolean;
  v_collect_note boolean;
  v_require_note boolean;
  v_require_designation boolean;
BEGIN
  SELECT * INTO v_event
  FROM public.events
  WHERE slug = p_event_slug
    AND status = 'published';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'event_not_found', 'error', 'Event not found');
  END IF;

  IF v_event.visibility = 'member_only' OR COALESCE(v_event.rsvp_require_login, false) THEN
    v_actor_id := public.resolve_custom_session_user_id(p_session_token);
    IF v_actor_id IS NULL THEN
      IF v_event.visibility = 'member_only' THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'permission_denied', 'error', 'This event is for members only');
      END IF;
      RETURN jsonb_build_object('success', false, 'error_code', 'login_required', 'error', 'Please sign in to register for this event');
    END IF;
    IF v_event.visibility = 'member_only' AND NOT public.is_member_or_both_account(v_actor_id) THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'permission_denied', 'error', 'This event is for members only');
    END IF;
  ELSE
    v_actor_id := public.resolve_custom_session_user_id(p_session_token);
  END IF;

  IF NOT COALESCE(v_event.rsvp_enabled, false) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'rsvp_closed', 'error', 'Registrations are closed for this event');
  END IF;

  v_full_name := NULLIF(trim(COALESCE(p_full_name, '')), '');
  IF v_full_name IS NULL OR length(v_full_name) < 2 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_full_name', 'error', 'Full name is required');
  END IF;

  v_email := lower(trim(COALESCE(p_email, '')));
  IF v_email = '' THEN
    v_email := NULL;
  ELSIF v_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_email', 'error', 'Valid email is required');
  END IF;

  v_phone := NULLIF(trim(COALESCE(p_phone, '')), '');
  IF v_phone IS NOT NULL AND (length(v_phone) < 7 OR length(v_phone) > 20 OR v_phone !~ '^[0-9+\-() ]+$') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_phone', 'error', 'Invalid phone number');
  END IF;

  v_company := NULLIF(trim(COALESCE(p_company, '')), '');
  IF v_company IS NOT NULL AND length(v_company) > 150 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_company', 'error', 'Company is too long');
  END IF;

  v_notes := NULLIF(trim(COALESCE(p_notes, '')), '');
  IF v_notes IS NOT NULL AND length(v_notes) > 1000 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_notes', 'error', 'Notes are too long');
  END IF;

  v_gender := NULLIF(trim(COALESCE(p_gender, '')), '');
  IF v_gender IS NOT NULL AND v_gender NOT IN ('male','female','other','prefer_not_to_say') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_gender', 'error', 'Invalid gender value');
  END IF;

  v_meal := NULLIF(trim(COALESCE(p_meal_preference, '')), '');
  IF v_meal IS NOT NULL AND v_meal NOT IN ('veg','non_veg') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_meal_preference', 'error', 'Invalid meal preference');
  END IF;

  v_profession := NULLIF(trim(COALESCE(p_profession, '')), '');
  IF v_profession IS NOT NULL AND v_profession NOT IN ('company_owner','director','official','other','partner','student') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_profession', 'error', 'Invalid profession');
  END IF;

  v_designation := NULLIF(trim(COALESCE(p_designation, '')), '');
  IF v_designation IS NOT NULL AND length(v_designation) > 120 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_designation', 'error', 'Designation is too long (max 120 chars)');
  END IF;

  v_require_phone := COALESCE((v_event.ai_metadata->>'rsvp_require_phone')::boolean, v_event.rsvp_collect_phone);
  v_require_company := COALESCE((v_event.ai_metadata->>'rsvp_require_company')::boolean, v_event.rsvp_collect_company);
  v_require_gender := COALESCE((v_event.ai_metadata->>'rsvp_require_gender')::boolean, v_event.rsvp_collect_gender);
  v_require_meal := COALESCE((v_event.ai_metadata->>'rsvp_require_meal')::boolean, v_event.rsvp_collect_meal);
  v_require_profession := COALESCE((v_event.ai_metadata->>'rsvp_require_profession')::boolean, v_event.rsvp_collect_profession);
  v_collect_note := COALESCE((v_event.ai_metadata->>'rsvp_collect_note')::boolean, false);
  v_require_note := v_collect_note AND COALESCE((v_event.ai_metadata->>'rsvp_require_note')::boolean, false);
  v_require_designation := v_event.rsvp_collect_designation
    AND COALESCE((v_event.ai_metadata->>'rsvp_require_designation')::boolean, false);

  IF v_require_phone AND v_phone IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'phone_required', 'error', 'Phone is required for this event');
  END IF;
  IF v_require_company AND v_company IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'company_required', 'error', 'Company is required for this event');
  END IF;
  IF v_require_gender AND v_gender IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'gender_required', 'error', 'Gender is required for this event');
  END IF;
  IF v_require_meal AND v_meal IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'meal_required', 'error', 'Meal preference is required for this event');
  END IF;
  IF v_require_profession AND v_profession IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'profession_required', 'error', 'Profession is required for this event');
  END IF;
  IF v_require_note AND v_notes IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'note_required', 'error', 'Note is required for this event');
  END IF;
  IF v_require_designation AND v_designation IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'designation_required', 'error', 'Designation is required for this event');
  END IF;

  IF NOT v_collect_note THEN v_notes := NULL; END IF;
  IF NOT v_event.rsvp_collect_designation THEN v_designation := NULL; END IF;

  IF v_event.start_at IS NOT NULL THEN
    v_event_first_day := v_event.start_at::date;
    v_event_last_day := COALESCE(v_event.end_at, v_event.start_at)::date;
    IF v_event_last_day < v_event_first_day THEN
      v_event_last_day := v_event_first_day;
    END IF;
    v_is_multiday := v_event_last_day > v_event_first_day;
  END IF;

  IF p_visit_all_days THEN
    v_visit_all_days := true;
    v_visit_date := NULL;
  ELSIF p_visit_date IS NOT NULL THEN
    v_visit_date := p_visit_date;
    IF v_event_first_day IS NOT NULL
       AND (v_visit_date < v_event_first_day OR v_visit_date > v_event_last_day) THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'invalid_visit_date', 'error', 'Selected day is outside the event window');
    END IF;
  ELSE
    IF v_is_multiday THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'visit_date_required', 'error', 'Please choose your day of visit');
    END IF;
    IF v_event_first_day IS NOT NULL THEN
      v_visit_date := v_event_first_day;
    END IF;
  END IF;

  -- Idempotent on (event_id, lower(email)) when email present.
  IF v_email IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.event_rsvps
    WHERE event_id = v_event.id
      AND lower(email) = v_email
      AND status IN ('confirmed','pending','waitlisted')
    LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('success', true, 'rsvp_id', v_existing.id, 'status', v_existing.status, 'duplicate', true);
    END IF;
  END IF;

  IF v_event.capacity_mode = 'per_day' AND v_event.per_day_capacity IS NOT NULL THEN
    IF v_visit_all_days THEN
      DECLARE v_day date;
      BEGIN
        FOR v_day IN
          SELECT gs::date FROM generate_series(v_event_first_day, v_event_last_day, interval '1 day') gs
        LOOP
          SELECT public.event_rsvp_used_by_date(v_event.id, v_day) INTO v_used_day;
          IF v_used_day >= v_event.per_day_capacity THEN
            RETURN jsonb_build_object('success', false, 'error_code', 'capacity_full_for_date', 'error', 'No seats remaining for at least one event day');
          END IF;
        END LOOP;
      END;
    ELSIF v_visit_date IS NOT NULL THEN
      SELECT public.event_rsvp_used_by_date(v_event.id, v_visit_date) INTO v_used_day;
      IF v_used_day >= v_event.per_day_capacity THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'capacity_full_for_date', 'error', 'No seats remaining for the selected day');
      END IF;
    END IF;
  ELSIF v_event.rsvp_capacity IS NOT NULL THEN
    SELECT COUNT(*)::integer INTO v_used FROM public.event_rsvps r
    WHERE r.event_id = v_event.id AND r.status = 'confirmed';
    IF v_used >= v_event.rsvp_capacity THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'capacity_full', 'error', 'This event is full');
    END IF;
  END IF;

  v_deadline := COALESCE(v_event.rsvp_deadline_at, v_event.start_at);
  IF v_deadline IS NOT NULL AND v_deadline <= v_now THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'rsvp_deadline_passed', 'error', 'The registration deadline has passed');
  END IF;

  INSERT INTO public.event_rsvps (
    event_id, user_id, full_name, email, phone, company, notes, status,
    gender, meal_preference, profession, visit_date, visit_all_days, designation
  )
  VALUES (
    v_event.id, v_actor_id, v_full_name, v_email, v_phone, v_company, v_notes, 'confirmed',
    v_gender, v_meal, v_profession, v_visit_date, v_visit_all_days, v_designation
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('success', true, 'rsvp_id', v_new_id, 'status', 'confirmed', 'duplicate', false);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error_code', 'unexpected_error', 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_event_rsvp(text, text, text, text, text, text, text, text, text, text, date, boolean, text)
  TO anon, authenticated;

-- =============================================================================
-- SECTION 6: get_event_by_slug — surface collect_designation + require_designation
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
  v_assets jsonb;
  v_per_day_usage jsonb := '{}'::jsonb;
  v_require_phone boolean;
  v_require_company boolean;
  v_require_gender boolean;
  v_require_meal boolean;
  v_require_profession boolean;
  v_collect_note boolean;
  v_require_note boolean;
  v_require_designation boolean;
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
      AND (
        (v_event.capacity_mode = 'per_day')
        OR (v_event.rsvp_capacity IS NULL OR v_used_count < v_event.rsvp_capacity)
      );
    IF v_event.capacity_mode = 'global' AND v_event.rsvp_capacity IS NOT NULL THEN
      v_remaining := GREATEST(v_event.rsvp_capacity - v_used_count, 0);
    END IF;
  END IF;

  IF v_event.start_at IS NOT NULL THEN
    SELECT COALESCE(jsonb_object_agg(d.day::text, d.used_count), '{}'::jsonb)
    INTO v_per_day_usage
    FROM (
      SELECT
        gs::date AS day,
        (
          SELECT COUNT(*)::integer
          FROM public.event_rsvps r
          WHERE r.event_id = v_event.id
            AND r.status = 'confirmed'
            AND (r.visit_all_days = true OR r.visit_date = gs::date)
        ) AS used_count
      FROM generate_series(
        v_event.start_at::date,
        COALESCE(v_event.end_at, v_event.start_at)::date,
        interval '1 day'
      ) AS gs
    ) d;
  END IF;

  v_require_phone := COALESCE((v_event.ai_metadata->>'rsvp_require_phone')::boolean, v_event.rsvp_collect_phone);
  v_require_company := COALESCE((v_event.ai_metadata->>'rsvp_require_company')::boolean, v_event.rsvp_collect_company);
  v_require_gender := COALESCE((v_event.ai_metadata->>'rsvp_require_gender')::boolean, v_event.rsvp_collect_gender);
  v_require_meal := COALESCE((v_event.ai_metadata->>'rsvp_require_meal')::boolean, v_event.rsvp_collect_meal);
  v_require_profession := COALESCE((v_event.ai_metadata->>'rsvp_require_profession')::boolean, v_event.rsvp_collect_profession);
  v_collect_note := COALESCE((v_event.ai_metadata->>'rsvp_collect_note')::boolean, false);
  v_require_note := v_collect_note AND COALESCE((v_event.ai_metadata->>'rsvp_require_note')::boolean, false);
  v_require_designation := v_event.rsvp_collect_designation
    AND COALESCE((v_event.ai_metadata->>'rsvp_require_designation')::boolean, false);

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.kind, t.display_order, t.created_at), '[]'::jsonb)
  INTO v_assets
  FROM (
    SELECT id, kind, storage_path, public_url, label, byte_size, mime_type, display_order, created_at
    FROM public.event_assets
    WHERE event_id = v_event.id
      AND kind IN ('banner','flyer','gallery','document')   -- design assets stay admin-only
  ) t;

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
      'banner_image_url', v_event.banner_image_url,
      'assets', v_assets,
      'rsvp', jsonb_build_object(
        'enabled', v_event.rsvp_enabled,
        'open', v_open,
        'deadline_at', v_deadline,
        'capacity', v_event.rsvp_capacity,
        'capacity_mode', v_event.capacity_mode,
        'per_day_capacity', v_event.per_day_capacity,
        'used_count', v_used_count,
        'remaining', v_remaining,
        'per_day_used', v_per_day_usage,
        'collect_phone', v_event.rsvp_collect_phone,
        'collect_company', v_event.rsvp_collect_company,
        'collect_gender', v_event.rsvp_collect_gender,
        'collect_meal', v_event.rsvp_collect_meal,
        'collect_profession', v_event.rsvp_collect_profession,
        'collect_note', v_collect_note,
        'collect_designation', v_event.rsvp_collect_designation,
        'require_phone', v_require_phone,
        'require_company', v_require_company,
        'require_gender', v_require_gender,
        'require_meal', v_require_meal,
        'require_profession', v_require_profession,
        'require_note', v_require_note,
        'require_designation', v_require_designation,
        'require_login', v_event.rsvp_require_login
      )
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_event_by_slug(text, text) TO anon, authenticated;

-- =============================================================================
-- SECTION 7: get_event_rsvps_with_session — return designation column
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
           gender, meal_preference, profession, designation,
           visit_date, visit_all_days,
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
-- SECTION 8: tell PostgREST about the new RPCs/columns
-- =============================================================================

NOTIFY pgrst, 'reload schema';
