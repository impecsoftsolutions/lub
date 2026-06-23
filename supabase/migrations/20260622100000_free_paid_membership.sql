/*
  CLU-FREE-PAID-MEMBERSHIP-001

  Defines the Free vs Paid membership process on top of the existing
  registration/payment/member system. Coordinated plan, reviewed by Codex.

  Summary of changes (all additive / backward compatible):
   1. member_registrations gets an explicit membership_application_type
      ('free' | 'paid'), default 'paid' so every existing + in-flight row
      keeps today's paid behavior. No backfill risk.
   2. submit_member_registration accepts + stores the type and enforces
      "paid application must have payment proof" at the RPC layer. Free
      applications may omit payment proof; safe placeholders fill the
      NOT NULL payment columns.
   3. update_member_registration_status promotes users.account_type to
      'member' ONLY when the approved registration is type='paid'. Free
      approvals stay general_user (confirmed Free Member, no paid benefits).
   4. create_showcase_listing_with_session now gates on paid status
      (account_type in member/both) — the single canonical paid gate — and
      fixes the latent user_id lookup (was comparing the text member_id
      certificate column to a uuid).
   5. New get_member_registration_types_with_session read RPC powers the
      admin All/Free/Paid filter + per-row badge without altering the
      admin_member_registration_type composite type.
   6. New membership_upgrade_requests table + RPCs for the Free->Paid
      upgrade. The approved-Free registration row is never mutated until an
      upgrade is APPROVED; approval is atomic (promote account_type +
      stamp the registration paid in one transaction).

  Backend enum users.account_type is NOT renamed.
  NOTE: confirm this migration is actually applied to the linked DB before
  the frontend depends on it.
*/

-- ============================================================================
-- 1. Explicit Free/Paid type on member_registrations
-- ============================================================================
ALTER TABLE public.member_registrations
  ADD COLUMN IF NOT EXISTS membership_application_type text NOT NULL DEFAULT 'paid';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'member_registrations_membership_application_type_check'
  ) THEN
    ALTER TABLE public.member_registrations
      ADD CONSTRAINT member_registrations_membership_application_type_check
      CHECK (membership_application_type IN ('free', 'paid'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_member_registrations_membership_type
  ON public.member_registrations (membership_application_type);

-- ============================================================================
-- 2. submit_member_registration — store type + enforce paid-needs-proof
--    (DROP + CREATE because we add a parameter; only the frontend calls it)
-- ============================================================================
DROP FUNCTION IF EXISTS public.submit_member_registration(uuid, jsonb, text, text, text, text);

CREATE FUNCTION public.submit_member_registration(
  p_user_id uuid,
  p_registration_data jsonb,
  p_gst_certificate_url text DEFAULT NULL,
  p_udyam_certificate_url text DEFAULT NULL,
  p_payment_proof_url text DEFAULT NULL,
  p_profile_photo_url text DEFAULT NULL,
  p_membership_application_type text DEFAULT 'paid'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_record RECORD;
  v_registration_id uuid;
  v_email text;
  v_mobile text;
  v_existing_count integer;
  v_type text;
  v_amount text;
  v_payment_mode text;
  v_payment_date date;
BEGIN
  -- Normalize the membership type (default paid for legacy/unknown callers).
  v_type := lower(coalesce(nullif(trim(p_membership_application_type), ''), 'paid'));
  IF v_type NOT IN ('free', 'paid') THEN
    v_type := 'paid';
  END IF;

  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User ID is required');
  END IF;

  IF p_registration_data IS NULL OR p_registration_data = '{}'::jsonb THEN
    RETURN jsonb_build_object('success', false, 'error', 'Registration data is required');
  END IF;

  v_email := p_registration_data->>'email';
  v_mobile := p_registration_data->>'mobile_number';

  IF v_email IS NULL OR v_email = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Email is required');
  END IF;

  IF v_mobile IS NULL OR v_mobile = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Mobile number is required');
  END IF;

  -- Paid applications must carry payment proof (server-side enforcement).
  IF v_type = 'paid' AND coalesce(trim(p_payment_proof_url), '') = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Payment proof is required for a Paid Membership application'
    );
  END IF;

  SELECT * INTO v_user_record
  FROM users
  WHERE id = p_user_id
    AND account_status = 'active';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found or inactive');
  END IF;

  SELECT COUNT(*) INTO v_existing_count
  FROM member_registrations
  WHERE LOWER(email) = LOWER(v_email)
    AND (is_legacy_member = false OR is_legacy_member IS NULL)
    AND status != 'rejected';

  IF v_existing_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'An application with this email address already exists');
  END IF;

  SELECT COUNT(*) INTO v_existing_count
  FROM member_registrations
  WHERE mobile_number = v_mobile
    AND (is_legacy_member = false OR is_legacy_member IS NULL)
    AND status != 'rejected';

  IF v_existing_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'An application with this mobile number already exists');
  END IF;

  -- Free applications are not charged; fill the NOT NULL payment columns
  -- with safe placeholders when the client did not provide them.
  IF v_type = 'free' THEN
    v_amount       := coalesce(nullif(p_registration_data->>'amount_paid', ''), '0');
    v_payment_mode := coalesce(nullif(p_registration_data->>'payment_mode', ''), 'Not applicable');
    v_payment_date := coalesce(nullif(p_registration_data->>'payment_date', '')::date, current_date);
  ELSE
    v_amount       := p_registration_data->>'amount_paid';
    v_payment_mode := p_registration_data->>'payment_mode';
    v_payment_date := (p_registration_data->>'payment_date')::date;
  END IF;

  INSERT INTO member_registrations (
    user_id,
    full_name, gender, date_of_birth, email, mobile_number,
    company_name, company_designation_id, company_address, city,
    other_city_name, is_custom_city, district, state, pin_code,
    industry, activity_type, constitution, annual_turnover,
    number_of_employees, products_services, brand_names, website,
    gst_registered, gst_number, pan_company, esic_registered, epf_registered,
    gst_certificate_url, udyam_certificate_url, payment_proof_url, profile_photo_url,
    referred_by, amount_paid, payment_date, payment_mode, transaction_id, bank_reference,
    alternate_contact_name, alternate_mobile,
    member_id,
    membership_application_type,
    status, is_legacy_member,
    created_at, updated_at
  ) VALUES (
    p_user_id,
    p_registration_data->>'full_name',
    p_registration_data->>'gender',
    (p_registration_data->>'date_of_birth')::date,
    p_registration_data->>'email',
    p_registration_data->>'mobile_number',
    p_registration_data->>'company_name',
    (p_registration_data->>'company_designation_id')::uuid,
    p_registration_data->>'company_address',
    p_registration_data->>'city',
    p_registration_data->>'other_city_name',
    COALESCE((p_registration_data->>'is_custom_city')::boolean, false),
    p_registration_data->>'district',
    p_registration_data->>'state',
    p_registration_data->>'pin_code',
    p_registration_data->>'industry',
    p_registration_data->>'activity_type',
    p_registration_data->>'constitution',
    p_registration_data->>'annual_turnover',
    p_registration_data->>'number_of_employees',
    p_registration_data->>'products_services',
    COALESCE(p_registration_data->>'brand_names', ''),
    COALESCE(p_registration_data->>'website', ''),
    p_registration_data->>'gst_registered',
    COALESCE(p_registration_data->>'gst_number', ''),
    p_registration_data->>'pan_company',
    p_registration_data->>'esic_registered',
    p_registration_data->>'epf_registered',
    COALESCE(p_gst_certificate_url, ''),
    COALESCE(p_udyam_certificate_url, ''),
    COALESCE(p_payment_proof_url, ''),
    COALESCE(p_profile_photo_url, ''),
    COALESCE(p_registration_data->>'referred_by', ''),
    v_amount,
    v_payment_date,
    v_payment_mode,
    COALESCE(p_registration_data->>'transaction_id', ''),
    COALESCE(p_registration_data->>'bank_reference', ''),
    COALESCE(p_registration_data->>'alternate_contact_name', ''),
    COALESCE(p_registration_data->>'alternate_mobile', ''),
    p_registration_data->>'member_id',
    v_type,
    'pending',
    false,
    NOW(), NOW()
  )
  RETURNING id INTO v_registration_id;

  RETURN jsonb_build_object(
    'success', true,
    'registration_id', v_registration_id,
    'membership_application_type', v_type,
    'message', 'Registration submitted successfully'
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error in submit_member_registration: % %', SQLERRM, SQLSTATE;
    RETURN jsonb_build_object('success', false, 'error', 'Database error: ' || SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_member_registration(uuid, jsonb, text, text, text, text, text) TO anon, authenticated;

-- ============================================================================
-- 3. update_member_registration_status — promote account_type only for PAID
--    (same signature; CREATE OR REPLACE)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_member_registration_status(
  p_registration_id uuid,
  p_requesting_user_id uuid,
  p_new_status text,
  p_rejection_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_record RECORD;
  v_registration_record RECORD;
  v_is_authorized boolean := false;
  v_user_id_to_update uuid;
  v_result jsonb;
BEGIN
  IF p_registration_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Registration ID is required');
  END IF;
  IF p_requesting_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Requesting user ID is required');
  END IF;
  IF p_new_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Status is required');
  END IF;
  IF p_new_status NOT IN ('approved', 'rejected') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Status must be either ''approved'' or ''rejected''');
  END IF;
  IF p_new_status = 'rejected' AND (p_rejection_reason IS NULL OR trim(p_rejection_reason) = '') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Rejection reason is required when rejecting a registration');
  END IF;

  SELECT * INTO v_user_record
  FROM users
  WHERE id = p_requesting_user_id
    AND account_status = 'active';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found or inactive');
  END IF;

  IF v_user_record.account_type IN ('admin', 'both') THEN
    v_is_authorized := true;
  END IF;

  IF NOT v_is_authorized THEN
    SELECT EXISTS(
      SELECT 1 FROM user_roles
      WHERE user_id = p_requesting_user_id
        AND role IN ('super_admin', 'admin', 'editor')
    ) INTO v_is_authorized;
  END IF;

  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object('success', false, 'error', 'User does not have permission to update registration status');
  END IF;

  SELECT * INTO v_registration_record
  FROM member_registrations
  WHERE id = p_registration_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Registration not found');
  END IF;

  UPDATE member_registrations
  SET status = p_new_status,
      rejection_reason = CASE WHEN p_new_status = 'rejected' THEN p_rejection_reason ELSE rejection_reason END,
      approval_date = CASE WHEN p_new_status = 'approved' THEN COALESCE(approval_date, now()) ELSE approval_date END,
      last_modified_by = p_requesting_user_id,
      last_modified_at = now()
  WHERE id = p_registration_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Failed to update registration status');
  END IF;

  -- Resolve user_id (harmless for both free and paid) ...
  IF p_new_status = 'approved' THEN
    v_user_id_to_update := v_registration_record.user_id;

    IF v_user_id_to_update IS NULL THEN
      SELECT u.id
      INTO v_user_id_to_update
      FROM users u
      WHERE (
        (v_registration_record.email IS NOT NULL AND u.email = v_registration_record.email)
        OR (v_registration_record.mobile_number IS NOT NULL AND u.mobile_number = v_registration_record.mobile_number)
      )
      AND (
        SELECT COUNT(*)
        FROM users u2
        WHERE (
          (v_registration_record.email IS NOT NULL AND u2.email = v_registration_record.email)
          OR (v_registration_record.mobile_number IS NOT NULL AND u2.mobile_number = v_registration_record.mobile_number)
        )
      ) = 1;

      IF v_user_id_to_update IS NOT NULL THEN
        UPDATE member_registrations
        SET user_id = v_user_id_to_update
        WHERE id = p_registration_id
          AND user_id IS NULL;
      END IF;
    END IF;

    -- ... but promote account_type to 'member' ONLY for PAID applications.
    -- Free approvals remain general_user (confirmed Free Member, no paid benefits).
    IF v_user_id_to_update IS NOT NULL
       AND COALESCE(v_registration_record.membership_application_type, 'paid') = 'paid' THEN
      UPDATE users
      SET account_type = CASE WHEN account_type = 'general_user' THEN 'member' ELSE account_type END,
          updated_at = now()
      WHERE id = v_user_id_to_update;
    END IF;
  END IF;

  INSERT INTO member_audit_history (member_id, action_type, changed_by, change_reason, created_at)
  VALUES (
    p_registration_id,
    'status_change',
    p_requesting_user_id,
    CASE WHEN p_new_status = 'rejected' THEN p_rejection_reason ELSE 'Status changed to ' || p_new_status END,
    now()
  );

  SELECT (to_jsonb(mr.*) || jsonb_build_object('company_designation_name', cd.designation_name))
  INTO v_result
  FROM member_registrations mr
  LEFT JOIN company_designations cd ON mr.company_designation_id = cd.id
  WHERE mr.id = p_registration_id;

  RETURN jsonb_build_object('success', true, 'registration', v_result);

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error in update_member_registration_status: % %', SQLERRM, SQLSTATE;
    RETURN jsonb_build_object('success', false, 'error', 'Database error: ' || SQLERRM);
END;
$$;

-- ============================================================================
-- 4. create_showcase_listing_with_session — gate on PAID (account_type)
--    and fix the user_id lookup for the member snapshot.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_showcase_listing_with_session(
  p_session_token       text,
  p_title               text,
  p_product_service_name text,
  p_category            text,
  p_short_description   text,
  p_detailed_description text,
  p_state               text,
  p_district            text,
  p_photo_url           text,
  p_contact_preference  text DEFAULT 'member_contact'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_user_id      uuid;
  v_account_type text;
  v_member_name  text;
  v_company_name text;
  v_state        text;
  v_new_id       uuid;
BEGIN
  v_user_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Session invalid or expired.', 'error_code', 'session_invalid');
  END IF;

  SELECT account_type INTO v_account_type FROM public.users WHERE id = v_user_id;

  -- Canonical paid gate: only approved paid members (account_type) may post.
  IF COALESCE(v_account_type, '') NOT IN ('member', 'both') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',  'Only approved paid LUB members can create showcase listings.',
      'error_code', 'not_approved_member'
    );
  END IF;

  -- Member snapshot from the latest approved registration (by user_id).
  SELECT mr.full_name, mr.company_name, mr.state
  INTO v_member_name, v_company_name, v_state
  FROM public.member_registrations mr
  WHERE mr.user_id = v_user_id
    AND mr.status = 'approved'
    AND mr.is_active = true
  ORDER BY mr.created_at DESC
  LIMIT 1;

  IF trim(COALESCE(p_title, '')) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Title is required.', 'error_code', 'validation_error');
  END IF;
  IF trim(COALESCE(p_short_description, '')) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Short description is required.', 'error_code', 'validation_error');
  END IF;

  INSERT INTO public.showcase_listings (
    member_id, company_name_snapshot, member_name_snapshot, state_snapshot,
    title, product_service_name, category,
    short_description, detailed_description,
    state, district, photo_url, contact_preference,
    status
  ) VALUES (
    v_user_id, v_company_name, v_member_name, v_state,
    trim(p_title),
    nullif(trim(COALESCE(p_product_service_name, '')), ''),
    nullif(trim(COALESCE(p_category, '')), ''),
    trim(p_short_description),
    nullif(trim(COALESCE(p_detailed_description, '')), ''),
    nullif(trim(COALESCE(p_state, '')), ''),
    nullif(trim(COALESCE(p_district, '')), ''),
    nullif(trim(COALESCE(p_photo_url, '')), ''),
    COALESCE(nullif(trim(p_contact_preference), ''), 'member_contact'),
    'draft'
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('success', true, 'id', v_new_id);

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error in create_showcase_listing_with_session: % %', SQLERRM, SQLSTATE;
    RETURN jsonb_build_object('success', false, 'error', 'Database error.', 'error_code', 'db_error');
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_showcase_listing_with_session(text, text, text, text, text, text, text, text, text, text) TO anon, authenticated;

-- ============================================================================
-- 5. Admin read RPC: registration id -> membership type (filter + badge)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_member_registration_types_with_session(
  p_session_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_user_id uuid;
  v_is_authorized boolean := false;
  v_result jsonb;
BEGIN
  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  SELECT EXISTS(
    SELECT 1
    FROM users u
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    WHERE u.id = v_actor_user_id
      AND u.account_status = 'active'
      AND (u.account_type IN ('admin', 'both') OR ur.role IN ('super_admin', 'admin', 'editor', 'viewer'))
  ) INTO v_is_authorized;

  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', mr.id, 'type', mr.membership_application_type)), '[]'::jsonb)
  INTO v_result
  FROM member_registrations mr;

  RETURN jsonb_build_object('success', true, 'items', v_result);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_member_registration_types_with_session(text) TO anon, authenticated;

-- ============================================================================
-- 6. Free -> Paid upgrade requests
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.membership_upgrade_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  registration_id uuid REFERENCES public.member_registrations(id) ON DELETE SET NULL,
  state text,
  amount text,
  payment_mode text,
  payment_date date,
  payment_proof_url text NOT NULL,
  transaction_id text,
  bank_reference text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_note text,
  reviewed_by uuid REFERENCES public.users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_membership_upgrade_requests_user ON public.membership_upgrade_requests (user_id);
CREATE INDEX IF NOT EXISTS idx_membership_upgrade_requests_status ON public.membership_upgrade_requests (status);

-- Deny all direct table access; all reads/writes go through _with_session RPCs.
ALTER TABLE public.membership_upgrade_requests ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 6a. Member submits an upgrade request
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_membership_upgrade_with_session(
  p_session_token     text,
  p_state             text,
  p_amount            text,
  p_payment_mode      text,
  p_payment_date      date,
  p_payment_proof_url text,
  p_transaction_id    text DEFAULT NULL,
  p_bank_reference    text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id        uuid;
  v_account_type   text;
  v_registration_id uuid;
  v_new_id         uuid;
BEGIN
  v_user_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Session invalid or expired.', 'error_code', 'session_invalid');
  END IF;

  IF coalesce(trim(p_payment_proof_url), '') = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment proof is required to upgrade.', 'error_code', 'validation_error');
  END IF;

  SELECT account_type INTO v_account_type FROM users WHERE id = v_user_id;

  IF v_account_type IN ('member', 'both') THEN
    RETURN jsonb_build_object('success', false, 'error', 'You are already a paid member.', 'error_code', 'already_paid');
  END IF;

  -- Must have an approved Free registration to upgrade from.
  SELECT id INTO v_registration_id
  FROM member_registrations
  WHERE user_id = v_user_id
    AND status = 'approved'
    AND is_active = true
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_registration_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'An approved Free Membership is required before upgrading. Please apply first.',
      'error_code', 'no_registration'
    );
  END IF;

  -- One open request at a time.
  IF EXISTS (SELECT 1 FROM membership_upgrade_requests WHERE user_id = v_user_id AND status = 'pending') THEN
    RETURN jsonb_build_object('success', false, 'error', 'You already have an upgrade request under review.', 'error_code', 'pending_exists');
  END IF;

  INSERT INTO membership_upgrade_requests (
    user_id, registration_id, state, amount, payment_mode, payment_date,
    payment_proof_url, transaction_id, bank_reference, status
  ) VALUES (
    v_user_id, v_registration_id,
    nullif(trim(COALESCE(p_state, '')), ''),
    nullif(trim(COALESCE(p_amount, '')), ''),
    nullif(trim(COALESCE(p_payment_mode, '')), ''),
    p_payment_date,
    trim(p_payment_proof_url),
    nullif(trim(COALESCE(p_transaction_id, '')), ''),
    nullif(trim(COALESCE(p_bank_reference, '')), ''),
    'pending'
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('success', true, 'id', v_new_id);
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error in submit_membership_upgrade_with_session: % %', SQLERRM, SQLSTATE;
    RETURN jsonb_build_object('success', false, 'error', 'Database error.', 'error_code', 'db_error');
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_membership_upgrade_with_session(text, text, text, text, date, text, text, text) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 6b. Member reads their latest upgrade request
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_membership_upgrade_request_with_session(
  p_session_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_row jsonb;
BEGIN
  v_user_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  SELECT to_jsonb(r.*)
  INTO v_row
  FROM membership_upgrade_requests r
  WHERE r.user_id = v_user_id
  ORDER BY r.created_at DESC
  LIMIT 1;

  RETURN jsonb_build_object('success', true, 'request', v_row);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_membership_upgrade_request_with_session(text) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 6c. Admin lists upgrade requests
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_membership_upgrade_requests_with_session(
  p_session_token text,
  p_status_filter text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_user_id uuid;
  v_is_authorized boolean := false;
  v_result jsonb;
BEGIN
  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  SELECT EXISTS(
    SELECT 1
    FROM users u
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    WHERE u.id = v_actor_user_id
      AND u.account_status = 'active'
      AND (u.account_type IN ('admin', 'both') OR ur.role IN ('super_admin', 'admin', 'editor', 'viewer'))
  ) INTO v_is_authorized;

  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  SELECT COALESCE(jsonb_agg(row_obj ORDER BY (row_obj->>'created_at') DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'id', r.id,
      'user_id', r.user_id,
      'registration_id', r.registration_id,
      'state', r.state,
      'amount', r.amount,
      'payment_mode', r.payment_mode,
      'payment_date', r.payment_date,
      'payment_proof_url', r.payment_proof_url,
      'transaction_id', r.transaction_id,
      'bank_reference', r.bank_reference,
      'status', r.status,
      'admin_note', r.admin_note,
      'reviewed_by', r.reviewed_by,
      'reviewed_at', r.reviewed_at,
      'created_at', r.created_at,
      'updated_at', r.updated_at,
      'full_name', mr.full_name,
      'company_name', mr.company_name,
      'email', mr.email,
      'mobile_number', mr.mobile_number,
      'member_account_type', u.account_type
    ) AS row_obj
    FROM membership_upgrade_requests r
    LEFT JOIN member_registrations mr ON mr.id = r.registration_id
    LEFT JOIN users u ON u.id = r.user_id
    WHERE (p_status_filter IS NULL OR r.status = p_status_filter)
  ) sub;

  RETURN jsonb_build_object('success', true, 'items', v_result);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_membership_upgrade_requests_with_session(text, text) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 6d. Admin reviews (approve / reject) an upgrade request — atomic
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_review_membership_upgrade_with_session(
  p_session_token text,
  p_request_id    uuid,
  p_action        text,
  p_admin_note    text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_user_id uuid;
  v_is_authorized boolean := false;
  v_request RECORD;
BEGIN
  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  -- Write action: require admin/editor (not viewer).
  SELECT EXISTS(
    SELECT 1
    FROM users u
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    WHERE u.id = v_actor_user_id
      AND u.account_status = 'active'
      AND (u.account_type IN ('admin', 'both') OR ur.role IN ('super_admin', 'admin', 'editor'))
  ) INTO v_is_authorized;

  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  IF p_action NOT IN ('approve', 'reject') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid action.');
  END IF;

  SELECT * INTO v_request FROM membership_upgrade_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Upgrade request not found.');
  END IF;
  IF v_request.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'This request has already been reviewed.');
  END IF;

  IF p_action = 'reject' THEN
    UPDATE membership_upgrade_requests
    SET status = 'rejected', admin_note = p_admin_note, reviewed_by = v_actor_user_id, reviewed_at = now(), updated_at = now()
    WHERE id = p_request_id;
    RETURN jsonb_build_object('success', true, 'status', 'rejected');
  END IF;

  -- APPROVE (atomic): mark request approved, promote account_type, stamp the
  -- existing registration as paid with the upgrade's payment details.
  UPDATE membership_upgrade_requests
  SET status = 'approved', admin_note = p_admin_note, reviewed_by = v_actor_user_id, reviewed_at = now(), updated_at = now()
  WHERE id = p_request_id;

  UPDATE users
  SET account_type = CASE WHEN account_type = 'general_user' THEN 'member' ELSE account_type END,
      updated_at = now()
  WHERE id = v_request.user_id;

  IF v_request.registration_id IS NOT NULL THEN
    UPDATE member_registrations
    SET membership_application_type = 'paid',
        payment_proof_url = COALESCE(NULLIF(v_request.payment_proof_url, ''), payment_proof_url),
        amount_paid       = COALESCE(NULLIF(v_request.amount, ''), amount_paid),
        payment_mode      = COALESCE(NULLIF(v_request.payment_mode, ''), payment_mode),
        payment_date      = COALESCE(v_request.payment_date, payment_date),
        transaction_id    = COALESCE(NULLIF(v_request.transaction_id, ''), transaction_id),
        bank_reference    = COALESCE(NULLIF(v_request.bank_reference, ''), bank_reference),
        last_modified_by  = v_actor_user_id,
        last_modified_at  = now()
    WHERE id = v_request.registration_id;

    INSERT INTO member_audit_history (member_id, action_type, changed_by, change_reason, created_at)
    VALUES (v_request.registration_id, 'membership_upgrade', v_actor_user_id, 'Free to Paid upgrade approved', now());
  END IF;

  RETURN jsonb_build_object('success', true, 'status', 'approved');
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error in admin_review_membership_upgrade_with_session: % %', SQLERRM, SQLSTATE;
    RETURN jsonb_build_object('success', false, 'error', 'Database error.', 'error_code', 'db_error');
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_review_membership_upgrade_with_session(text, uuid, text, text) TO anon, authenticated;

-- Reload PostgREST schema cache so new/updated signatures are visible.
NOTIFY pgrst, 'reload schema';
