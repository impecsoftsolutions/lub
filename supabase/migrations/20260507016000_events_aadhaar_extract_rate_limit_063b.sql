-- COD-EVENTS-AADHAAR-DOC-AUTOFILL-063B
-- Production-safe rate limiting for the public transient Aadhaar extraction
-- edge function. This stores only an opaque IP+event hash key and counters;
-- it never stores source file bytes, OCR text, Aadhaar numbers, or names.

CREATE TABLE IF NOT EXISTS public.event_aadhaar_extract_rate_limits (
  rate_key text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.event_aadhaar_extract_rate_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_aadhaar_extract_rate_limits_service_role_all
  ON public.event_aadhaar_extract_rate_limits;

CREATE POLICY event_aadhaar_extract_rate_limits_service_role_all
  ON public.event_aadhaar_extract_rate_limits
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public.check_event_aadhaar_extract_rate_limit(
  p_rate_key text,
  p_max_requests integer DEFAULT 5,
  p_window_seconds integer DEFAULT 60
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
  v_now timestamptz := now();
  v_row public.event_aadhaar_extract_rate_limits%ROWTYPE;
  v_window interval := make_interval(secs => greatest(coalesce(p_window_seconds, 60), 1));
  v_max integer := greatest(coalesce(p_max_requests, 5), 1);
BEGIN
  v_key := nullif(trim(coalesce(p_rate_key, '')), '');
  IF v_key IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'error_code', 'bad_request');
  END IF;

  INSERT INTO public.event_aadhaar_extract_rate_limits (
    rate_key, window_start, request_count, updated_at
  )
  VALUES (v_key, v_now, 0, v_now)
  ON CONFLICT (rate_key) DO NOTHING;

  SELECT *
  INTO v_row
  FROM public.event_aadhaar_extract_rate_limits
  WHERE rate_key = v_key
  FOR UPDATE;

  IF v_row.window_start <= v_now - v_window THEN
    UPDATE public.event_aadhaar_extract_rate_limits
    SET window_start = v_now,
        request_count = 1,
        updated_at = v_now
    WHERE rate_key = v_key;

    RETURN jsonb_build_object(
      'allowed', true,
      'remaining', v_max - 1,
      'request_count', 1,
      'reset_at', v_now + v_window
    );
  END IF;

  IF v_row.request_count >= v_max THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'error_code', 'rate_limited',
      'remaining', 0,
      'request_count', v_row.request_count,
      'reset_at', v_row.window_start + v_window
    );
  END IF;

  UPDATE public.event_aadhaar_extract_rate_limits
  SET request_count = request_count + 1,
      updated_at = v_now
  WHERE rate_key = v_key
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'allowed', true,
    'remaining', greatest(v_max - v_row.request_count, 0),
    'request_count', v_row.request_count,
    'reset_at', v_row.window_start + v_window
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_event_aadhaar_extract_rate_limit(text, integer, integer)
  TO authenticated, anon;

COMMENT ON TABLE public.event_aadhaar_extract_rate_limits IS
  'Opaque rate-limit counters for transient event Aadhaar extraction. Stores no uploaded file bytes or extracted PII.';

COMMENT ON FUNCTION public.check_event_aadhaar_extract_rate_limit(text, integer, integer) IS
  'Atomically checks and increments transient Aadhaar extraction rate-limit counters.';

NOTIFY pgrst, 'reload schema';
