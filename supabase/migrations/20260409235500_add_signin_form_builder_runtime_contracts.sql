/*
  # Sign-In Form Builder Runtime Contracts

  1) Seeds Sign-In form and protected core fields (`email`, `mobile_number`) in builder domain.
  2) Adds public live-runtime read contract for Sign-In form configuration.
  3) Adds admin session-gated draft read contract for Sign-In preview.
  4) Extends publish guard so Sign-In core auth fields cannot be published hidden/optional.
  5) Bootstraps Sign-In live snapshot once as legacy-seeded if missing.
*/

-- =============================================================================
-- SECTION 1: Seed Sign-In form + core fields
-- =============================================================================

INSERT INTO public.form_field_library_v2 (
  field_key,
  label,
  field_type,
  section_name,
  placeholder,
  help_text,
  option_items,
  validation_rule_id,
  is_locked,
  is_system_field,
  is_archived
)
VALUES
  ('email', 'Email Address', 'email', 'Core Details', 'your.email@example.com', NULL, NULL, NULL, true, true, false),
  ('mobile_number', 'Mobile Number', 'tel', 'Core Details', '10-digit mobile number', NULL, NULL, NULL, true, true, false)
ON CONFLICT (field_key)
DO UPDATE SET
  label = EXCLUDED.label,
  field_type = EXCLUDED.field_type,
  section_name = EXCLUDED.section_name,
  placeholder = EXCLUDED.placeholder,
  is_locked = true,
  is_system_field = true,
  is_archived = false,
  updated_at = now();

INSERT INTO public.form_config_v2_forms (form_key, form_name, description, is_active)
VALUES ('signin', 'Sign In Form', 'Portal sign-in form configuration', true)
ON CONFLICT (form_key)
DO UPDATE SET
  form_name = EXCLUDED.form_name,
  description = EXCLUDED.description,
  is_active = true,
  updated_at = now();

WITH signin_form AS (
  SELECT id
  FROM public.form_config_v2_forms
  WHERE form_key = 'signin'
  LIMIT 1
)
INSERT INTO public.form_config_v2_fields (
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
  is_deleted,
  deleted_at
)
SELECT
  sf.id,
  v.field_key,
  v.label,
  v.field_type,
  'Core Details',
  v.placeholder,
  NULL,
  NULL,
  NULL,
  true,
  true,
  true,
  true,
  v.display_order,
  NULL,
  false,
  NULL
FROM signin_form sf
CROSS JOIN (
  VALUES
    ('email'::text, 'Email Address'::text, 'email'::text, 'your.email@example.com'::text, 1::integer),
    ('mobile_number'::text, 'Mobile Number'::text, 'tel'::text, '10-digit mobile number'::text, 2::integer)
) AS v(field_key, label, field_type, placeholder, display_order)
ON CONFLICT (form_id, field_key)
DO UPDATE SET
  label = EXCLUDED.label,
  field_type = EXCLUDED.field_type,
  section_name = EXCLUDED.section_name,
  placeholder = EXCLUDED.placeholder,
  help_text = EXCLUDED.help_text,
  option_items = EXCLUDED.option_items,
  default_value = EXCLUDED.default_value,
  is_visible = true,
  is_required = true,
  is_locked = true,
  is_system_field = true,
  display_order = EXCLUDED.display_order,
  validation_rule_id = EXCLUDED.validation_rule_id,
  is_deleted = false,
  deleted_at = NULL,
  updated_at = now();

-- =============================================================================
-- SECTION 2: Runtime read contracts
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_signin_form_configuration_v2()
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
  WITH signin_form AS (
    SELECT fm.id, fm.form_key
    FROM public.form_config_v2_forms fm
    WHERE fm.form_key = 'signin'
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
  FROM signin_form sf
  INNER JOIN public.form_config_v2_live_fields lf
    ON lf.form_id = sf.id
  ORDER BY lf.section_name, lf.display_order, lf.field_key;
$$;

GRANT EXECUTE ON FUNCTION public.get_signin_form_configuration_v2() TO PUBLIC;

CREATE OR REPLACE FUNCTION public.get_signin_form_configuration_v2_draft_with_session(
  p_session_token text
)
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
    f.id,
    fm.form_key,
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
    f.validation_rule_id
  FROM public.form_config_v2_fields f
  INNER JOIN public.form_config_v2_forms fm ON fm.id = f.form_id
  WHERE fm.form_key = 'signin'
    AND fm.is_active = true
    AND f.is_deleted = false
  ORDER BY f.section_name, f.display_order, f.field_key;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_signin_form_configuration_v2_draft_with_session(text) TO PUBLIC;

-- =============================================================================
-- SECTION 3: Publish guard update (sign-in core auth fields)
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
  v_form_label text;
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

  IF v_form_key IN ('signup', 'signin') THEN
    v_form_label := CASE WHEN v_form_key = 'signup' THEN 'Signup' ELSE 'Sign-in' END;

    IF NOT EXISTS (
      SELECT 1
      FROM public.form_config_v2_fields f
      WHERE f.form_id = v_form_id
        AND f.field_key = 'email'
        AND f.is_deleted = false
        AND f.is_visible = true
        AND f.is_required = true
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', v_form_label || ' email must remain visible and required before publish');
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
      RETURN jsonb_build_object('success', false, 'error', v_form_label || ' mobile number must remain visible and required before publish');
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

-- =============================================================================
-- SECTION 4: Bootstrap legacy live snapshot for Sign-In (single-time)
-- =============================================================================

DO $$
DECLARE
  v_signin_form_id uuid;
  v_live_field_count integer;
BEGIN
  SELECT id INTO v_signin_form_id
  FROM public.form_config_v2_forms
  WHERE form_key = 'signin'
  LIMIT 1;

  IF v_signin_form_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_live_field_count
  FROM public.form_config_v2_live_fields
  WHERE form_id = v_signin_form_id;

  IF COALESCE(v_live_field_count, 0) > 0 THEN
    RETURN;
  END IF;

  PERFORM set_config('lub.form_builder_live_write_context', 'publish_rpc', true);

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
    NULL
  FROM public.form_config_v2_fields f
  WHERE f.form_id = v_signin_form_id
    AND f.is_deleted = false;

  UPDATE public.form_config_v2_forms
  SET
    live_published_at = COALESCE(live_published_at, now()),
    live_published_by = NULL,
    updated_at = now()
  WHERE id = v_signin_form_id;
END;
$$;
