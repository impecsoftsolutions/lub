/*
  CLU-SHOWCASE-MODERATION-001 — Business Showcase moderation actions

  Adds admin visibility control, admin edit, and archived-only permanent delete.

   - is_public boolean NOT NULL DEFAULT true on showcase_listings (orthogonal to
     status). Public listings now require status='approved' AND is_public=true.
   - get_public / get_member / admin_get read RPCs return is_public; public RPC
     filters on it.
   - admin_set_showcase_listing_public_visibility_with_session  (Hide / Show)
   - admin_update_showcase_listing_with_session                  (admin edit; preserves status)
   - admin_delete_archived_showcase_listing_with_session         (permanent delete, archived only)

  All admin writes are _with_session, derive the actor from the session token,
  and enforce has_permission(members.edit). The member delete RPC is NOT reused.
  NOTE: confirm this migration is applied to the linked DB before the frontend
  depends on it. No storage/bucket/edge changes.
*/

BEGIN;

-- ============================================================
-- 1. Visibility flag
-- ============================================================
ALTER TABLE public.showcase_listings
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true;

-- ============================================================
-- 2. Read RPCs — surface is_public; public filters on it
-- ============================================================
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
      'keywords',             sl.keywords,
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
      'contact_email',        CASE WHEN sl.show_contact_email THEN sl.contact_email ELSE NULL END,
      'contact_phone',        CASE WHEN sl.show_contact_phone THEN sl.contact_phone ELSE NULL END,
      'website_url',          sl.website_url,
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
    AND sl.is_public = true
    AND (p_state    IS NULL OR sl.state    ILIKE p_state)
    AND (p_category IS NULL OR sl.category ILIKE p_category)
    AND (p_search   IS NULL OR (
         sl.title                 ILIKE '%' || p_search || '%'
      OR sl.product_service_name  ILIKE '%' || p_search || '%'
      OR sl.company_name_snapshot ILIKE '%' || p_search || '%'
      OR sl.short_description     ILIKE '%' || p_search || '%'
      OR sl.detailed_description  ILIKE '%' || p_search || '%'
      OR sl.keywords              ILIKE '%' || p_search || '%'
      OR sl.website_url           ILIKE '%' || p_search || '%'
    ))
  LIMIT LEAST(COALESCE(p_limit, 50), 200)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);

  RETURN COALESCE(v_results, '[]'::jsonb);
END;
$$;

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
      'keywords',             sl.keywords,
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
      'website_url',          sl.website_url,
      'is_public',            sl.is_public,
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
      'keywords',             sl.keywords,
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
      'website_url',          sl.website_url,
      'is_public',            sl.is_public,
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
         sl.title                 ILIKE '%' || p_search || '%'
      OR sl.company_name_snapshot ILIKE '%' || p_search || '%'
      OR sl.member_name_snapshot  ILIKE '%' || p_search || '%'
      OR sl.keywords              ILIKE '%' || p_search || '%'
      OR sl.website_url           ILIKE '%' || p_search || '%'
    ))
  LIMIT LEAST(COALESCE(p_limit, 100), 500)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);

  RETURN jsonb_build_object('success', true, 'listings', COALESCE(v_results, '[]'::jsonb));
END;
$$;

-- ============================================================
-- 3. Admin: toggle public visibility (Hide / Show)
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_set_showcase_listing_public_visibility_with_session(
  p_session_token text,
  p_listing_id    uuid,
  p_is_public     boolean
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
    RETURN jsonb_build_object('success', false, 'error', 'Session invalid or expired.', 'error_code', 'session_invalid');
  END IF;

  IF NOT public.has_permission(v_user_id, 'members.edit') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied.', 'error_code', 'permission_denied');
  END IF;

  UPDATE public.showcase_listings
  SET is_public = COALESCE(p_is_public, true), updated_at = now()
  WHERE id = p_listing_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Listing not found.', 'error_code', 'not_found');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_showcase_listing_public_visibility_with_session(text, uuid, boolean) TO anon, authenticated;

-- ============================================================
-- 4. Admin: edit listing (preserves status; no photo/location changes here)
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_update_showcase_listing_with_session(
  p_session_token        text,
  p_listing_id           uuid,
  p_title                text,
  p_product_service_name text,
  p_category             text,
  p_keywords             text,
  p_short_description    text,
  p_detailed_description text,
  p_contact_email        text,
  p_contact_phone        text,
  p_website_url          text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_user_id       uuid;
  v_contact_email text;
  v_contact_phone text;
  v_website_url   text;
BEGIN
  v_user_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Session invalid or expired.', 'error_code', 'session_invalid');
  END IF;

  IF NOT public.has_permission(v_user_id, 'members.edit') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied.', 'error_code', 'permission_denied');
  END IF;

  IF trim(COALESCE(p_title, '')) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Title is required.', 'error_code', 'validation_error');
  END IF;
  IF trim(COALESCE(p_short_description, '')) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Short description is required.', 'error_code', 'validation_error');
  END IF;

  v_contact_email := nullif(trim(COALESCE(p_contact_email, '')), '');
  IF v_contact_email IS NOT NULL AND NOT public.is_valid_showcase_email(v_contact_email) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Enter a valid contact email address.', 'error_code', 'validation_error');
  END IF;

  v_contact_phone := nullif(trim(COALESCE(p_contact_phone, '')), '');
  v_website_url := public.normalize_showcase_website_url(p_website_url);
  IF nullif(trim(COALESCE(p_website_url, '')), '') IS NOT NULL AND v_website_url IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Enter a valid website address.', 'error_code', 'validation_error');
  END IF;

  UPDATE public.showcase_listings
  SET
    title                = trim(p_title),
    product_service_name = nullif(trim(COALESCE(p_product_service_name, '')), ''),
    category             = nullif(trim(COALESCE(p_category, '')), ''),
    keywords             = public.normalize_showcase_keywords(p_keywords),
    short_description    = trim(p_short_description),
    detailed_description = nullif(trim(COALESCE(p_detailed_description, '')), ''),
    contact_email        = v_contact_email,
    contact_phone        = v_contact_phone,
    -- Matches the member model: a non-empty value is public; blank is hidden.
    show_contact_email   = v_contact_email IS NOT NULL,
    show_contact_phone   = v_contact_phone IS NOT NULL,
    website_url          = v_website_url,
    updated_at           = now()
  WHERE id = p_listing_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Listing not found.', 'error_code', 'not_found');
  END IF;

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error in admin_update_showcase_listing_with_session: % %', SQLERRM, SQLSTATE;
    RETURN jsonb_build_object('success', false, 'error', 'Database error.', 'error_code', 'db_error');
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_showcase_listing_with_session(text, uuid, text, text, text, text, text, text, text, text, text) TO anon, authenticated;

-- ============================================================
-- 5. Admin: permanently delete — ARCHIVED listings only
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_delete_archived_showcase_listing_with_session(
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
    RETURN jsonb_build_object('success', false, 'error', 'Session invalid or expired.', 'error_code', 'session_invalid');
  END IF;

  IF NOT public.has_permission(v_user_id, 'members.edit') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied.', 'error_code', 'permission_denied');
  END IF;

  SELECT status INTO v_listing_status
  FROM public.showcase_listings
  WHERE id = p_listing_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Listing not found.', 'error_code', 'not_found');
  END IF;

  -- Server-enforced: only archived listings can be permanently deleted.
  IF v_listing_status <> 'archived' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Only archived listings can be permanently deleted. Archive it first.',
      'error_code', 'invalid_status'
    );
  END IF;

  DELETE FROM public.showcase_listings WHERE id = p_listing_id AND status = 'archived';

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_archived_showcase_listing_with_session(text, uuid) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_public_showcase_listings(text, text, text, int, int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_member_showcase_listings_with_session(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_showcase_listings_with_session(text, text, text, int, int) TO anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
