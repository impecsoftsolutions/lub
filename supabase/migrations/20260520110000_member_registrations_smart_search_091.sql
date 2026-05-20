/*
  COD-MEMBERS-REGISTRATION-SMART-SEARCH-ALL-FIELDS-091

  Expands get_admin_member_registrations search coverage from 4 fields to 18 fields
  and switches to AND-token matching so multi-word queries (e.g. "Kanakadurga Guntur")
  only return rows that contain every whitespace-separated token.

  Changes:
  - WHERE clause replaces four standalone ILIKE conditions with a concat_ws search blob
    covering: full_name, email, mobile_number, company_name, company_address, city,
    district, state, pin_code, products_services, brand_names, website, referred_by,
    member_id, gst_number, pan_company, alternate_contact_name, alternate_mobile
  - Each whitespace-separated token must appear somewhere in the blob (AND logic)
  - Single-token queries behave identically to before but now cover more fields
  - The session-token wrapper delegates to this function unchanged — it benefits
    automatically once the base function is replaced

  No new tables, columns, or types introduced. NOTIFY pgrst to reload schema cache.
*/

-- Replace the base function only. The _with_session wrapper is unchanged.
CREATE OR REPLACE FUNCTION public.get_admin_member_registrations(
  p_requesting_user_id uuid,
  p_status_filter       text    DEFAULT NULL,
  p_search_query        text    DEFAULT NULL,
  p_state_filter        text    DEFAULT NULL,
  p_limit               integer DEFAULT 100,
  p_offset              integer DEFAULT 0
)
RETURNS SETOF public.admin_member_registration_type
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_record   RECORD;
  v_is_authorized boolean := false;
BEGIN
  -- ── 1. Validate input ──────────────────────────────────────────────────────
  IF p_requesting_user_id IS NULL THEN
    RETURN;
  END IF;

  -- ── 2. Authenticate requesting user ───────────────────────────────────────
  SELECT * INTO v_user_record
  FROM users
  WHERE id = p_requesting_user_id
    AND account_status = 'active';

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- ── 3. Authorise ──────────────────────────────────────────────────────────
  IF v_user_record.account_type IN ('admin', 'both') THEN
    v_is_authorized := true;
  END IF;

  IF NOT v_is_authorized THEN
    SELECT EXISTS(
      SELECT 1 FROM user_roles
      WHERE user_id = p_requesting_user_id
        AND role IN ('super_admin', 'admin', 'editor', 'viewer')
    ) INTO v_is_authorized;
  END IF;

  IF NOT v_is_authorized THEN
    RETURN;
  END IF;

  -- ── 4. Execute query ───────────────────────────────────────────────────────
  RETURN QUERY
  SELECT
    mr.id,
    mr.full_name,
    mr.gender,
    mr.date_of_birth,
    mr.email,
    mr.mobile_number,
    mr.company_name,
    mr.company_designation_id,
    cd.designation_name,
    mr.company_address,
    mr.city,
    mr.other_city_name,
    mr.is_custom_city,
    mr.district,
    mr.state,
    mr.pin_code,
    mr.industry,
    mr.activity_type,
    mr.constitution,
    mr.annual_turnover,
    mr.number_of_employees,
    mr.products_services,
    mr.brand_names,
    mr.website,
    mr.gst_registered,
    mr.gst_number,
    mr.pan_company,
    mr.esic_registered,
    mr.epf_registered,
    mr.gst_certificate_url,
    mr.udyam_certificate_url,
    mr.payment_proof_url,
    mr.profile_photo_url,
    mr.referred_by,
    mr.amount_paid,
    mr.payment_date,
    mr.payment_mode,
    mr.transaction_id,
    mr.bank_reference,
    mr.alternate_contact_name,
    mr.alternate_mobile,
    mr.member_id,
    mr.is_active,
    mr.deactivated_at,
    mr.deactivated_by,
    mr.status,
    mr.is_legacy_member,
    mr.reapplication_count,
    mr.approval_date,
    mr.rejection_reason,
    mr.user_id,
    mr.last_modified_by,
    mr.last_modified_at,
    mr.first_viewed_at,
    mr.first_viewed_by,
    mr.reviewed_count,
    mr.submission_id,
    mr.created_at,
    mr.updated_at
  FROM member_registrations mr
  LEFT JOIN company_designations cd ON cd.id = mr.company_designation_id
  WHERE
    (p_status_filter IS NULL OR mr.status = p_status_filter)
    AND (p_state_filter  IS NULL OR mr.state  = p_state_filter)
    AND (
      p_search_query IS NULL
      OR (
        -- AND-token matching: every whitespace-separated token must appear
        -- somewhere inside the concatenated search blob.
        SELECT bool_and(
          lower(
            concat_ws(' ',
              mr.full_name,
              mr.email,
              mr.mobile_number,
              mr.company_name,
              mr.company_address,
              mr.city,
              mr.district,
              mr.state,
              mr.pin_code,
              mr.products_services,
              mr.brand_names,
              mr.website,
              mr.referred_by,
              mr.member_id,
              mr.gst_number,
              mr.pan_company,
              mr.alternate_contact_name,
              mr.alternate_mobile
            )
          ) LIKE '%' || lower(tok) || '%'
        )
        FROM unnest(string_to_array(trim(p_search_query), ' ')) AS tok
        WHERE length(trim(tok)) > 0
      )
    )
  ORDER BY mr.created_at DESC
  LIMIT  p_limit
  OFFSET p_offset;

END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_member_registrations(uuid, text, text, text, integer, integer) TO authenticated;

-- Reload PostgREST schema cache so the updated function signature is visible immediately
NOTIFY pgrst, 'reload schema';
