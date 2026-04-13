/*
  # Preview/Publish hardening follow-up

  1) Keep public signup runtime live-only (no draft fallback).
  2) Add explicit unpublish RPC with session authorization.
  3) Extend live publish status contracts with `unpublished` state.
  4) Allow live snapshot writes only in publish/unpublish RPC contexts.
*/

-- =============================================================================
-- SECTION 1: live snapshot guard context (publish + unpublish only)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.form_builder_v2_guard_live_fields_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_write_context text := current_setting('lub.form_builder_live_write_context', true);
BEGIN
  IF COALESCE(v_write_context, '') NOT IN ('publish_rpc', 'unpublish_rpc') THEN
    RAISE EXCEPTION 'Live form snapshots are read-only outside publish workflow';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

-- =============================================================================
-- SECTION 2: public signup runtime reads live snapshot only
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_signup_form_configuration_v2()
RETURNS TABLE (
  id uuid,
  form_key text,
  field_key text,
  label text,
  field_type text,
  section_name text,
  placeholder text,
  help_text text,
  option_items jsonb,
  default_value text,
  is_visible boolean,
  is_required boolean,
  is_locked boolean,
  is_system_field boolean,
  display_order integer,
  validation_rule_id uuid
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH signup_form AS (
    SELECT fm.id, fm.form_key
    FROM public.form_config_v2_forms fm
    WHERE fm.form_key = 'signup'
      AND fm.is_active = true
    LIMIT 1
  )
  SELECT
    lf.id,
    sf.form_key,
    lf.field_key,
    lf.label,
    lf.field_type,
    lf.section_name,
    lf.placeholder,
    lf.help_text,
    lf.option_items,
    lf.default_value,
    lf.is_visible,
    lf.is_required,
    lf.is_locked,
    lf.is_system_field,
    lf.display_order,
    lf.validation_rule_id
  FROM signup_form sf
  INNER JOIN public.form_config_v2_live_fields lf
    ON lf.form_id = sf.id
  ORDER BY lf.section_name, lf.display_order, lf.field_key;
$$;

GRANT EXECUTE ON FUNCTION public.get_signup_form_configuration_v2() TO PUBLIC;

-- =============================================================================
-- SECTION 3: publish-status contracts include `unpublished` origin
-- =============================================================================

CREATE OR REPLACE FUNCTION public.list_form_builder_live_publish_status_with_session(
  p_session_token text
)
RETURNS TABLE (
  form_id uuid,
  form_key text,
  form_name text,
  live_published_at timestamptz,
  live_published_by uuid,
  live_published_by_email text,
  live_publish_origin text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
BEGIN
  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);

  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Invalid session';
  END IF;

  IF NOT public.has_permission(v_actor_user_id, 'settings.forms.view') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  WITH live_counts AS (
    SELECT lf.form_id, COUNT(*)::integer AS live_field_count
    FROM public.form_config_v2_live_fields lf
    GROUP BY lf.form_id
  )
  SELECT
    fm.id,
    fm.form_key,
    fm.form_name,
    fm.live_published_at,
    fm.live_published_by,
    u.email AS live_published_by_email,
    CASE
      WHEN COALESCE(lc.live_field_count, 0) > 0 THEN
        CASE
          WHEN fm.live_published_by IS NULL THEN 'legacy_seeded'
          ELSE 'manual_publish'
        END
      WHEN fm.live_published_at IS NULL THEN 'never_published'
      ELSE 'unpublished'
    END AS live_publish_origin
  FROM public.form_config_v2_forms fm
  LEFT JOIN live_counts lc ON lc.form_id = fm.id
  LEFT JOIN public.users u ON u.id = fm.live_published_by
  ORDER BY fm.form_name, fm.form_key;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_form_builder_live_publish_status_with_session(text) TO PUBLIC;

CREATE OR REPLACE FUNCTION public.get_form_builder_live_publish_status_with_session(
  p_session_token text,
  p_form_key text
)
RETURNS TABLE (
  form_id uuid,
  form_key text,
  form_name text,
  live_published_at timestamptz,
  live_published_by uuid,
  live_published_by_email text,
  live_publish_origin text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
  v_form_key text := trim(COALESCE(p_form_key, ''));
BEGIN
  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);

  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Invalid session';
  END IF;

  IF NOT public.has_permission(v_actor_user_id, 'settings.forms.view') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  WITH live_counts AS (
    SELECT lf.form_id, COUNT(*)::integer AS live_field_count
    FROM public.form_config_v2_live_fields lf
    GROUP BY lf.form_id
  )
  SELECT
    fm.id,
    fm.form_key,
    fm.form_name,
    fm.live_published_at,
    fm.live_published_by,
    u.email AS live_published_by_email,
    CASE
      WHEN COALESCE(lc.live_field_count, 0) > 0 THEN
        CASE
          WHEN fm.live_published_by IS NULL THEN 'legacy_seeded'
          ELSE 'manual_publish'
        END
      WHEN fm.live_published_at IS NULL THEN 'never_published'
      ELSE 'unpublished'
    END AS live_publish_origin
  FROM public.form_config_v2_forms fm
  LEFT JOIN live_counts lc ON lc.form_id = fm.id
  LEFT JOIN public.users u ON u.id = fm.live_published_by
  WHERE fm.form_key = v_form_key
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_form_builder_live_publish_status_with_session(text, text) TO PUBLIC;

-- =============================================================================
-- SECTION 4: explicit unpublish RPC
-- =============================================================================

CREATE OR REPLACE FUNCTION public.unpublish_form_builder_v2_with_session(
  p_session_token text,
  p_form_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
  v_form_key text := lower(trim(COALESCE(p_form_key, '')));
  v_form_id uuid;
  v_removed_count integer := 0;
BEGIN
  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);

  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT public.has_permission(v_actor_user_id, 'settings.forms.configure') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  IF v_form_key = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'form_key is required');
  END IF;

  SELECT fm.id INTO v_form_id
  FROM public.form_config_v2_forms fm
  WHERE fm.form_key = v_form_key
  LIMIT 1;

  IF v_form_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Form not found');
  END IF;

  PERFORM set_config('lub.form_builder_live_write_context', 'unpublish_rpc', true);

  DELETE FROM public.form_config_v2_live_fields
  WHERE form_id = v_form_id;

  GET DIAGNOSTICS v_removed_count = ROW_COUNT;

  UPDATE public.form_config_v2_forms
  SET updated_at = now()
  WHERE id = v_form_id;

  RETURN jsonb_build_object(
    'success', true,
    'form_key', v_form_key,
    'removed_live_fields', v_removed_count
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.unpublish_form_builder_v2_with_session(text, text) TO PUBLIC;

