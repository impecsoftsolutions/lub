/*
  # Form Builder V2 - Centralized Form and Field Management

  Purpose
  - Move new form/field creation to a centralized admin flow instead of per-form pages.
  - Provide generic RPCs to list forms, read form fields, create forms, create fields, and delete form-scoped fields.
  - Prevent cross-form field-key conflicts with a global active field key uniqueness rule.
*/

-- Prevent conflicting active field keys across different forms.
CREATE UNIQUE INDEX IF NOT EXISTS idx_form_config_v2_fields_global_key_active
  ON public.form_config_v2_fields(field_key)
  WHERE is_deleted = false;

-- ---------------------------------------------------------------------------
-- Public read RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_form_config_v2_forms()
RETURNS TABLE (
  id uuid,
  form_key text,
  form_name text,
  description text,
  is_active boolean,
  field_count integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    f.id,
    f.form_key,
    f.form_name,
    f.description,
    f.is_active,
    COALESCE(fc.field_count, 0)::integer AS field_count
  FROM public.form_config_v2_forms f
  LEFT JOIN (
    SELECT
      form_id,
      COUNT(*) AS field_count
    FROM public.form_config_v2_fields
    WHERE is_deleted = false
    GROUP BY form_id
  ) fc ON fc.form_id = f.id
  ORDER BY f.form_name, f.form_key;
$$;

GRANT EXECUTE ON FUNCTION public.list_form_config_v2_forms() TO PUBLIC;

CREATE OR REPLACE FUNCTION public.get_form_configuration_v2(
  p_form_key text
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
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  WHERE fm.form_key = trim(COALESCE(p_form_key, ''))
    AND f.is_deleted = false
  ORDER BY f.section_name, f.display_order, f.field_key;
$$;

GRANT EXECUTE ON FUNCTION public.get_form_configuration_v2(text) TO PUBLIC;

-- ---------------------------------------------------------------------------
-- Admin write RPCs (_with_session)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_form_config_v2_form_with_session(
  p_session_token text,
  p_form_key text,
  p_form_name text,
  p_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
  v_form_key text := lower(trim(COALESCE(p_form_key, '')));
  v_form_name text := trim(COALESCE(p_form_name, ''));
  v_row public.form_config_v2_forms%ROWTYPE;
BEGIN
  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);

  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT public.has_permission(v_actor_user_id, 'settings.forms.configure') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  IF v_form_key = '' OR v_form_key !~ '^[a-z][a-z0-9_]*$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid form_key format');
  END IF;

  IF v_form_name = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'form_name is required');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.form_config_v2_forms f
    WHERE f.form_key = v_form_key
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'form_key already exists');
  END IF;

  INSERT INTO public.form_config_v2_forms (
    form_key,
    form_name,
    description,
    is_active
  )
  VALUES (
    v_form_key,
    v_form_name,
    NULLIF(trim(COALESCE(p_description, '')), ''),
    true
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'id', v_row.id,
      'form_key', v_row.form_key,
      'form_name', v_row.form_name,
      'description', v_row.description,
      'is_active', v_row.is_active
    )
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_form_config_v2_form_with_session(text, text, text, text) TO PUBLIC;

CREATE OR REPLACE FUNCTION public.create_form_config_v2_field_with_session(
  p_session_token text,
  p_form_key text,
  p_field_key text,
  p_label text,
  p_field_type text,
  p_section_name text,
  p_placeholder text DEFAULT NULL,
  p_help_text text DEFAULT NULL,
  p_option_items jsonb DEFAULT NULL,
  p_default_value text DEFAULT NULL,
  p_is_visible boolean DEFAULT true,
  p_is_required boolean DEFAULT false,
  p_display_order integer DEFAULT NULL,
  p_validation_rule_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
  v_form_id uuid;
  v_form_key text := lower(trim(COALESCE(p_form_key, '')));
  v_field_key text := lower(trim(COALESCE(p_field_key, '')));
  v_field_type text := lower(trim(COALESCE(p_field_type, '')));
  v_section_name text := COALESCE(NULLIF(trim(p_section_name), ''), 'General');
  v_is_visible boolean := COALESCE(p_is_visible, true);
  v_is_required boolean := COALESCE(p_is_required, false);
  v_display_order integer;
  v_row public.form_config_v2_fields%ROWTYPE;
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

  IF v_field_key = '' OR v_field_key !~ '^[a-z][a-z0-9_]*$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid field_key format');
  END IF;

  IF COALESCE(NULLIF(trim(p_label), ''), '') = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'label is required');
  END IF;

  IF v_field_type NOT IN ('text', 'textarea', 'select', 'checkbox', 'number', 'date', 'url', 'email', 'tel') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid field_type');
  END IF;

  IF p_option_items IS NOT NULL AND jsonb_typeof(p_option_items) <> 'array' THEN
    RETURN jsonb_build_object('success', false, 'error', 'option_items must be an array');
  END IF;

  IF p_validation_rule_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.validation_rules vr
    WHERE vr.id = p_validation_rule_id
      AND vr.is_active = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Validation rule is missing or inactive');
  END IF;

  IF v_is_required THEN
    v_is_visible := true;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.form_config_v2_fields f
    WHERE f.field_key = v_field_key
      AND f.is_deleted = false
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'field_key already exists in another form');
  END IF;

  IF p_display_order IS NULL THEN
    SELECT COALESCE(MAX(display_order), 0) + 1
    INTO v_display_order
    FROM public.form_config_v2_fields f
    WHERE f.form_id = v_form_id
      AND f.is_deleted = false
      AND f.section_name = v_section_name;
  ELSE
    v_display_order := p_display_order;
  END IF;

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
    deleted_at,
    created_by,
    updated_by
  )
  VALUES (
    v_form_id,
    v_field_key,
    trim(p_label),
    v_field_type,
    v_section_name,
    NULLIF(p_placeholder, ''),
    NULLIF(p_help_text, ''),
    p_option_items,
    NULLIF(p_default_value, ''),
    v_is_visible,
    v_is_required,
    false,
    false,
    v_display_order,
    p_validation_rule_id,
    false,
    NULL,
    v_actor_user_id,
    v_actor_user_id
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'id', v_row.id,
      'form_key', v_form_key,
      'field_key', v_row.field_key,
      'label', v_row.label,
      'field_type', v_row.field_type,
      'section_name', v_row.section_name,
      'placeholder', v_row.placeholder,
      'help_text', v_row.help_text,
      'option_items', v_row.option_items,
      'default_value', v_row.default_value,
      'is_visible', v_row.is_visible,
      'is_required', v_row.is_required,
      'is_locked', v_row.is_locked,
      'is_system_field', v_row.is_system_field,
      'display_order', v_row.display_order,
      'validation_rule_id', v_row.validation_rule_id
    )
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_form_config_v2_field_with_session(text, text, text, text, text, text, text, text, jsonb, text, boolean, boolean, integer, uuid) TO PUBLIC;

CREATE OR REPLACE FUNCTION public.delete_form_config_v2_field_with_session(
  p_session_token text,
  p_form_key text,
  p_field_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
  v_form_id uuid;
  v_field_key text := lower(trim(COALESCE(p_field_key, '')));
  v_form_key text := lower(trim(COALESCE(p_form_key, '')));
  v_field_row public.form_config_v2_fields%ROWTYPE;
BEGIN
  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);

  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT public.has_permission(v_actor_user_id, 'settings.forms.configure') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  IF v_form_key = '' OR v_field_key = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'form_key and field_key are required');
  END IF;

  SELECT id INTO v_form_id
  FROM public.form_config_v2_forms
  WHERE form_key = v_form_key
  LIMIT 1;

  IF v_form_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Form not found');
  END IF;

  SELECT * INTO v_field_row
  FROM public.form_config_v2_fields
  WHERE form_id = v_form_id
    AND field_key = v_field_key
    AND is_deleted = false
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Field not found');
  END IF;

  IF v_field_row.is_system_field OR v_field_row.is_locked THEN
    RETURN jsonb_build_object('success', false, 'error', 'Protected fields cannot be deleted');
  END IF;

  UPDATE public.form_config_v2_fields
  SET
    is_deleted = true,
    deleted_at = now(),
    updated_by = v_actor_user_id,
    updated_at = now()
  WHERE id = v_field_row.id;

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_form_config_v2_field_with_session(text, text, text) TO PUBLIC;
