/*
  CLU-SHOWCASE-V2-001 — Business Showcase v2

  Adds (all backward compatible; existing single-photo listings keep working):
   - Up to 3 photos per listing via ordered `photo_urls jsonb` (photo_urls[0] = main).
     Legacy `photo_url` kept and DUAL-WRITTEN (= first photo) for compatibility.
   - Optional per-listing contact fields with explicit public-consent flags.
   - City snapshot alongside the existing state/district snapshot, sourced from
     the member's latest approved registration (members never retype location).
   - Admin-managed `showcase_categories` config table + read/admin RPCs + seed.

  Read RPCs now emit a unified `photos` array:
     photo_urls (if non-empty) -> [photo_url] (legacy) -> [].
  Public RPC only exposes a contact value when its show_* flag is true.

  Paid-member gate (account_type in member/both) is preserved on create.
  NOTE: confirm this migration is applied to the linked DB before the frontend
  depends on it. The `showcase-photos` storage bucket size limit must also be
  raised to 10 MB by Codex/runtime (cannot be changed from source).
*/

BEGIN;

-- ============================================================
-- 1. Columns: photos, contact, city snapshot
-- ============================================================
ALTER TABLE public.showcase_listings
  ADD COLUMN IF NOT EXISTS photo_urls         jsonb   NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS contact_email      text,
  ADD COLUMN IF NOT EXISTS contact_phone      text,
  ADD COLUMN IF NOT EXISTS show_contact_email boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_contact_phone boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS city               text;

-- Backfill: existing single-photo listings -> ordered array (idempotent).
UPDATE public.showcase_listings
SET photo_urls = jsonb_build_array(photo_url)
WHERE photo_url IS NOT NULL
  AND photo_url <> ''
  AND (photo_urls IS NULL OR photo_urls = '[]'::jsonb);

-- ============================================================
-- 2. Admin-managed categories
-- ============================================================
CREATE TABLE IF NOT EXISTS public.showcase_categories (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL UNIQUE,
  display_order int         NOT NULL DEFAULT 0,
  is_active     boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.showcase_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "showcase_categories_public_read" ON public.showcase_categories;
CREATE POLICY "showcase_categories_public_read"
  ON public.showcase_categories FOR SELECT
  USING (is_active = true);

GRANT SELECT ON public.showcase_categories TO anon, authenticated;

-- Seed (Packaging in; broad "Manufacturing" split into specific buckets).
INSERT INTO public.showcase_categories (name, display_order) VALUES
  ('Engineering & Capital Goods',          1),
  ('Metal Fabrication & Foundry',          2),
  ('Auto Components',                       3),
  ('Electrical & Electronics',             4),
  ('Plastics & Polymers',                  5),
  ('Chemicals',                            6),
  ('Pharma & Healthcare',                  7),
  ('Food & Beverage Processing',           8),
  ('Textiles & Apparel',                   9),
  ('Packaging',                            10),
  ('Printing & Paper',                     11),
  ('Construction Materials & Hardware',    12),
  ('Agro & Agri-inputs',                   13),
  ('Handicrafts & Home Decor',             14),
  ('IT & Software Services',               15),
  ('Consultancy & Professional Services',  16),
  ('Logistics & Warehousing',              17),
  ('Trading & Distribution',               18),
  ('Other',                                19)
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- 3. Read RPCs — emit unified `photos` array + new fields
-- ============================================================

-- 3a. Public browse (contact value exposed only when its show flag is true)
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
      'city',                 sl.city,
      'photo_url',            sl.photo_url,
      'photos', CASE
        WHEN jsonb_typeof(sl.photo_urls) = 'array' AND jsonb_array_length(sl.photo_urls) > 0 THEN sl.photo_urls
        WHEN sl.photo_url IS NOT NULL AND sl.photo_url <> '' THEN jsonb_build_array(sl.photo_url)
        ELSE '[]'::jsonb
      END,
      'contact_email', CASE WHEN sl.show_contact_email THEN sl.contact_email ELSE NULL END,
      'contact_phone', CASE WHEN sl.show_contact_phone THEN sl.contact_phone ELSE NULL END,
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

-- 3b. Member: own listings
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
    RETURN jsonb_build_object('success', false, 'error', 'Session invalid or expired.', 'error_code', 'session_invalid');
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
      'city',                 sl.city,
      'photo_url',            sl.photo_url,
      'photos', CASE
        WHEN jsonb_typeof(sl.photo_urls) = 'array' AND jsonb_array_length(sl.photo_urls) > 0 THEN sl.photo_urls
        WHEN sl.photo_url IS NOT NULL AND sl.photo_url <> '' THEN jsonb_build_array(sl.photo_url)
        ELSE '[]'::jsonb
      END,
      'contact_email',        sl.contact_email,
      'contact_phone',        sl.contact_phone,
      'show_contact_email',   sl.show_contact_email,
      'show_contact_phone',   sl.show_contact_phone,
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

-- ============================================================
-- 4. Write RPCs — multi-photo, contact, snapshot location
-- ============================================================

-- 4z. Helper: clamp/clean a photos array to <=3 non-empty trimmed url strings.
CREATE OR REPLACE FUNCTION public.normalize_showcase_photos(p_photos jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    (
      SELECT jsonb_agg(u ORDER BY ord)
      FROM (
        SELECT trim(both '"' from elem::text) AS u, ord
        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_photos) = 'array' THEN p_photos ELSE '[]'::jsonb END)
             WITH ORDINALITY AS t(elem, ord)
      ) s
      WHERE u IS NOT NULL AND length(trim(u)) > 0 AND ord <= 3
    ),
    '[]'::jsonb
  );
$$;

-- 4a. Create (DROP + CREATE: signature changes). Paid gate preserved.
DROP FUNCTION IF EXISTS public.create_showcase_listing_with_session(text, text, text, text, text, text, text, text, text, text);

CREATE FUNCTION public.create_showcase_listing_with_session(
  p_session_token        text,
  p_title                text,
  p_product_service_name text,
  p_category             text,
  p_short_description    text,
  p_detailed_description text,
  p_photo_urls           jsonb DEFAULT '[]'::jsonb,
  p_contact_email        text  DEFAULT NULL,
  p_contact_phone        text  DEFAULT NULL,
  p_show_contact_email   boolean DEFAULT false,
  p_show_contact_phone   boolean DEFAULT false
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
  v_district     text;
  v_city         text;
  v_photos       jsonb;
  v_main_photo   text;
  v_new_id       uuid;
BEGIN
  v_user_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Session invalid or expired.', 'error_code', 'session_invalid');
  END IF;

  SELECT account_type INTO v_account_type FROM public.users WHERE id = v_user_id;
  IF COALESCE(v_account_type, '') NOT IN ('member', 'both') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only approved paid LUB members can create showcase listings.', 'error_code', 'not_approved_member');
  END IF;

  -- Snapshot identity + location from the latest approved registration.
  SELECT mr.full_name, mr.company_name, mr.state, mr.district, mr.city
  INTO v_member_name, v_company_name, v_state, v_district, v_city
  FROM public.member_registrations mr
  WHERE mr.user_id = v_user_id AND mr.status = 'approved' AND mr.is_active = true
  ORDER BY mr.created_at DESC
  LIMIT 1;

  IF trim(COALESCE(p_title, '')) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Title is required.', 'error_code', 'validation_error');
  END IF;
  IF trim(COALESCE(p_short_description, '')) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Short description is required.', 'error_code', 'validation_error');
  END IF;

  -- Normalize photos: array of up to 3 non-empty url strings; [0] = main.
  v_photos := public.normalize_showcase_photos(p_photo_urls);
  v_main_photo := NULLIF(v_photos->>0, '');

  INSERT INTO public.showcase_listings (
    member_id, company_name_snapshot, member_name_snapshot, state_snapshot,
    title, product_service_name, category,
    short_description, detailed_description,
    state, district, city,
    photo_urls, photo_url,
    contact_email, contact_phone, show_contact_email, show_contact_phone,
    contact_preference, status
  ) VALUES (
    v_user_id, v_company_name, v_member_name, v_state,
    trim(p_title),
    nullif(trim(COALESCE(p_product_service_name, '')), ''),
    nullif(trim(COALESCE(p_category, '')), ''),
    trim(p_short_description),
    nullif(trim(COALESCE(p_detailed_description, '')), ''),
    v_state, v_district, v_city,
    v_photos, v_main_photo,
    nullif(trim(COALESCE(p_contact_email, '')), ''),
    nullif(trim(COALESCE(p_contact_phone, '')), ''),
    COALESCE(p_show_contact_email, false),
    COALESCE(p_show_contact_phone, false),
    'member_contact', 'draft'
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('success', true, 'id', v_new_id);
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error in create_showcase_listing_with_session: % %', SQLERRM, SQLSTATE;
    RETURN jsonb_build_object('success', false, 'error', 'Database error.', 'error_code', 'db_error');
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_showcase_listing_with_session(text, text, text, text, text, text, jsonb, text, text, boolean, boolean) TO anon, authenticated;

-- 4b. Update (DROP + CREATE: signature changes). Draft/rejected only.
DROP FUNCTION IF EXISTS public.update_showcase_listing_with_session(text, uuid, text, text, text, text, text, text, text, text, text);

CREATE FUNCTION public.update_showcase_listing_with_session(
  p_session_token        text,
  p_listing_id           uuid,
  p_title                text,
  p_product_service_name text,
  p_category             text,
  p_short_description    text,
  p_detailed_description text,
  p_photo_urls           jsonb DEFAULT '[]'::jsonb,
  p_contact_email        text  DEFAULT NULL,
  p_contact_phone        text  DEFAULT NULL,
  p_show_contact_email   boolean DEFAULT false,
  p_show_contact_phone   boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_user_id        uuid;
  v_listing_status text;
  v_state          text;
  v_district       text;
  v_city           text;
  v_photos         jsonb;
  v_main_photo     text;
BEGIN
  v_user_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Session invalid or expired.', 'error_code', 'session_invalid');
  END IF;

  SELECT status INTO v_listing_status
  FROM public.showcase_listings
  WHERE id = p_listing_id AND member_id = v_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Listing not found.', 'error_code', 'not_found');
  END IF;

  IF v_listing_status NOT IN ('draft', 'rejected') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only draft or rejected listings can be edited.', 'error_code', 'invalid_status');
  END IF;

  IF trim(COALESCE(p_title, '')) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Title is required.', 'error_code', 'validation_error');
  END IF;

  -- Re-snapshot location from the latest approved registration.
  SELECT mr.state, mr.district, mr.city
  INTO v_state, v_district, v_city
  FROM public.member_registrations mr
  WHERE mr.user_id = v_user_id AND mr.status = 'approved' AND mr.is_active = true
  ORDER BY mr.created_at DESC
  LIMIT 1;

  v_photos := public.normalize_showcase_photos(p_photo_urls);
  v_main_photo := NULLIF(v_photos->>0, '');

  UPDATE public.showcase_listings
  SET
    title                 = trim(p_title),
    product_service_name  = nullif(trim(COALESCE(p_product_service_name, '')), ''),
    category              = nullif(trim(COALESCE(p_category, '')), ''),
    short_description     = trim(p_short_description),
    detailed_description  = nullif(trim(COALESCE(p_detailed_description, '')), ''),
    state                 = COALESCE(v_state, state),
    district              = COALESCE(v_district, district),
    city                  = COALESCE(v_city, city),
    photo_urls            = v_photos,
    photo_url             = v_main_photo,
    contact_email         = nullif(trim(COALESCE(p_contact_email, '')), ''),
    contact_phone         = nullif(trim(COALESCE(p_contact_phone, '')), ''),
    show_contact_email    = COALESCE(p_show_contact_email, false),
    show_contact_phone    = COALESCE(p_show_contact_phone, false),
    updated_at            = now()
  WHERE id = p_listing_id AND member_id = v_user_id;

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error in update_showcase_listing_with_session: % %', SQLERRM, SQLSTATE;
    RETURN jsonb_build_object('success', false, 'error', 'Database error.', 'error_code', 'db_error');
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_showcase_listing_with_session(text, uuid, text, text, text, text, text, jsonb, text, text, boolean, boolean) TO anon, authenticated;

-- ============================================================
-- 5. Admin listing read — include photos, contact, flags, city
-- ============================================================
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
    RETURN jsonb_build_object('success', false, 'error', 'Session invalid or expired.', 'error_code', 'session_invalid');
  END IF;

  IF NOT public.has_permission(v_user_id, 'members.view') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied.', 'error_code', 'permission_denied');
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
      'city',                 sl.city,
      'photo_url',            sl.photo_url,
      'photos', CASE
        WHEN jsonb_typeof(sl.photo_urls) = 'array' AND jsonb_array_length(sl.photo_urls) > 0 THEN sl.photo_urls
        WHEN sl.photo_url IS NOT NULL AND sl.photo_url <> '' THEN jsonb_build_array(sl.photo_url)
        ELSE '[]'::jsonb
      END,
      'contact_email',        sl.contact_email,
      'contact_phone',        sl.contact_phone,
      'show_contact_email',   sl.show_contact_email,
      'show_contact_phone',   sl.show_contact_phone,
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

-- ============================================================
-- 6. Category RPCs (admin read incl. inactive + admin upsert)
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_get_showcase_categories_with_session(
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
    RETURN jsonb_build_object('success', false, 'error', 'Session invalid or expired.', 'error_code', 'session_invalid');
  END IF;

  IF NOT public.has_permission(v_user_id, 'members.view') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied.', 'error_code', 'permission_denied');
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', c.id, 'name', c.name, 'display_order', c.display_order, 'is_active', c.is_active
    ) ORDER BY c.display_order, c.name
  ), '[]'::jsonb)
  INTO v_results
  FROM public.showcase_categories c;

  RETURN jsonb_build_object('success', true, 'categories', v_results);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_showcase_categories_with_session(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_upsert_showcase_category_with_session(
  p_session_token  text,
  p_category_id    uuid,
  p_name           text,
  p_display_order  int,
  p_is_active      boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_user_id uuid;
  v_id      uuid;
BEGIN
  v_user_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Session invalid or expired.', 'error_code', 'session_invalid');
  END IF;

  IF NOT public.has_permission(v_user_id, 'members.edit') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied.', 'error_code', 'permission_denied');
  END IF;

  IF trim(COALESCE(p_name, '')) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Category name is required.', 'error_code', 'validation_error');
  END IF;

  IF p_category_id IS NULL THEN
    INSERT INTO public.showcase_categories (name, display_order, is_active)
    VALUES (trim(p_name), COALESCE(p_display_order, 0), COALESCE(p_is_active, true))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.showcase_categories
    SET name = trim(p_name),
        display_order = COALESCE(p_display_order, display_order),
        is_active = COALESCE(p_is_active, is_active),
        updated_at = now()
    WHERE id = p_category_id
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Category not found.', 'error_code', 'not_found');
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'id', v_id);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'A category with this name already exists.', 'error_code', 'duplicate');
  WHEN OTHERS THEN
    RAISE WARNING 'Error in admin_upsert_showcase_category_with_session: % %', SQLERRM, SQLSTATE;
    RETURN jsonb_build_object('success', false, 'error', 'Database error.', 'error_code', 'db_error');
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_upsert_showcase_category_with_session(text, uuid, text, int, boolean) TO anon, authenticated;

COMMIT;

-- Reload PostgREST schema cache so new/updated signatures are visible.
NOTIFY pgrst, 'reload schema';
