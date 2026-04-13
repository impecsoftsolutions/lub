-- =============================================================================
-- FIX: Form Builder re-add should restore soft-deleted field row
-- =============================================================================
-- Problem:
-- - delete_form_config_v2_field_with_session soft-deletes a row (is_deleted=true)
-- - create_form_config_v2_field_with_session attempted INSERT on re-add
-- - unique index (form_id, field_key) raised duplicate key violation
--
-- Solution:
-- - create_form_config_v2_field_with_session now restores existing soft-deleted
--   row in the same form instead of inserting a new row.

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
  v_has_existing_row boolean := false;
  v_existing_row public.form_config_v2_fields%ROWTYPE;
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

  SELECT *
  INTO v_existing_row
  FROM public.form_config_v2_fields f
  WHERE f.form_id = v_form_id
    AND f.field_key = v_field_key
  LIMIT 1;

  v_has_existing_row := FOUND;

  IF v_has_existing_row AND NOT v_existing_row.is_deleted THEN
    RETURN jsonb_build_object('success', false, 'error', 'field already exists in this form');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.form_config_v2_fields f
    WHERE f.field_key = v_field_key
      AND f.is_deleted = false
      AND f.form_id <> v_form_id
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

  IF v_has_existing_row THEN
    UPDATE public.form_config_v2_fields
    SET
      label = trim(p_label),
      field_type = v_field_type,
      section_name = v_section_name,
      placeholder = NULLIF(p_placeholder, ''),
      help_text = NULLIF(p_help_text, ''),
      option_items = p_option_items,
      default_value = NULLIF(p_default_value, ''),
      is_visible = v_is_visible,
      is_required = v_is_required,
      is_locked = false,
      is_system_field = false,
      display_order = v_display_order,
      validation_rule_id = p_validation_rule_id,
      is_deleted = false,
      deleted_at = NULL,
      updated_by = v_actor_user_id,
      updated_at = now()
    WHERE id = v_existing_row.id
    RETURNING * INTO v_row;
  ELSE
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
  END IF;

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
