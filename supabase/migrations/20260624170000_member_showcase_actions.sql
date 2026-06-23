/*
  Member Business Showcase row actions.

  Adds member-owned hide/show and permanent delete behavior, and allows members
  to edit their own non-archived listings while preserving the current status.
*/

CREATE OR REPLACE FUNCTION public.member_set_showcase_listing_public_visibility_with_session(
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

  UPDATE public.showcase_listings
  SET is_public = COALESCE(p_is_public, true), updated_at = now()
  WHERE id = p_listing_id
    AND member_id = v_user_id
    AND status <> 'archived';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Listing not found.', 'error_code', 'not_found');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.member_set_showcase_listing_public_visibility_with_session(text, uuid, boolean) TO anon, authenticated;

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
  v_user_id uuid;
BEGIN
  v_user_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Session invalid or expired.', 'error_code', 'session_invalid');
  END IF;

  DELETE FROM public.showcase_listings
  WHERE id = p_listing_id
    AND member_id = v_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Listing not found.', 'error_code', 'not_found');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_showcase_listing_with_session(text, uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.update_showcase_listing_with_session(
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
  p_show_contact_phone   boolean DEFAULT false,
  p_website_url          text  DEFAULT NULL,
  p_keywords             text  DEFAULT NULL
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
  v_contact_email  text;
  v_contact_phone  text;
  v_website_url    text;
  v_keywords       text;
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

  IF v_listing_status = 'archived' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Archived listings cannot be edited.', 'error_code', 'invalid_status');
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
  v_keywords := public.normalize_showcase_keywords(p_keywords);

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
    keywords              = v_keywords,
    short_description     = trim(p_short_description),
    detailed_description  = nullif(trim(COALESCE(p_detailed_description, '')), ''),
    state                 = COALESCE(v_state, state),
    district              = COALESCE(v_district, district),
    city                  = COALESCE(v_city, city),
    photo_urls            = v_photos,
    photo_url             = v_main_photo,
    contact_email         = v_contact_email,
    contact_phone         = v_contact_phone,
    show_contact_email    = v_contact_email IS NOT NULL,
    show_contact_phone    = v_contact_phone IS NOT NULL,
    website_url           = v_website_url,
    updated_at            = now()
  WHERE id = p_listing_id AND member_id = v_user_id;

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error in update_showcase_listing_with_session: % %', SQLERRM, SQLSTATE;
    RETURN jsonb_build_object('success', false, 'error', 'Database error.', 'error_code', 'db_error');
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_showcase_listing_with_session(text, uuid, text, text, text, text, text, jsonb, text, text, boolean, boolean, text, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
