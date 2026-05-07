/*
  # COD-EVENTS-RSVP-SPLIT-NAME-AND-BADGE-NAME-OPTIONS-054

  1) Split RSVP "Full name" into Surname + Given Name.
     - event_rsvps.surname text     (nullable)
     - event_rsvps.given_name text  (nullable)
     The existing event_rsvps.full_name column STAYS — server constructs
     it as `surname || ' ' || given_name` so admin queries, badge
     snapshot, email delivery, and 048/049/050X/052 logic all keep
     working without a single rewrite. Legacy rows that only have
     full_name remain valid.

  2) Per-event badge name display options (no DDL — lives in
     events.ai_metadata, same convention 042/052 used):
       badge_include_surname  boolean (default true)
       badge_name_max_chars   integer (default 25, clamp 6..40)
       badge_name_font_size   integer (default 22, clamp 8..32)
     The badge renderer reads these at request time.

  3) submit_event_rsvp signature gains p_surname + p_given_name. If
     either is supplied, server composes full_name from them; otherwise
     falls back to legacy p_full_name.

  4) Ends with NOTIFY pgrst, 'reload schema'.
*/

-- =============================================================================
-- SECTION 1: schema
-- =============================================================================

ALTER TABLE public.event_rsvps
  ADD COLUMN IF NOT EXISTS surname    text,
  ADD COLUMN IF NOT EXISTS given_name text;

-- =============================================================================
-- SECTION 2: trigger — include surname/given_name in snapshot
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
    'surname',   NEW.surname,
    'given_name', NEW.given_name,
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
-- SECTION 3: submit_event_rsvp — accept p_surname + p_given_name; compose
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
  p_designation     text DEFAULT NULL,
  p_surname         text DEFAULT NULL,
  p_given_name      text DEFAULT NULL
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
  v_surname text;
  v_given_name text;
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

  -- 054: prefer p_surname + p_given_name; compose full_name from them.
  --      Fall back to p_full_name when callers haven't migrated yet.
  v_surname := NULLIF(trim(COALESCE(p_surname, '')), '');
  v_given_name := NULLIF(trim(COALESCE(p_given_name, '')), '');
  IF v_surname IS NOT NULL OR v_given_name IS NOT NULL THEN
    v_full_name := NULLIF(trim(concat_ws(' ', v_surname, v_given_name)), '');
  ELSE
    v_full_name := NULLIF(trim(COALESCE(p_full_name, '')), '');
  END IF;
  IF v_full_name IS NULL OR length(v_full_name) < 2 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_full_name', 'error', 'Full name is required');
  END IF;
  IF v_surname IS NOT NULL AND length(v_surname) > 100 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_surname', 'error', 'Surname is too long');
  END IF;
  IF v_given_name IS NOT NULL AND length(v_given_name) > 100 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_given_name', 'error', 'Given name is too long');
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
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_designation', 'error', 'Designation is too long');
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
    event_id, user_id, full_name, surname, given_name, email, phone, company, notes, status,
    gender, meal_preference, profession, visit_date, visit_all_days, designation
  )
  VALUES (
    v_event.id, v_actor_id, v_full_name, v_surname, v_given_name, v_email, v_phone, v_company, v_notes, 'confirmed',
    v_gender, v_meal, v_profession, v_visit_date, v_visit_all_days, v_designation
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('success', true, 'rsvp_id', v_new_id, 'status', 'confirmed', 'duplicate', false);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error_code', 'unexpected_error', 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_event_rsvp(text, text, text, text, text, text, text, text, text, text, date, boolean, text, text, text)
  TO anon, authenticated;

-- =============================================================================
-- SECTION 4: get_event_rsvps_with_session — surface surname + given_name
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
    SELECT id, event_id, full_name, surname, given_name,
           email, phone, company,
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

NOTIFY pgrst, 'reload schema';
