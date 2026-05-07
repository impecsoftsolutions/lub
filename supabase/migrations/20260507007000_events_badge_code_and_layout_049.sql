/*
  # COD-EVENTS-BADGE-QUALITY-049
  - New badge code format: LUBAP + 2 uppercase letters + 4 digits.
    Regex: ^LUBAP[A-Z]{2}[0-9]{4}$  (length 11).
  - Server-controlled generator with collision retry.
  - Existing legacy badge codes are intentionally NOT rewritten and remain
    valid; only newly-issued codes use the new format.
  - No CHECK constraint on badge_code (would conflict with legacy rows);
    format is enforced exclusively by the generator + trigger.

  Layout / render changes (pdf-lib + qrcode + branding) are implemented in
  the edge function `event-badge-download`; nothing to migrate for those.
*/

-- =============================================================================
-- gen_event_badge_code_v2 — LUBAP[A-Z]{2}[0-9]{4}
-- =============================================================================

CREATE OR REPLACE FUNCTION public.gen_event_badge_code_v2()
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
  RETURN 'LUBAP' || l1 || l2 || digits;
END;
$$;

COMMENT ON FUNCTION public.gen_event_badge_code_v2() IS
  'Generates an event badge code in the format LUBAP[A-Z]{2}[0-9]{4} (length 11). Uniqueness is enforced by the unique index on event_badges.badge_code; callers must retry on unique_violation.';

-- =============================================================================
-- Trigger: re-create the issue function so new badges use the v2 generator
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
    'visit_date', NEW.visit_date,
    'visit_all_days', NEW.visit_all_days,
    'event_id', v_event.id,
    'event_slug', v_event.slug,
    'event_title', v_event.title,
    'event_start_at', v_event.start_at,
    'event_end_at', v_event.end_at,
    'event_location', v_event.location
  );

  -- 049: use the v2 generator. Retry on collision; never silently fall back.
  LOOP
    v_attempt := v_attempt + 1;
    v_code := public.gen_event_badge_code_v2();
    BEGIN
      INSERT INTO public.event_badges (event_id, rsvp_id, badge_code, snapshot)
      VALUES (NEW.event_id, NEW.id, v_code, v_snapshot)
      RETURNING id INTO v_badge_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_attempt >= 12 THEN
        RAISE EXCEPTION 'Could not allocate a unique badge code after % attempts; LUBAP code space may be exhausted.', v_attempt;
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
