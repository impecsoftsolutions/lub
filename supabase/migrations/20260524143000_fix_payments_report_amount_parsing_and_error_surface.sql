/*
  COD-REPORTS-PAYMENTS-001-HOTFIX

  Harden payments report RPC against legacy text-formatted amount values
  (e.g. "5000/-", "Rs 1000", empty strings) and preserve stable response
  types for the frontend.
*/

CREATE OR REPLACE FUNCTION public.get_admin_payments_report_with_session(
  p_session_token text,
  p_status_filter text DEFAULT NULL,
  p_state_filter text DEFAULT NULL,
  p_district_filter text DEFAULT NULL,
  p_payment_mode_filter text DEFAULT NULL,
  p_has_payment_proof boolean DEFAULT NULL,
  p_from_date date DEFAULT NULL,
  p_to_date date DEFAULT NULL,
  p_search_query text DEFAULT NULL,
  p_limit integer DEFAULT 500,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  registration_id uuid,
  full_name text,
  company_name text,
  email text,
  mobile_number text,
  member_id text,
  state text,
  district text,
  status text,
  is_active boolean,
  amount_paid numeric,
  payment_date date,
  payment_mode text,
  transaction_id text,
  bank_reference text,
  payment_proof_url text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_user_id uuid;
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 500), 1), 5000);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);

  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'session_invalid' USING ERRCODE = 'P0001';
  END IF;

  IF NOT (
    public.has_permission(v_actor_user_id, 'reports.payments.view')
    OR public.has_permission(v_actor_user_id, 'members.view')
  ) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  WITH normalized AS (
    SELECT
      mr.id AS registration_id,
      mr.full_name,
      mr.company_name,
      mr.email,
      mr.mobile_number,
      mr.member_id,
      mr.state,
      mr.district,
      mr.status,
      COALESCE(mr.is_active, true) AS is_active,
      mr.payment_date,
      mr.payment_mode,
      mr.transaction_id,
      mr.bank_reference,
      NULLIF(mr.payment_proof_url, '') AS payment_proof_url,
      mr.created_at,
      mr.updated_at,
      trim(COALESCE(mr.amount_paid::text, '')) AS amount_paid_text,
      regexp_replace(COALESCE(mr.amount_paid::text, ''), '[^0-9.\-]', '', 'g') AS amount_numeric_text
    FROM public.member_registrations mr
  )
  SELECT
    n.registration_id,
    n.full_name,
    n.company_name,
    n.email,
    n.mobile_number,
    n.member_id,
    n.state,
    n.district,
    n.status,
    n.is_active,
    CASE
      WHEN n.amount_numeric_text ~ '^-?\d+(\.\d+)?$' THEN n.amount_numeric_text::numeric
      ELSE 0::numeric
    END AS amount_paid,
    n.payment_date,
    n.payment_mode,
    n.transaction_id,
    n.bank_reference,
    n.payment_proof_url,
    n.created_at,
    n.updated_at
  FROM normalized n
  WHERE
    (
      NULLIF(n.amount_paid_text, '') IS NOT NULL
      OR n.payment_date IS NOT NULL
      OR NULLIF(n.payment_mode, '') IS NOT NULL
      OR NULLIF(n.transaction_id, '') IS NOT NULL
      OR NULLIF(n.bank_reference, '') IS NOT NULL
      OR n.payment_proof_url IS NOT NULL
    )
    AND (
      p_status_filter IS NULL
      OR p_status_filter = 'all'
      OR (p_status_filter = 'pending_approved' AND n.status IN ('pending', 'approved'))
      OR n.status = p_status_filter
    )
    AND (p_state_filter IS NULL OR p_state_filter = 'all' OR n.state = p_state_filter)
    AND (p_district_filter IS NULL OR p_district_filter = 'all' OR n.district = p_district_filter)
    AND (
      p_payment_mode_filter IS NULL
      OR p_payment_mode_filter = 'all'
      OR lower(COALESCE(n.payment_mode, '')) = lower(p_payment_mode_filter)
    )
    AND (
      p_has_payment_proof IS NULL
      OR (p_has_payment_proof = true AND n.payment_proof_url IS NOT NULL)
      OR (p_has_payment_proof = false AND n.payment_proof_url IS NULL)
    )
    AND (p_from_date IS NULL OR n.payment_date IS NULL OR n.payment_date >= p_from_date)
    AND (p_to_date IS NULL OR n.payment_date IS NULL OR n.payment_date <= p_to_date)
    AND (
      p_search_query IS NULL
      OR trim(p_search_query) = ''
      OR (
        SELECT bool_and(
          lower(
            concat_ws(
              ' ',
              n.full_name,
              n.company_name,
              n.email,
              n.mobile_number,
              n.member_id,
              n.state,
              n.district,
              n.payment_mode,
              n.transaction_id,
              n.bank_reference
            )
          ) LIKE '%' || lower(tok) || '%'
        )
        FROM unnest(string_to_array(trim(p_search_query), ' ')) AS tok
        WHERE length(trim(tok)) > 0
      )
    )
  ORDER BY COALESCE(n.payment_date, n.created_at::date) DESC, n.created_at DESC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_payments_report_with_session(
  text,
  text,
  text,
  text,
  text,
  boolean,
  date,
  date,
  text,
  integer,
  integer
) TO PUBLIC;

NOTIFY pgrst, 'reload schema';
