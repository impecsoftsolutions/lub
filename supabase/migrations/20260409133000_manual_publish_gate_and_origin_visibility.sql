/*
  # Manual publish gate hardening + publish origin visibility

  1) Block all direct writes to form_config_v2_live_fields except publish RPC path.
  2) Add admin read contracts for live publish origin metadata.
  3) Keep publish workflow explicit and session-authorized.
*/

-- =============================================================================
-- SECTION 1: Live snapshot write guard (publish path only)
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
  IF COALESCE(v_write_context, '') <> 'publish_rpc' THEN
    RAISE EXCEPTION 'Live form snapshots are read-only outside publish workflow';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_form_config_v2_live_fields_publish_guard ON public.form_config_v2_live_fields;
CREATE TRIGGER trg_form_config_v2_live_fields_publish_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.form_config_v2_live_fields
  FOR EACH ROW
  EXECUTE FUNCTION public.form_builder_v2_guard_live_fields_write();

-- =============================================================================
-- SECTION 2: Publish-origin read contracts (_with_session)
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
  SELECT
    fm.id,
    fm.form_key,
    fm.form_name,
    fm.live_published_at,
    fm.live_published_by,
    u.email AS live_published_by_email,
    CASE
      WHEN fm.live_published_at IS NULL THEN 'never_published'
      WHEN fm.live_published_by IS NULL THEN 'legacy_seeded'
      ELSE 'manual_publish'
    END AS live_publish_origin
  FROM public.form_config_v2_forms fm
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
BEGIN
  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);

  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Invalid session';
  END IF;

  IF NOT public.has_permission(v_actor_user_id, 'settings.forms.view') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  SELECT
    fm.id,
    fm.form_key,
    fm.form_name,
    fm.live_published_at,
    fm.live_published_by,
    u.email AS live_published_by_email,
    CASE
      WHEN fm.live_published_at IS NULL THEN 'never_published'
      WHEN fm.live_published_by IS NULL THEN 'legacy_seeded'
      ELSE 'manual_publish'
    END AS live_publish_origin
  FROM public.form_config_v2_forms fm
  LEFT JOIN public.users u ON u.id = fm.live_published_by
  WHERE fm.form_key = trim(COALESCE(p_form_key, ''))
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_form_builder_live_publish_status_with_session(text, text) TO PUBLIC;

-- =============================================================================
-- SECTION 3: Publish RPC update (explicit live-write context)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.publish_form_builder_v2_to_live_with_session(
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
  v_field_count integer;
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

  SELECT id INTO v_form_id
  FROM public.form_config_v2_forms
  WHERE form_key = v_form_key
  LIMIT 1;

  IF v_form_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Form not found');
  END IF;

  IF v_form_key = 'signup' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.form_config_v2_fields f
      WHERE f.form_id = v_form_id
        AND f.field_key = 'email'
        AND f.is_deleted = false
        AND f.is_visible = true
        AND f.is_required = true
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Signup email must remain visible and required before publish');
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.form_config_v2_fields f
      WHERE f.form_id = v_form_id
        AND f.field_key = 'mobile_number'
        AND f.is_deleted = false
        AND f.is_visible = true
        AND f.is_required = true
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Signup mobile number must remain visible and required before publish');
    END IF;
  END IF;

  UPDATE public.form_config_v2_fields f
  SET
    is_required = false,
    updated_by = v_actor_user_id,
    updated_at = now()
  WHERE f.form_id = v_form_id
    AND f.is_deleted = false
    AND f.field_type = 'select'
    AND NOT public.form_builder_v2_has_controlled_select_source(f.field_key)
    AND COALESCE(jsonb_array_length(f.option_items), 0) = 0
    AND f.is_required = true;

  PERFORM set_config('lub.form_builder_live_write_context', 'publish_rpc', true);

  DELETE FROM public.form_config_v2_live_fields
  WHERE form_id = v_form_id;

  INSERT INTO public.form_config_v2_live_fields (
    form_id,
    field_key,
    label,
    field_type,
    section_name,
    placeholder,
    help_text,
    option_items,
    default_value,
    is_visible,
    is_required,
    is_locked,
    is_system_field,
    display_order,
    validation_rule_id,
    published_at,
    published_by
  )
  SELECT
    f.form_id,
    f.field_key,
    f.label,
    f.field_type,
    f.section_name,
    f.placeholder,
    f.help_text,
    f.option_items,
    f.default_value,
    f.is_visible,
    f.is_required,
    f.is_locked,
    f.is_system_field,
    f.display_order,
    f.validation_rule_id,
    now(),
    v_actor_user_id
  FROM public.form_config_v2_fields f
  WHERE f.form_id = v_form_id
    AND f.is_deleted = false;

  GET DIAGNOSTICS v_field_count = ROW_COUNT;

  UPDATE public.form_config_v2_forms
  SET
    live_published_at = now(),
    live_published_by = v_actor_user_id,
    updated_at = now()
  WHERE id = v_form_id;

  RETURN jsonb_build_object(
    'success', true,
    'published_fields', v_field_count,
    'form_key', v_form_key
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.publish_form_builder_v2_to_live_with_session(text, text) TO PUBLIC;
