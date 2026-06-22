/*
  COD-MSME-SHOWCASE-001

  Creates the Business Showcase feature and Membership Plan configurable content.

  Tables:
    - showcase_listings        — member product/service showcase entries
    - membership_plan_settings — configurable free/paid plan title and subtitle
    - membership_plan_features — configurable feature comparison rows

  RPCs (all SECURITY DEFINER):
    Public:
      get_public_showcase_listings           — browse approved listings
    Member (session-token secured):
      get_member_showcase_listings_with_session
      create_showcase_listing_with_session
      update_showcase_listing_with_session
      submit_showcase_listing_with_session
      delete_showcase_listing_with_session
    Admin (session-token + permission secured):
      admin_get_showcase_listings_with_session
      admin_update_showcase_listing_status_with_session
      admin_update_membership_plan_settings_with_session
      admin_upsert_membership_plan_feature_with_session
*/

BEGIN;

-- ============================================================
-- 1. Tables
-- ============================================================

CREATE TABLE IF NOT EXISTS public.showcase_listings (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id             uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- Snapshot of member info at time of creation (stays accurate if member updates profile)
  company_name_snapshot text,
  member_name_snapshot  text,
  state_snapshot        text,
  -- Listing content
  title                 text        NOT NULL,
  product_service_name  text,
  category              text,
  short_description     text        NOT NULL,
  detailed_description  text,
  state                 text,
  district              text,
  contact_preference    text        NOT NULL DEFAULT 'member_contact'
                                    CHECK (contact_preference IN ('member_contact', 'email', 'phone', 'any')),
  photo_url             text,
  -- Moderation
  status                text        NOT NULL DEFAULT 'draft'
                                    CHECK (status IN ('draft', 'pending_review', 'approved', 'rejected', 'archived')),
  admin_note            text,
  submitted_at          timestamptz,
  reviewed_at           timestamptz,
  reviewed_by           uuid        REFERENCES public.users(id),
  -- Timestamps
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.membership_plan_settings (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_key      text        NOT NULL UNIQUE CHECK (plan_key IN ('free', 'paid')),
  title         text        NOT NULL,
  subtitle      text,
  description   text,
  display_order int         NOT NULL DEFAULT 0,
  is_active     boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.membership_plan_features (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_label text        NOT NULL,
  free_value    text,
  paid_value    text,
  display_order int         NOT NULL DEFAULT 0,
  is_active     boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. Seed Data
-- ============================================================

INSERT INTO public.membership_plan_settings (plan_key, title, subtitle, description, display_order)
VALUES
  ('free', 'Free Membership',
   'Start free - join the LUB digital community at no cost.',
   'Create a free LUB portal account and connect with India''s MSME community.',
   1),
  ('paid', 'Paid LUB Membership',
   'Become a full LUB member - state-wise fees apply.',
   'Full LUB membership with state-wise fees for male and female entrepreneurs.',
   2)
ON CONFLICT (plan_key) DO NOTHING;

INSERT INTO public.membership_plan_features
  (feature_label, free_value, paid_value, display_order)
VALUES
  ('LUB portal account',           'yes',  'yes',  1),
  ('News, updates, announcements', 'yes',  'yes',  2),
  ('Public events and activities', 'yes',  'yes',  3),
  ('Member directory listing',     NULL,   'yes',  4),
  ('Business Showcase listing',    NULL,   'yes',  5),
  ('Member networking',            NULL,   'yes',  6),
  ('Member-only opportunities',    NULL,   'yes',  7),
  ('Committee/leadership roles',   NULL,   'yes',  8)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 3. RLS
-- ============================================================

ALTER TABLE public.showcase_listings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membership_plan_settings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membership_plan_features  ENABLE ROW LEVEL SECURITY;

-- All showcase_listing access is gated by RPCs using service-role calls or
-- server-side session validation; no direct client reads are needed.
-- Deny all direct access to showcase_listings.
CREATE POLICY "showcase_listings_deny_all"
  ON public.showcase_listings
  AS RESTRICTIVE
  FOR ALL
  USING (false);

-- Public reads for membership plan tables (read-only marketing content)
CREATE POLICY "mps_public_read"
  ON public.membership_plan_settings FOR SELECT
  USING (is_active = true);

CREATE POLICY "mpf_public_read"
  ON public.membership_plan_features FOR SELECT
  USING (is_active = true);

-- ============================================================
-- 4. RPCs
-- ============================================================

-- 4a. Public: browse approved showcase listings
CREATE OR REPLACE FUNCTION public.get_public_showcase_listings(
  p_state    text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_search   text DEFAULT NULL,
  p_limit    int  DEFAULT 50,
  p_offset   int  DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_results jsonb;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object(
      'id',                   sl.id,
      'title',                sl.title,
      'product_service_name', sl.product_service_name,
      'category',             sl.category,
      'short_description',    sl.short_description,
      'detailed_description', sl.detailed_description,
      'state',                sl.state,
      'district',             sl.district,
      'photo_url',            sl.photo_url,
      'company_name',         sl.company_name_snapshot,
      'member_name',          sl.member_name_snapshot,
      'contact_preference',   sl.contact_preference,
      'approved_at',          sl.reviewed_at
    )
    ORDER BY sl.reviewed_at DESC
  )
  INTO v_results
  FROM public.showcase_listings sl
  WHERE sl.status = 'approved'
    AND (p_state    IS NULL OR sl.state    ILIKE p_state)
    AND (p_category IS NULL OR sl.category ILIKE p_category)
    AND (p_search   IS NULL OR (
         sl.title                ILIKE '%' || p_search || '%'
      OR sl.product_service_name ILIKE '%' || p_search || '%'
      OR sl.company_name_snapshot ILIKE '%' || p_search || '%'
      OR sl.short_description     ILIKE '%' || p_search || '%'
    ))
  LIMIT LEAST(COALESCE(p_limit, 50), 200)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);

  RETURN COALESCE(v_results, '[]'::jsonb);
END;
$$;

-- 4b. Member: get own listings (non-archived)
CREATE OR REPLACE FUNCTION public.get_member_showcase_listings_with_session(
  p_session_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_user_id uuid;
  v_results jsonb;
BEGIN
  v_user_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'Session invalid or expired.', 'error_code', 'session_invalid'
    );
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id',                   sl.id,
      'title',                sl.title,
      'product_service_name', sl.product_service_name,
      'category',             sl.category,
      'short_description',    sl.short_description,
      'detailed_description', sl.detailed_description,
      'state',                sl.state,
      'district',             sl.district,
      'photo_url',            sl.photo_url,
      'contact_preference',   sl.contact_preference,
      'status',               sl.status,
      'admin_note',           sl.admin_note,
      'submitted_at',         sl.submitted_at,
      'reviewed_at',          sl.reviewed_at,
      'created_at',           sl.created_at,
      'updated_at',           sl.updated_at
    )
    ORDER BY sl.created_at DESC
  )
  INTO v_results
  FROM public.showcase_listings sl
  WHERE sl.member_id = v_user_id
    AND sl.status <> 'archived';

  RETURN jsonb_build_object('success', true, 'listings', COALESCE(v_results, '[]'::jsonb));
END;
$$;

-- 4c. Member: create listing (approved members only)
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
  v_is_approved  boolean;
  v_member_name  text;
  v_company_name text;
  v_state        text;
  v_new_id       uuid;
BEGIN
  v_user_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'Session invalid or expired.', 'error_code', 'session_invalid'
    );
  END IF;

  SELECT
    (mr.status = 'approved' AND mr.is_active = true),
    mr.full_name,
    mr.company_name,
    mr.state
  INTO v_is_approved, v_member_name, v_company_name, v_state
  FROM public.member_registrations mr
  WHERE mr.member_id = v_user_id
  ORDER BY mr.created_at DESC
  LIMIT 1;

  IF NOT COALESCE(v_is_approved, false) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',  'Only approved paid LUB members can create showcase listings.',
      'error_code', 'not_approved_member'
    );
  END IF;

  IF trim(COALESCE(p_title, '')) = '' THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'Title is required.', 'error_code', 'validation_error'
    );
  END IF;
  IF trim(COALESCE(p_short_description, '')) = '' THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'Short description is required.', 'error_code', 'validation_error'
    );
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
    COALESCE(p_contact_preference, 'member_contact'),
    'draft'
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('success', true, 'id', v_new_id);
END;
$$;

-- 4d. Member: update listing (draft or rejected only)
CREATE OR REPLACE FUNCTION public.update_showcase_listing_with_session(
  p_session_token        text,
  p_listing_id           uuid,
  p_title                text,
  p_product_service_name text,
  p_category             text,
  p_short_description    text,
  p_detailed_description text,
  p_state                text,
  p_district             text,
  p_photo_url            text,
  p_contact_preference   text DEFAULT 'member_contact'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_user_id        uuid;
  v_listing_status text;
BEGIN
  v_user_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'Session invalid or expired.', 'error_code', 'session_invalid'
    );
  END IF;

  SELECT status INTO v_listing_status
  FROM public.showcase_listings
  WHERE id = p_listing_id AND member_id = v_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'Listing not found.', 'error_code', 'not_found'
    );
  END IF;

  IF v_listing_status NOT IN ('draft', 'rejected') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Only draft or rejected listings can be edited.',
      'error_code', 'invalid_status'
    );
  END IF;

  IF trim(COALESCE(p_title, '')) = '' THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'Title is required.', 'error_code', 'validation_error'
    );
  END IF;

  UPDATE public.showcase_listings
  SET
    title                 = trim(p_title),
    product_service_name  = nullif(trim(COALESCE(p_product_service_name, '')), ''),
    category              = nullif(trim(COALESCE(p_category, '')), ''),
    short_description     = trim(p_short_description),
    detailed_description  = nullif(trim(COALESCE(p_detailed_description, '')), ''),
    state                 = nullif(trim(COALESCE(p_state, '')), ''),
    district              = nullif(trim(COALESCE(p_district, '')), ''),
    photo_url             = nullif(trim(COALESCE(p_photo_url, '')), ''),
    contact_preference    = COALESCE(p_contact_preference, 'member_contact'),
    updated_at            = now()
  WHERE id = p_listing_id AND member_id = v_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 4e. Member: submit listing for admin review
CREATE OR REPLACE FUNCTION public.submit_showcase_listing_with_session(
  p_session_token text,
  p_listing_id    uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_user_id        uuid;
  v_listing_status text;
BEGIN
  v_user_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'Session invalid or expired.', 'error_code', 'session_invalid'
    );
  END IF;

  SELECT status INTO v_listing_status
  FROM public.showcase_listings
  WHERE id = p_listing_id AND member_id = v_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'Listing not found.', 'error_code', 'not_found'
    );
  END IF;

  IF v_listing_status NOT IN ('draft', 'rejected') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Only draft or rejected listings can be submitted for review.',
      'error_code', 'invalid_status'
    );
  END IF;

  UPDATE public.showcase_listings
  SET
    status       = 'pending_review',
    submitted_at = now(),
    admin_note   = NULL,
    updated_at   = now()
  WHERE id = p_listing_id AND member_id = v_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 4f. Member: delete or archive listing
CREATE OR REPLACE FUNCTION public.delete_showcase_listing_with_session(
  p_session_token text,
  p_listing_id    uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_user_id        uuid;
  v_listing_status text;
BEGIN
  v_user_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'Session invalid or expired.', 'error_code', 'session_invalid'
    );
  END IF;

  SELECT status INTO v_listing_status
  FROM public.showcase_listings
  WHERE id = p_listing_id AND member_id = v_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'Listing not found.', 'error_code', 'not_found'
    );
  END IF;

  IF v_listing_status = 'approved' THEN
    -- Archive approved listings rather than hard-deleting
    UPDATE public.showcase_listings
    SET status = 'archived', updated_at = now()
    WHERE id = p_listing_id AND member_id = v_user_id;
  ELSE
    DELETE FROM public.showcase_listings
    WHERE id = p_listing_id AND member_id = v_user_id;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 4g. Admin: list all showcase listings with optional filters
CREATE OR REPLACE FUNCTION public.admin_get_showcase_listings_with_session(
  p_session_token text,
  p_status        text DEFAULT NULL,
  p_search        text DEFAULT NULL,
  p_limit         int  DEFAULT 100,
  p_offset        int  DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_user_id uuid;
  v_results jsonb;
BEGIN
  v_user_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'Session invalid or expired.', 'error_code', 'session_invalid'
    );
  END IF;

  IF NOT public.has_permission(v_user_id, 'members.view') THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'Permission denied.', 'error_code', 'permission_denied'
    );
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id',                   sl.id,
      'member_id',            sl.member_id,
      'title',                sl.title,
      'product_service_name', sl.product_service_name,
      'category',             sl.category,
      'short_description',    sl.short_description,
      'detailed_description', sl.detailed_description,
      'state',                sl.state,
      'district',             sl.district,
      'photo_url',            sl.photo_url,
      'contact_preference',   sl.contact_preference,
      'company_name',         sl.company_name_snapshot,
      'member_name',          sl.member_name_snapshot,
      'status',               sl.status,
      'admin_note',           sl.admin_note,
      'submitted_at',         sl.submitted_at,
      'reviewed_at',          sl.reviewed_at,
      'created_at',           sl.created_at,
      'updated_at',           sl.updated_at
    )
    ORDER BY
      CASE sl.status WHEN 'pending_review' THEN 0 ELSE 1 END,
      sl.submitted_at DESC NULLS LAST,
      sl.created_at DESC
  )
  INTO v_results
  FROM public.showcase_listings sl
  WHERE (p_status IS NULL OR sl.status = p_status)
    AND (p_search IS NULL OR (
         sl.title               ILIKE '%' || p_search || '%'
      OR sl.company_name_snapshot ILIKE '%' || p_search || '%'
      OR sl.member_name_snapshot  ILIKE '%' || p_search || '%'
    ))
  LIMIT LEAST(COALESCE(p_limit, 100), 500)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);

  RETURN jsonb_build_object('success', true, 'listings', COALESCE(v_results, '[]'::jsonb));
END;
$$;

-- 4h. Admin: approve / reject / archive a listing
CREATE OR REPLACE FUNCTION public.admin_update_showcase_listing_status_with_session(
  p_session_token text,
  p_listing_id    uuid,
  p_new_status    text,
  p_admin_note    text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'Session invalid or expired.', 'error_code', 'session_invalid'
    );
  END IF;

  IF NOT public.has_permission(v_user_id, 'members.edit') THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'Permission denied.', 'error_code', 'permission_denied'
    );
  END IF;

  IF p_new_status NOT IN ('approved', 'rejected', 'archived') THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'Invalid status value.', 'error_code', 'validation_error'
    );
  END IF;

  UPDATE public.showcase_listings
  SET
    status      = p_new_status,
    admin_note  = p_admin_note,
    reviewed_at = now(),
    reviewed_by = v_user_id,
    updated_at  = now()
  WHERE id = p_listing_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'Listing not found.', 'error_code', 'not_found'
    );
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 4i. Admin: update membership plan title/subtitle for one plan_key
CREATE OR REPLACE FUNCTION public.admin_update_membership_plan_settings_with_session(
  p_session_token text,
  p_plan_key      text,
  p_title         text,
  p_subtitle      text,
  p_description   text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'Session invalid or expired.', 'error_code', 'session_invalid'
    );
  END IF;

  IF NOT public.has_permission(v_user_id, 'settings.forms.view') THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'Permission denied.', 'error_code', 'permission_denied'
    );
  END IF;

  UPDATE public.membership_plan_settings
  SET
    title       = p_title,
    subtitle    = p_subtitle,
    description = p_description,
    updated_at  = now()
  WHERE plan_key = p_plan_key;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'Plan key not found.', 'error_code', 'not_found'
    );
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 4j. Admin: create or update a membership plan feature row
CREATE OR REPLACE FUNCTION public.admin_upsert_membership_plan_feature_with_session(
  p_session_token text,
  p_feature_id    uuid,
  p_feature_label text,
  p_free_value    text,
  p_paid_value    text,
  p_display_order int,
  p_is_active     boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_user_id    uuid;
  v_result_id  uuid;
BEGIN
  v_user_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'Session invalid or expired.', 'error_code', 'session_invalid'
    );
  END IF;

  IF NOT public.has_permission(v_user_id, 'settings.forms.view') THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'Permission denied.', 'error_code', 'permission_denied'
    );
  END IF;

  IF p_feature_id IS NOT NULL THEN
    UPDATE public.membership_plan_features
    SET
      feature_label = p_feature_label,
      free_value    = nullif(trim(COALESCE(p_free_value, '')), ''),
      paid_value    = nullif(trim(COALESCE(p_paid_value, '')), ''),
      display_order = COALESCE(p_display_order, 0),
      is_active     = COALESCE(p_is_active, true),
      updated_at    = now()
    WHERE id = p_feature_id
    RETURNING id INTO v_result_id;
  ELSE
    INSERT INTO public.membership_plan_features
      (feature_label, free_value, paid_value, display_order, is_active)
    VALUES (
      p_feature_label,
      nullif(trim(COALESCE(p_free_value, '')), ''),
      nullif(trim(COALESCE(p_paid_value, '')), ''),
      COALESCE(p_display_order, 0),
      COALESCE(p_is_active, true)
    )
    RETURNING id INTO v_result_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'id', v_result_id);
END;
$$;

-- ============================================================
-- 5. Grants
-- ============================================================

GRANT EXECUTE ON FUNCTION public.get_public_showcase_listings TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_member_showcase_listings_with_session TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_showcase_listing_with_session TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_showcase_listing_with_session TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_showcase_listing_with_session TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_showcase_listing_with_session TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_showcase_listings_with_session TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_showcase_listing_status_with_session TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_membership_plan_settings_with_session TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_membership_plan_feature_with_session TO authenticated;

COMMIT;
