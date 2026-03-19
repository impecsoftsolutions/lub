/*
  # Pending city workflow: auto-match, durable linkage, and admin resolve

  1. Join submission behavior
    - Add durable `pending_city_id` linkage on `member_registrations`
    - Auto-match "Other City" against existing approved cities in the same state+district
    - Create/attach pending city only when no approved match exists

  2. Admin pending-city behavior
    - List pending cities with association counts
    - Fetch associated member registrations for a pending city
    - Resolve pending city by final name:
      - match approved city if exists, otherwise create approved city
      - reassign all linked records
      - remove pending city row

  3. Security model
    - Admin-facing mutations use session-token wrappers
    - Server-side permission checks use has_permission(...)
*/

-- ============================================================================
-- Schema: durable pending city linkage for member registrations
-- ============================================================================

ALTER TABLE public.member_registrations
ADD COLUMN IF NOT EXISTS pending_city_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'member_registrations_pending_city_id_fkey'
      AND conrelid = 'public.member_registrations'::regclass
  ) THEN
    ALTER TABLE public.member_registrations
    ADD CONSTRAINT member_registrations_pending_city_id_fkey
    FOREIGN KEY (pending_city_id)
    REFERENCES public.cities_master(id)
    ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_member_registrations_pending_city_id
ON public.member_registrations(pending_city_id);

-- ============================================================================
-- Data backfill: normalize existing custom-city rows to durable model
-- ============================================================================

-- 1) Auto-resolve legacy custom cities that already match approved city names
WITH approved_match AS (
  SELECT
    mr.id AS registration_id,
    cm.city_name AS approved_city_name
  FROM public.member_registrations mr
  JOIN public.districts_master d
    ON lower(btrim(regexp_replace(d.district_name, '\s+', ' ', 'g')))
       = lower(btrim(regexp_replace(mr.district, '\s+', ' ', 'g')))
  JOIN public.states_master s
    ON s.id = d.state_id
   AND lower(btrim(regexp_replace(s.state_name, '\s+', ' ', 'g')))
       = lower(btrim(regexp_replace(mr.state, '\s+', ' ', 'g')))
  JOIN public.cities_master cm
    ON cm.district_id = d.id
   AND cm.status = 'approved'
   AND lower(btrim(regexp_replace(cm.city_name, '\s+', ' ', 'g')))
       = lower(btrim(regexp_replace(mr.other_city_name, '\s+', ' ', 'g')))
  WHERE mr.is_custom_city = true
    AND mr.other_city_name IS NOT NULL
    AND btrim(mr.other_city_name) <> ''
    AND mr.pending_city_id IS NULL
)
UPDATE public.member_registrations mr
SET
  city = am.approved_city_name,
  is_custom_city = false,
  other_city_name = NULL,
  pending_city_id = NULL
FROM approved_match am
WHERE mr.id = am.registration_id;

-- 2) Ensure pending city rows exist for unresolved legacy custom cities
WITH unresolved AS (
  SELECT
    lower(btrim(regexp_replace(mr.other_city_name, '\s+', ' ', 'g'))) AS city_name_normalized,
    MIN(btrim(mr.other_city_name)) AS city_name_display,
    d.id AS district_id,
    s.id AS state_id,
    MIN(mr.user_id::text)::uuid AS submitted_by
  FROM public.member_registrations mr
  JOIN public.districts_master d
    ON lower(btrim(regexp_replace(d.district_name, '\s+', ' ', 'g')))
       = lower(btrim(regexp_replace(mr.district, '\s+', ' ', 'g')))
  JOIN public.states_master s
    ON s.id = d.state_id
   AND lower(btrim(regexp_replace(s.state_name, '\s+', ' ', 'g')))
       = lower(btrim(regexp_replace(mr.state, '\s+', ' ', 'g')))
  LEFT JOIN public.cities_master cm_approved
    ON cm_approved.district_id = d.id
   AND cm_approved.status = 'approved'
   AND lower(btrim(regexp_replace(cm_approved.city_name, '\s+', ' ', 'g')))
       = lower(btrim(regexp_replace(mr.other_city_name, '\s+', ' ', 'g')))
  WHERE mr.is_custom_city = true
    AND mr.other_city_name IS NOT NULL
    AND btrim(mr.other_city_name) <> ''
    AND mr.pending_city_id IS NULL
    AND cm_approved.id IS NULL
  GROUP BY
    lower(btrim(regexp_replace(mr.other_city_name, '\s+', ' ', 'g'))),
    d.id,
    s.id
)
INSERT INTO public.cities_master (
  city_name,
  state_id,
  district_id,
  status,
  submitted_by,
  submission_source,
  notes
)
SELECT
  u.city_name_display,
  u.state_id,
  u.district_id,
  'pending',
  u.submitted_by,
  'registration_form',
  'Backfilled from member_registrations custom city'
FROM unresolved u
LEFT JOIN public.cities_master cm_pending
  ON cm_pending.status = 'pending'
 AND cm_pending.district_id = u.district_id
 AND lower(btrim(regexp_replace(cm_pending.city_name, '\s+', ' ', 'g'))) = u.city_name_normalized
WHERE cm_pending.id IS NULL;

-- 3) Link unresolved legacy custom-city rows to pending_city_id
UPDATE public.member_registrations mr
SET
  city = NULL,
  pending_city_id = cm_pending.id
FROM public.districts_master d
JOIN public.states_master s
  ON s.id = d.state_id
JOIN public.cities_master cm_pending
  ON cm_pending.status = 'pending'
 AND cm_pending.district_id = d.id
WHERE mr.is_custom_city = true
  AND mr.other_city_name IS NOT NULL
  AND btrim(mr.other_city_name) <> ''
  AND mr.pending_city_id IS NULL
  AND lower(btrim(regexp_replace(cm_pending.city_name, '\s+', ' ', 'g')))
      = lower(btrim(regexp_replace(mr.other_city_name, '\s+', ' ', 'g')))
  AND lower(btrim(regexp_replace(d.district_name, '\s+', ' ', 'g')))
      = lower(btrim(regexp_replace(mr.district, '\s+', ' ', 'g')))
  AND lower(btrim(regexp_replace(s.state_name, '\s+', ' ', 'g')))
      = lower(btrim(regexp_replace(mr.state, '\s+', ' ', 'g')));

-- ============================================================================
-- Join RPC: authoritative custom-city auto-match / pending-link behavior
-- ============================================================================

CREATE OR REPLACE FUNCTION public.submit_member_registration(
  p_user_id uuid,
  p_registration_data jsonb,
  p_gst_certificate_url text DEFAULT NULL,
  p_udyam_certificate_url text DEFAULT NULL,
  p_payment_proof_url text DEFAULT NULL,
  p_profile_photo_url text DEFAULT NULL
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

  v_city text;
  v_is_custom_city boolean;
  v_other_city_name text;
  v_state_name text;
  v_district_name text;

  v_state_id uuid;
  v_district_id uuid;
  v_normalized_other_city text;
  v_existing_approved_city_id uuid;
  v_existing_approved_city_name text;
  v_pending_city_id uuid;
BEGIN
  -- ============================================================================
  -- STEP 1: VALIDATE INPUT PARAMETERS
  -- ============================================================================

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

  -- ============================================================================
  -- STEP 2: AUTHENTICATE USER
  -- ============================================================================

  SELECT *
  INTO v_user_record
  FROM public.users
  WHERE id = p_user_id
    AND account_status = 'active';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found or inactive');
  END IF;

  -- ============================================================================
  -- STEP 3: CHECK EMAIL/MOBILE UNIQUENESS (excluding legacy members)
  -- ============================================================================

  SELECT COUNT(*)
  INTO v_existing_count
  FROM public.member_registrations
  WHERE LOWER(email) = LOWER(v_email)
    AND (is_legacy_member = false OR is_legacy_member IS NULL)
    AND status != 'rejected';

  IF v_existing_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'An application with this email address already exists');
  END IF;

  SELECT COUNT(*)
  INTO v_existing_count
  FROM public.member_registrations
  WHERE mobile_number = v_mobile
    AND (is_legacy_member = false OR is_legacy_member IS NULL)
    AND status != 'rejected';

  IF v_existing_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'An application with this mobile number already exists');
  END IF;

  -- ============================================================================
  -- STEP 4: RESOLVE CITY INPUT (AUTO-MATCH EXISTING OR CREATE/ATTACH PENDING)
  -- ============================================================================

  v_city := NULLIF(btrim(p_registration_data->>'city'), '');
  v_is_custom_city := COALESCE((p_registration_data->>'is_custom_city')::boolean, false);
  v_other_city_name := NULLIF(btrim(p_registration_data->>'other_city_name'), '');
  v_state_name := NULLIF(btrim(p_registration_data->>'state'), '');
  v_district_name := NULLIF(btrim(p_registration_data->>'district'), '');
  v_pending_city_id := NULL;

  IF v_is_custom_city = true AND v_other_city_name IS NOT NULL THEN
    v_normalized_other_city := lower(btrim(regexp_replace(v_other_city_name, '\s+', ' ', 'g')));

    SELECT
      d.id,
      d.state_id
    INTO
      v_district_id,
      v_state_id
    FROM public.districts_master d
    JOIN public.states_master s
      ON s.id = d.state_id
    WHERE lower(btrim(regexp_replace(d.district_name, '\s+', ' ', 'g')))
            = lower(btrim(regexp_replace(COALESCE(v_district_name, ''), '\s+', ' ', 'g')))
      AND lower(btrim(regexp_replace(s.state_name, '\s+', ' ', 'g')))
            = lower(btrim(regexp_replace(COALESCE(v_state_name, ''), '\s+', ' ', 'g')))
    LIMIT 1;

    -- A) Existing approved city match in same scope => auto-assign, no pending entry.
    IF v_district_id IS NOT NULL THEN
      SELECT
        cm.id,
        cm.city_name
      INTO
        v_existing_approved_city_id,
        v_existing_approved_city_name
      FROM public.cities_master cm
      WHERE cm.status = 'approved'
        AND cm.district_id = v_district_id
        AND lower(btrim(regexp_replace(cm.city_name, '\s+', ' ', 'g'))) = v_normalized_other_city
      ORDER BY cm.created_at ASC
      LIMIT 1;
    END IF;

    IF v_existing_approved_city_id IS NOT NULL THEN
      v_city := v_existing_approved_city_name;
      v_is_custom_city := false;
      v_other_city_name := NULL;
      v_pending_city_id := NULL;
    ELSE
      -- B) No approved match => create/attach pending city entry and keep custom text.
      v_city := NULL;
      v_is_custom_city := true;

      IF v_district_id IS NOT NULL THEN
        SELECT cm.id
        INTO v_pending_city_id
        FROM public.cities_master cm
        WHERE cm.status = 'pending'
          AND cm.district_id = v_district_id
          AND lower(btrim(regexp_replace(cm.city_name, '\s+', ' ', 'g'))) = v_normalized_other_city
        ORDER BY cm.created_at ASC
        LIMIT 1;

        IF v_pending_city_id IS NULL THEN
          INSERT INTO public.cities_master (
            city_name,
            state_id,
            district_id,
            status,
            submitted_by,
            submission_source,
            notes
          )
          VALUES (
            v_other_city_name,
            v_state_id,
            v_district_id,
            'pending',
            p_user_id,
            'registration_form',
            'Submitted from join form as Other City'
          )
          RETURNING id
          INTO v_pending_city_id;
        END IF;
      END IF;
    END IF;
  ELSE
    v_is_custom_city := false;
    v_other_city_name := NULL;
    v_pending_city_id := NULL;
  END IF;

  -- ============================================================================
  -- STEP 5: INSERT MEMBER REGISTRATION
  -- ============================================================================

  INSERT INTO public.member_registrations (
    user_id,
    full_name,
    gender,
    date_of_birth,
    email,
    mobile_number,
    company_name,
    company_designation_id,
    company_address,
    city,
    other_city_name,
    is_custom_city,
    pending_city_id,
    district,
    state,
    pin_code,
    industry,
    activity_type,
    constitution,
    annual_turnover,
    number_of_employees,
    products_services,
    brand_names,
    website,
    gst_registered,
    gst_number,
    pan_company,
    esic_registered,
    epf_registered,
    gst_certificate_url,
    udyam_certificate_url,
    payment_proof_url,
    profile_photo_url,
    referred_by,
    amount_paid,
    payment_date,
    payment_mode,
    transaction_id,
    bank_reference,
    alternate_contact_name,
    alternate_mobile,
    member_id,
    status,
    is_legacy_member,
    created_at,
    updated_at
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
    v_city,
    v_other_city_name,
    v_is_custom_city,
    v_pending_city_id,
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
    p_registration_data->>'amount_paid',
    (p_registration_data->>'payment_date')::date,
    p_registration_data->>'payment_mode',
    COALESCE(p_registration_data->>'transaction_id', ''),
    COALESCE(p_registration_data->>'bank_reference', ''),
    COALESCE(p_registration_data->>'alternate_contact_name', ''),
    COALESCE(p_registration_data->>'alternate_mobile', ''),
    p_registration_data->>'member_id',
    'pending',
    false,
    NOW(),
    NOW()
  )
  RETURNING id
  INTO v_registration_id;

  RETURN jsonb_build_object(
    'success', true,
    'registration_id', v_registration_id,
    'message', 'Registration submitted successfully'
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error in submit_member_registration: % %', SQLERRM, SQLSTATE;
    RETURN jsonb_build_object('success', false, 'error', 'Database error: ' || SQLERRM);
END;
$$;

-- ============================================================================
-- Admin RPCs: pending-city list, associations, and resolve
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_list_pending_cities_with_associations(
  p_requesting_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_items jsonb := '[]'::jsonb;
BEGIN
  IF p_requesting_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Requesting user ID is required');
  END IF;

  IF NOT (
    public.has_permission(p_requesting_user_id, 'locations.cities.view')
    OR public.has_permission(p_requesting_user_id, 'locations.cities.approve_pending')
    OR public.has_permission(p_requesting_user_id, 'locations.cities.manage')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  WITH pending AS (
    SELECT
      cm.id AS pending_city_id,
      lower(btrim(regexp_replace(cm.city_name, '\s+', ' ', 'g'))) AS other_city_name_normalized,
      btrim(cm.city_name) AS other_city_name_display,
      cm.state_id,
      cm.district_id,
      s.state_name,
      d.district_name,
      cm.created_at
    FROM public.cities_master cm
    LEFT JOIN public.states_master s
      ON s.id = cm.state_id
    LEFT JOIN public.districts_master d
      ON d.id = cm.district_id
    WHERE cm.status = 'pending'
  ),
  counts AS (
    SELECT
      p.pending_city_id,
      COUNT(mr.id)::integer AS associated_records_count,
      MAX(mr.created_at) AS latest_registration_created_at
    FROM pending p
    LEFT JOIN public.member_registrations mr
      ON mr.pending_city_id = p.pending_city_id
     AND mr.is_custom_city = true
    GROUP BY p.pending_city_id
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'key', p.pending_city_id::text,
        'pending_city_id', p.pending_city_id,
        'other_city_name_normalized', p.other_city_name_normalized,
        'other_city_name_display', p.other_city_name_display,
        'state_name', p.state_name,
        'district_name', p.district_name,
        'state_id', p.state_id,
        'district_id', p.district_id,
        'registrations_count', COALESCE(c.associated_records_count, 0),
        'associated_records_count', COALESCE(c.associated_records_count, 0),
        'latest_created_at', COALESCE(c.latest_registration_created_at, p.created_at)
      )
      ORDER BY COALESCE(c.latest_registration_created_at, p.created_at) DESC
    ),
    '[]'::jsonb
  )
  INTO v_items
  FROM pending p
  LEFT JOIN counts c
    ON c.pending_city_id = p.pending_city_id;

  RETURN jsonb_build_object('success', true, 'items', v_items);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_pending_city_associations(
  p_requesting_user_id uuid,
  p_pending_city_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_items jsonb := '[]'::jsonb;
  v_pending_city_exists boolean := false;
BEGIN
  IF p_requesting_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Requesting user ID is required');
  END IF;

  IF p_pending_city_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pending city ID is required');
  END IF;

  IF NOT (
    public.has_permission(p_requesting_user_id, 'locations.cities.view')
    OR public.has_permission(p_requesting_user_id, 'locations.cities.approve_pending')
    OR public.has_permission(p_requesting_user_id, 'locations.cities.manage')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.cities_master cm
    WHERE cm.id = p_pending_city_id
      AND cm.status = 'pending'
  )
  INTO v_pending_city_exists;

  IF NOT v_pending_city_exists THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pending city not found');
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'registration_id', mr.id,
        'full_name', mr.full_name,
        'email', mr.email,
        'mobile_number', mr.mobile_number,
        'company_name', mr.company_name,
        'status', mr.status,
        'state', mr.state,
        'district', mr.district,
        'city', mr.city,
        'other_city_name', mr.other_city_name,
        'created_at', mr.created_at
      )
      ORDER BY mr.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_items
  FROM public.member_registrations mr
  WHERE mr.pending_city_id = p_pending_city_id
    AND mr.is_custom_city = true;

  RETURN jsonb_build_object(
    'success', true,
    'items', v_items,
    'count', jsonb_array_length(v_items)
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_resolve_pending_city(
  p_requesting_user_id uuid,
  p_pending_city_id uuid,
  p_final_city_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pending_city RECORD;
  v_final_city_name text;
  v_final_city_name_normalized text;
  v_assigned_city_id uuid;
  v_assigned_city_name text;
  v_updated_count integer := 0;
BEGIN
  IF p_requesting_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Requesting user ID is required');
  END IF;

  IF p_pending_city_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pending city ID is required');
  END IF;

  v_final_city_name := NULLIF(btrim(p_final_city_name), '');
  IF v_final_city_name IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Final city name is required');
  END IF;

  IF NOT (
    public.has_permission(p_requesting_user_id, 'locations.cities.approve_pending')
    OR public.has_permission(p_requesting_user_id, 'locations.cities.manage')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  SELECT
    cm.id,
    cm.city_name,
    cm.state_id,
    cm.district_id,
    s.state_name,
    d.district_name
  INTO v_pending_city
  FROM public.cities_master cm
  LEFT JOIN public.states_master s
    ON s.id = cm.state_id
  LEFT JOIN public.districts_master d
    ON d.id = cm.district_id
  WHERE cm.id = p_pending_city_id
    AND cm.status = 'pending'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pending city already resolved or not found');
  END IF;

  v_final_city_name_normalized := lower(btrim(regexp_replace(v_final_city_name, '\s+', ' ', 'g')));

  -- Match existing approved city in same district first
  SELECT
    cm.id,
    cm.city_name
  INTO
    v_assigned_city_id,
    v_assigned_city_name
  FROM public.cities_master cm
  WHERE cm.status = 'approved'
    AND cm.district_id = v_pending_city.district_id
    AND lower(btrim(regexp_replace(cm.city_name, '\s+', ' ', 'g'))) = v_final_city_name_normalized
  ORDER BY cm.created_at ASC
  LIMIT 1;

  -- If no approved match, create one
  IF v_assigned_city_id IS NULL THEN
    INSERT INTO public.cities_master (
      city_name,
      state_id,
      district_id,
      status,
      submitted_by,
      reviewed_by,
      reviewed_at,
      submission_source,
      notes
    )
    VALUES (
      v_final_city_name,
      v_pending_city.state_id,
      v_pending_city.district_id,
      'approved',
      NULL,
      p_requesting_user_id,
      now(),
      'admin_entry',
      'Created while resolving pending city'
    )
    RETURNING id, city_name
    INTO v_assigned_city_id, v_assigned_city_name;
  END IF;

  UPDATE public.member_registrations mr
  SET
    city = v_assigned_city_name,
    is_custom_city = false,
    other_city_name = NULL,
    pending_city_id = NULL
  WHERE (
      mr.pending_city_id = p_pending_city_id
      OR (
        mr.pending_city_id IS NULL
        AND mr.is_custom_city = true
        AND mr.other_city_name IS NOT NULL
        AND lower(btrim(regexp_replace(mr.other_city_name, '\s+', ' ', 'g')))
            = lower(btrim(regexp_replace(v_pending_city.city_name, '\s+', ' ', 'g')))
        AND lower(btrim(regexp_replace(mr.district, '\s+', ' ', 'g')))
            = lower(btrim(regexp_replace(COALESCE(v_pending_city.district_name, ''), '\s+', ' ', 'g')))
        AND lower(btrim(regexp_replace(mr.state, '\s+', ' ', 'g')))
            = lower(btrim(regexp_replace(COALESCE(v_pending_city.state_name, ''), '\s+', ' ', 'g')))
      )
    );

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  DELETE FROM public.cities_master
  WHERE id = p_pending_city_id
    AND status = 'pending';

  RETURN jsonb_build_object(
    'success', true,
    'assigned_city_id', v_assigned_city_id,
    'assigned_city_name', v_assigned_city_name,
    'updated_count', v_updated_count
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'City already exists in this district');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ============================================================================
-- Compatibility: keep existing pending RPC contracts working
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_list_custom_city_pending(
  p_requesting_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.admin_list_pending_cities_with_associations(p_requesting_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_assign_custom_city(
  p_requesting_user_id uuid,
  p_state_name text,
  p_district_name text,
  p_other_city_name_normalized text,
  p_approved_city_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pending_city_id uuid;
  v_pending_district_id uuid;
  v_pending_state_id uuid;
  v_approved_city_name text;
  v_approved_district_id uuid;
  v_approved_state_id uuid;
BEGIN
  IF p_requesting_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Requesting user ID is required');
  END IF;

  IF p_state_name IS NULL OR btrim(p_state_name) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'State name is required');
  END IF;

  IF p_district_name IS NULL OR btrim(p_district_name) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'District name is required');
  END IF;

  IF p_other_city_name_normalized IS NULL OR btrim(p_other_city_name_normalized) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Other city name is required');
  END IF;

  IF p_approved_city_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Approved city ID is required');
  END IF;

  SELECT
    cm.city_name,
    cm.district_id,
    cm.state_id
  INTO
    v_approved_city_name,
    v_approved_district_id,
    v_approved_state_id
  FROM public.cities_master cm
  WHERE cm.id = p_approved_city_id
    AND cm.status = 'approved';

  IF v_approved_city_name IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Approved city not found');
  END IF;

  SELECT
    cm.id,
    cm.district_id,
    cm.state_id
  INTO
    v_pending_city_id,
    v_pending_district_id,
    v_pending_state_id
  FROM public.cities_master cm
  JOIN public.districts_master d
    ON d.id = cm.district_id
  JOIN public.states_master s
    ON s.id = d.state_id
  WHERE cm.status = 'pending'
    AND lower(btrim(regexp_replace(cm.city_name, '\s+', ' ', 'g')))
        = lower(btrim(regexp_replace(p_other_city_name_normalized, '\s+', ' ', 'g')))
    AND lower(btrim(regexp_replace(d.district_name, '\s+', ' ', 'g')))
        = lower(btrim(regexp_replace(p_district_name, '\s+', ' ', 'g')))
    AND lower(btrim(regexp_replace(s.state_name, '\s+', ' ', 'g')))
        = lower(btrim(regexp_replace(p_state_name, '\s+', ' ', 'g')))
  ORDER BY cm.created_at ASC
  LIMIT 1;

  IF v_pending_city_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pending city not found');
  END IF;

  IF v_approved_district_id IS DISTINCT FROM v_pending_district_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Approved city does not belong to district');
  END IF;

  IF v_approved_state_id IS NOT NULL
     AND v_pending_state_id IS NOT NULL
     AND v_approved_state_id IS DISTINCT FROM v_pending_state_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Approved city does not belong to state');
  END IF;

  RETURN public.admin_resolve_pending_city(
    p_requesting_user_id,
    v_pending_city_id,
    v_approved_city_name
  );
END;
$$;

-- ============================================================================
-- Session-token wrappers (Phase 1 model)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_list_pending_cities_with_associations_with_session(
  p_session_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_user_id uuid;
BEGIN
  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);

  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  RETURN public.admin_list_pending_cities_with_associations(v_actor_user_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_pending_cities_with_associations_with_session(text) TO PUBLIC;

CREATE OR REPLACE FUNCTION public.admin_get_pending_city_associations_with_session(
  p_session_token text,
  p_pending_city_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_user_id uuid;
BEGIN
  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);

  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  RETURN public.admin_get_pending_city_associations(v_actor_user_id, p_pending_city_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_pending_city_associations_with_session(text, uuid) TO PUBLIC;

CREATE OR REPLACE FUNCTION public.admin_resolve_pending_city_with_session(
  p_session_token text,
  p_pending_city_id uuid,
  p_final_city_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_user_id uuid;
BEGIN
  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);

  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  RETURN public.admin_resolve_pending_city(
    v_actor_user_id,
    p_pending_city_id,
    p_final_city_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_resolve_pending_city_with_session(text, uuid, text) TO PUBLIC;

-- Keep old list wrapper contract but route to new list behavior.
CREATE OR REPLACE FUNCTION public.admin_list_custom_city_pending_with_session(
  p_session_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_user_id uuid;
BEGIN
  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);

  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  RETURN public.admin_list_pending_cities_with_associations(v_actor_user_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_custom_city_pending_with_session(text) TO PUBLIC;
