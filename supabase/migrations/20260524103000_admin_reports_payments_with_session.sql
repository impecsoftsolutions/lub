/*
  COD-REPORTS-PAYMENTS-001

  Adds a read-only payments reporting RPC for the admin portal and seeds the
  permission used to expose the Reports > Payments module in the UI.
*/

-- Permission seed (idempotent)
INSERT INTO public.permissions (code, name, description, category, is_active)
VALUES (
  'reports.payments.view',
  'View Payments Report',
  'View submitted member registration payment records in the admin reports module.',
  'reports',
  true
)
ON CONFLICT (code) DO NOTHING;

-- Role grants (idempotent)
INSERT INTO public.role_permissions (role, permission_code, granted_by, is_revoked)
VALUES
  ('super_admin', 'reports.payments.view', NULL, false),
  ('admin', 'reports.payments.view', NULL, false),
  ('manager', 'reports.payments.view', NULL, false),
  ('editor', 'reports.payments.view', NULL, false),
  ('viewer', 'reports.payments.view', NULL, false)
ON CONFLICT DO NOTHING;

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

  -- Backward compatible gate:
  -- - preferred: reports.payments.view
  -- - fallback: members.view (for environments where permission seed is pending)
  IF NOT (
    public.has_permission(v_actor_user_id, 'reports.payments.view')
    OR public.has_permission(v_actor_user_id, 'members.view')
  ) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
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
    mr.amount_paid,
    mr.payment_date,
    mr.payment_mode,
    mr.transaction_id,
    mr.bank_reference,
    NULLIF(mr.payment_proof_url, '') AS payment_proof_url,
    mr.created_at,
    mr.updated_at
  FROM public.member_registrations mr
  WHERE
    (
      COALESCE(mr.amount_paid, 0) > 0
      OR mr.payment_date IS NOT NULL
      OR NULLIF(mr.payment_mode, '') IS NOT NULL
      OR NULLIF(mr.transaction_id, '') IS NOT NULL
      OR NULLIF(mr.bank_reference, '') IS NOT NULL
      OR NULLIF(mr.payment_proof_url, '') IS NOT NULL
    )
    AND (
      p_status_filter IS NULL
      OR p_status_filter = 'all'
      OR (p_status_filter = 'pending_approved' AND mr.status IN ('pending', 'approved'))
      OR mr.status = p_status_filter
    )
    AND (p_state_filter IS NULL OR p_state_filter = 'all' OR mr.state = p_state_filter)
    AND (p_district_filter IS NULL OR p_district_filter = 'all' OR mr.district = p_district_filter)
    AND (
      p_payment_mode_filter IS NULL
      OR p_payment_mode_filter = 'all'
      OR lower(COALESCE(mr.payment_mode, '')) = lower(p_payment_mode_filter)
    )
    AND (
      p_has_payment_proof IS NULL
      OR (
        p_has_payment_proof = true
        AND NULLIF(mr.payment_proof_url, '') IS NOT NULL
      )
      OR (
        p_has_payment_proof = false
        AND NULLIF(mr.payment_proof_url, '') IS NULL
      )
    )
    AND (p_from_date IS NULL OR mr.payment_date IS NULL OR mr.payment_date >= p_from_date)
    AND (p_to_date IS NULL OR mr.payment_date IS NULL OR mr.payment_date <= p_to_date)
    AND (
      p_search_query IS NULL
      OR trim(p_search_query) = ''
      OR (
        SELECT bool_and(
          lower(
            concat_ws(
              ' ',
              mr.full_name,
              mr.company_name,
              mr.email,
              mr.mobile_number,
              mr.member_id,
              mr.state,
              mr.district,
              mr.payment_mode,
              mr.transaction_id,
              mr.bank_reference
            )
          ) LIKE '%' || lower(tok) || '%'
        )
        FROM unnest(string_to_array(trim(p_search_query), ' ')) AS tok
        WHERE length(trim(tok)) > 0
      )
    )
  ORDER BY COALESCE(mr.payment_date, mr.created_at::date) DESC, mr.created_at DESC
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
