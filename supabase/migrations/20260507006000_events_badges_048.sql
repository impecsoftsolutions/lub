/*
  # COD-EVENTS-BADGES-048
  - Auto-issue a registration badge on RSVP confirm.
  - Track per-recipient email delivery attempts/status.
  - Public download is gated by event end_at (with a small grace window).
  - Visitor mobile lookup happens via the public download edge function.

  Tables:
    event_badges                 — one row per event_rsvp (UNIQUE).
    event_badge_deliveries       — one row per channel/recipient attempt.

  RLS: service-role only (badge bytes/links flow through edge functions
  so anon/authenticated cannot read raw rows).
*/

-- =============================================================================
-- SECTION 1: schema
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.event_badges (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  rsvp_id       uuid NOT NULL UNIQUE REFERENCES public.event_rsvps(id) ON DELETE CASCADE,
  badge_code    text NOT NULL UNIQUE,
  snapshot      jsonb NOT NULL DEFAULT '{}'::jsonb,
  issued_at     timestamptz NOT NULL DEFAULT now(),
  last_downloaded_at timestamptz
);

CREATE INDEX IF NOT EXISTS event_badges_event_id_idx ON public.event_badges(event_id);

ALTER TABLE public.event_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_badges_service_role_all
  ON public.event_badges FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.event_badge_deliveries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  badge_id        uuid NOT NULL REFERENCES public.event_badges(id) ON DELETE CASCADE,
  channel         text NOT NULL CHECK (channel IN ('email')),
  recipient       text NOT NULL,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','sent','failed')),
  attempts        integer NOT NULL DEFAULT 0,
  last_error      text,
  last_attempt_at timestamptz,
  sent_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_badge_deliveries_badge_id_idx
  ON public.event_badge_deliveries(badge_id);
CREATE INDEX IF NOT EXISTS event_badge_deliveries_status_idx
  ON public.event_badge_deliveries(status);

ALTER TABLE public.event_badge_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_badge_deliveries_service_role_all
  ON public.event_badge_deliveries FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- =============================================================================
-- SECTION 2: badge code generator (Crockford alphabet, 10 chars)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.gen_event_badge_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  alphabet text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; -- no I/L/O/U
  result   text := '';
  i        int;
BEGIN
  FOR i IN 1..10 LOOP
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  END LOOP;
  RETURN result;
END;
$$;

-- =============================================================================
-- SECTION 3: trigger — issue badge on confirmed RSVP insert
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

  -- Try a few times to avoid the (extremely unlikely) collision on the
  -- 10-char Crockford code.
  LOOP
    v_attempt := v_attempt + 1;
    v_code := public.gen_event_badge_code();
    BEGIN
      INSERT INTO public.event_badges (event_id, rsvp_id, badge_code, snapshot)
      VALUES (NEW.event_id, NEW.id, v_code, v_snapshot)
      RETURNING id INTO v_badge_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_attempt >= 5 THEN
        RAISE;
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

DROP TRIGGER IF EXISTS event_rsvps_after_insert_issue_badge ON public.event_rsvps;
CREATE TRIGGER event_rsvps_after_insert_issue_badge
  AFTER INSERT ON public.event_rsvps
  FOR EACH ROW EXECUTE FUNCTION public.event_rsvps_after_insert_issue_badge();

-- Backfill: issue badges for any existing confirmed RSVPs that don't
-- yet have a badge row.
INSERT INTO public.event_badges (event_id, rsvp_id, badge_code, snapshot)
SELECT
  r.event_id,
  r.id,
  public.gen_event_badge_code(),
  jsonb_build_object(
    'full_name', r.full_name,
    'email', r.email,
    'phone', r.phone,
    'company', r.company,
    'gender', r.gender,
    'profession', r.profession,
    'visit_date', r.visit_date,
    'visit_all_days', r.visit_all_days,
    'event_id', e.id,
    'event_slug', e.slug,
    'event_title', e.title,
    'event_start_at', e.start_at,
    'event_end_at', e.end_at,
    'event_location', e.location
  )
FROM public.event_rsvps r
JOIN public.events e ON e.id = r.event_id
WHERE r.status = 'confirmed'
  AND NOT EXISTS (SELECT 1 FROM public.event_badges b WHERE b.rsvp_id = r.id)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- SECTION 4: admin RPCs
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_event_badges_with_session(
  p_session_token text,
  p_event_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
  v_rows jsonb;
BEGIN
  v_actor := public.resolve_custom_session_user_id(p_session_token);
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_session', 'error', 'Invalid session');
  END IF;
  IF NOT (public.has_permission(v_actor, 'events.rsvp.view')
       OR public.has_permission(v_actor, 'events.rsvp.manage')) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'permission_denied', 'error', 'Not authorized');
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.issued_at DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      b.id, b.rsvp_id, b.badge_code, b.issued_at, b.last_downloaded_at,
      b.snapshot,
      (
        SELECT jsonb_build_object(
          'id', d.id,
          'channel', d.channel,
          'recipient', d.recipient,
          'status', d.status,
          'attempts', d.attempts,
          'last_error', d.last_error,
          'last_attempt_at', d.last_attempt_at,
          'sent_at', d.sent_at
        )
        FROM public.event_badge_deliveries d
        WHERE d.badge_id = b.id
        ORDER BY d.created_at DESC
        LIMIT 1
      ) AS latest_delivery
    FROM public.event_badges b
    WHERE b.event_id = p_event_id
  ) t;

  RETURN jsonb_build_object('success', true, 'data', v_rows);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_event_badges_with_session(text, uuid)
  TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.retry_event_badge_delivery_with_session(
  p_session_token text,
  p_delivery_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
  v_delivery public.event_badge_deliveries%ROWTYPE;
BEGIN
  v_actor := public.resolve_custom_session_user_id(p_session_token);
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_session', 'error', 'Invalid session');
  END IF;
  IF NOT public.has_permission(v_actor, 'events.rsvp.manage') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'permission_denied', 'error', 'Not authorized');
  END IF;

  SELECT * INTO v_delivery FROM public.event_badge_deliveries WHERE id = p_delivery_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'delivery_not_found', 'error', 'Delivery not found');
  END IF;

  UPDATE public.event_badge_deliveries
  SET status = 'pending',
      last_error = NULL,
      updated_at = now()
  WHERE id = p_delivery_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.retry_event_badge_delivery_with_session(text, uuid)
  TO authenticated, anon;

COMMENT ON TABLE public.event_badges IS
  'Auto-generated registration badges. One row per confirmed RSVP. Renderer (event-badge-download) checks event end_at + grace before serving.';
COMMENT ON TABLE public.event_badge_deliveries IS
  'Per-channel email delivery attempts for a badge. Updated by event-badge-deliver edge function. Admin retry flips status to pending.';
