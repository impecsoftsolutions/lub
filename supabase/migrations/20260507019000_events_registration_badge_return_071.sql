-- COD-EVENTS-REGISTRATION-BADGE-AADHAAR-REPORTS-071
-- Return issued badge code after public registration so the website can show
-- a website-hosted badge download link without exposing the Supabase function URL.

DROP FUNCTION IF EXISTS public.submit_event_rsvp(text, text, text, text, text, text, text, text, text, text, date, boolean, text, text, text, text);
DROP FUNCTION IF EXISTS public.submit_event_rsvp(text, text, text, text, text, text, text, text, text, text, date, boolean, text, text, text);
DROP FUNCTION IF EXISTS public.submit_event_rsvp(text, text, text, text, text, text, text, text, text, text, date, boolean, text);
DROP FUNCTION IF EXISTS public.submit_event_rsvp(text, text, text, text, text, text, text, text, text, text, date, boolean);
DROP FUNCTION IF EXISTS public.submit_event_rsvp(text, text, text, text, text, text, text, text, text, text, date);

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
  p_given_name      text DEFAULT NULL,
  p_aadhaar         text DEFAULT NULL
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
  v_aadhaar text;
  v_now timestamptz := now();
  v_deadline timestamptz;
  v_used integer := 0;
  v_used_day integer := 0;
  v_new_id uuid;
  v_badge_code text;
  v_existing public.event_rsvps%ROWTYPE;
  v_visit_date date := NULL;
  v_visit_all_days boolean := false;
  v_event_first_day date := NULL;
  v_event_last_day date := NULL;
  v_is_multiday boolean := false;
  v_collect_email boolean;
  v_require_email boolean;
  v_require_phone boolean;
  v_require_company boolean;
  v_require_gender boolean;
  v_require_meal boolean;
  v_require_profession boolean;
  v_collect_note boolean;
  v_require_note boolean;
  v_require_designation boolean;
  v_require_aadhaar boolean;
  v_profession_allowed boolean;
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

  v_collect_email := COALESCE((v_event.ai_metadata->>'rsvp_collect_email')::boolean, true);
  v_require_email := v_collect_email AND COALESCE((v_event.ai_metadata->>'rsvp_require_email')::boolean, false);
  v_email := NULLIF(lower(trim(COALESCE(p_email, ''))), '');
  IF v_require_email AND v_email IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'email_required', 'error', 'Email is required for this event');
  END IF;
  IF v_email IS NOT NULL AND v_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_email', 'error', 'Invalid email');
  END IF;
  IF NOT v_collect_email THEN
    v_email := NULL;
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

  v_profession := NULLIF(regexp_replace(trim(COALESCE(p_profession, '')), '\s+', ' ', 'g'), '');
  IF v_profession IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(public.event_rsvp_profession_options(v_event.ai_metadata)) AS opt
      WHERE opt->>'value' = v_profession
    ) INTO v_profession_allowed;
    IF NOT v_profession_allowed THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'invalid_profession', 'error', 'Invalid profession');
    END IF;
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
  v_require_aadhaar := v_event.rsvp_collect_aadhaar AND v_event.rsvp_require_aadhaar;

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

  IF v_event.rsvp_collect_aadhaar THEN
    v_aadhaar := NULLIF(regexp_replace(COALESCE(p_aadhaar, ''), '\D', '', 'g'), '');
    IF v_require_aadhaar AND v_aadhaar IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'aadhaar_required', 'error', 'Aadhaar Card is required for this event');
    END IF;
    IF v_aadhaar IS NOT NULL AND v_aadhaar !~ '^[0-9]{12}$' THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'invalid_aadhaar', 'error', 'Invalid Aadhaar Card number');
    END IF;
  ELSE
    v_aadhaar := NULL;
  END IF;

  IF NOT v_collect_note THEN v_notes := NULL; END IF;
  IF NOT v_event.rsvp_collect_profession THEN v_profession := NULL; END IF;
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
      SELECT b.badge_code INTO v_badge_code
      FROM public.event_badges b
      WHERE b.rsvp_id = v_existing.id
        AND b.revoked_at IS NULL
      ORDER BY b.issued_at DESC
      LIMIT 1;
      RETURN jsonb_build_object(
        'success', true,
        'rsvp_id', v_existing.id,
        'status', v_existing.status,
        'duplicate', true,
        'badge_code', v_badge_code
      );
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
    gender, meal_preference, profession, visit_date, visit_all_days, designation, aadhaar_number
  )
  VALUES (
    v_event.id, v_actor_id, v_full_name, v_surname, v_given_name, v_email, v_phone, v_company, v_notes, 'confirmed',
    v_gender, v_meal, v_profession, v_visit_date, v_visit_all_days, v_designation, v_aadhaar
  )
  RETURNING id INTO v_new_id;

  SELECT b.badge_code INTO v_badge_code
  FROM public.event_badges b
  WHERE b.rsvp_id = v_new_id
    AND b.revoked_at IS NULL
  ORDER BY b.issued_at DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'success', true,
    'rsvp_id', v_new_id,
    'status', 'confirmed',
    'duplicate', false,
    'badge_code', v_badge_code
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error_code', 'unexpected_error', 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_event_rsvp(text, text, text, text, text, text, text, text, text, text, date, boolean, text, text, text, text)
  TO anon, authenticated;



NOTIFY pgrst, 'reload schema';
