/*
  # Form Builder / Preview corrections

  1) Add session-scoped Signup draft read RPC for preview mode.
  2) Enforce "empty select cannot be required" guard for non-controlled select fields.
  3) Allow controlled-source select fields in Field Library without manual option_items.
*/

CREATE OR REPLACE FUNCTION public.form_builder_v2_has_controlled_select_source(
  p_field_key text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT lower(trim(COALESCE(p_field_key, ''))) IN (
    'gender',
    'state',
    'district',
    'city',
    'company_designation_id',
    'payment_mode',
    'gst_registered',
    'esic_registered',
    'epf_registered'
  );
$$;

GRANT EXECUTE ON FUNCTION public.form_builder_v2_has_controlled_select_source(text) TO PUBLIC;

CREATE OR REPLACE FUNCTION public.get_signup_form_configuration_v2_draft_with_session(
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
  WHERE fm.form_key = 'signup'
    AND fm.is_active = true
    AND f.is_deleted = false
  ORDER BY f.section_name, f.display_order, f.field_key;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_signup_form_configuration_v2_draft_with_session(text) TO PUBLIC;

CREATE OR REPLACE FUNCTION public.upsert_form_builder_v2_field_settings_with_session(
  p_session_token text,
  p_form_key text,
  p_fields jsonb
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
  v_field jsonb;
  v_field_key text;
  v_is_visible boolean;
  v_is_required boolean;
  v_display_order integer;
  v_field_row public.form_config_v2_fields%ROWTYPE;
BEGIN
  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;
  IF NOT public.has_permission(v_actor_user_id, 'settings.forms.configure') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;
  IF p_fields IS NULL OR jsonb_typeof(p_fields) <> 'array' THEN
    RETURN jsonb_build_object('success', false, 'error', 'fields must be an array');
  END IF;

  SELECT id INTO v_form_id FROM public.form_config_v2_forms WHERE form_key = v_form_key LIMIT 1;
  IF v_form_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Form not found');
  END IF;

  FOR v_field IN SELECT * FROM jsonb_array_elements(p_fields)
  LOOP
    v_field_key := lower(trim(COALESCE(v_field ->> 'field_key', '')));
    v_is_visible := COALESCE((v_field ->> 'is_visible')::boolean, true);
    v_is_required := COALESCE((v_field ->> 'is_required')::boolean, false);
    v_display_order := NULLIF(COALESCE(v_field ->> 'display_order', ''), '')::integer;

    SELECT * INTO v_field_row
    FROM public.form_config_v2_fields
    WHERE form_id = v_form_id
      AND field_key = v_field_key
      AND is_deleted = false
    LIMIT 1;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', format('Field not found in form: %s', v_field_key));
    END IF;

    IF v_field_row.is_locked OR v_field_row.is_system_field THEN
      v_is_visible := true;
      v_is_required := true;
    ELSIF v_is_required THEN
      IF v_field_row.field_type = 'select'
        AND NOT public.form_builder_v2_has_controlled_select_source(v_field_key)
        AND COALESCE(jsonb_array_length(v_field_row.option_items), 0) = 0
      THEN
        v_is_required := false;
      ELSE
        v_is_visible := true;
      END IF;
    END IF;

    UPDATE public.form_config_v2_fields
    SET
      is_visible = v_is_visible,
      is_required = v_is_required,
      display_order = COALESCE(v_display_order, display_order),
      updated_by = v_actor_user_id,
      updated_at = now()
    WHERE id = v_field_row.id;
  END LOOP;

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_form_builder_v2_field_settings_with_session(text, text, jsonb) TO PUBLIC;

CREATE OR REPLACE FUNCTION public.upsert_signup_form_configuration_v2_with_session(
  p_session_token text,
  p_fields jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
  v_form_id uuid;
  v_item jsonb;
  v_field_row public.form_config_v2_fields%ROWTYPE;
  v_field_key text;
  v_label text;
  v_field_type text;
  v_section_name text;
  v_placeholder text;
  v_help_text text;
  v_option_items jsonb;
  v_default_value text;
  v_is_visible boolean;
  v_is_required boolean;
  v_display_order integer;
  v_validation_rule_id uuid;
  v_updated_count integer := 0;
BEGIN
  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);

  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT public.has_permission(v_actor_user_id, 'settings.forms.configure') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  IF p_fields IS NULL OR jsonb_typeof(p_fields) <> 'array' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Fields array is required');
  END IF;

  SELECT id INTO v_form_id
  FROM public.form_config_v2_forms
  WHERE form_key = 'signup'
  LIMIT 1;

  IF v_form_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Signup form configuration not initialized');
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_fields)
  LOOP
    v_field_key := lower(trim(COALESCE(v_item->>'field_key', '')));

    IF v_field_key = '' THEN
      RETURN jsonb_build_object('success', false, 'error', 'field_key is required for each field');
    END IF;

    SELECT * INTO v_field_row
    FROM public.form_config_v2_fields
    WHERE form_id = v_form_id
      AND field_key = v_field_key
      AND is_deleted = false
    LIMIT 1;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', format('Field not found: %s', v_field_key));
    END IF;

    v_label := COALESCE(NULLIF(trim(v_item->>'label'), ''), v_field_row.label);
    v_field_type := COALESCE(NULLIF(trim(v_item->>'field_type'), ''), v_field_row.field_type);
    v_section_name := COALESCE(NULLIF(trim(v_item->>'section_name'), ''), v_field_row.section_name);
    v_placeholder := CASE WHEN v_item ? 'placeholder' THEN NULLIF(v_item->>'placeholder', '') ELSE v_field_row.placeholder END;
    v_help_text := CASE WHEN v_item ? 'help_text' THEN NULLIF(v_item->>'help_text', '') ELSE v_field_row.help_text END;
    v_default_value := CASE WHEN v_item ? 'default_value' THEN NULLIF(v_item->>'default_value', '') ELSE v_field_row.default_value END;
    v_display_order := COALESCE(NULLIF(v_item->>'display_order', '')::integer, v_field_row.display_order);
    v_is_visible := COALESCE((v_item->>'is_visible')::boolean, v_field_row.is_visible);
    v_is_required := COALESCE((v_item->>'is_required')::boolean, v_field_row.is_required);

    IF v_is_required THEN
      v_is_visible := true;
    END IF;

    IF v_field_row.is_locked THEN
      IF v_is_visible = false OR v_is_required = false THEN
        RETURN jsonb_build_object('success', false, 'error', format('Protected field cannot be hidden or made optional: %s', v_field_key));
      END IF;
    END IF;

    IF v_field_row.is_locked OR v_field_row.is_system_field THEN
      IF v_field_type <> v_field_row.field_type THEN
        RETURN jsonb_build_object('success', false, 'error', format('Protected field type cannot be changed: %s', v_field_key));
      END IF;
    END IF;

    IF v_field_type NOT IN ('text', 'textarea', 'select', 'checkbox', 'number', 'date', 'url', 'email', 'tel') THEN
      RETURN jsonb_build_object('success', false, 'error', format('Invalid field_type for %s', v_field_key));
    END IF;

    v_option_items := CASE
      WHEN v_item ? 'option_items' THEN v_item->'option_items'
      ELSE v_field_row.option_items
    END;

    IF v_option_items IS NOT NULL AND jsonb_typeof(v_option_items) <> 'array' THEN
      RETURN jsonb_build_object('success', false, 'error', format('option_items must be an array for %s', v_field_key));
    END IF;

    IF v_field_type = 'select'
      AND NOT public.form_builder_v2_has_controlled_select_source(v_field_key)
      AND COALESCE(jsonb_array_length(v_option_items), 0) = 0
    THEN
      v_is_required := false;
    END IF;

    IF v_item ? 'validation_rule_id' THEN
      BEGIN
        v_validation_rule_id := NULLIF(trim(v_item->>'validation_rule_id'), '')::uuid;
      EXCEPTION WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', format('Invalid validation_rule_id for %s', v_field_key));
      END;
    ELSE
      v_validation_rule_id := v_field_row.validation_rule_id;
    END IF;

    IF v_validation_rule_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM public.validation_rules vr
      WHERE vr.id = v_validation_rule_id
        AND vr.is_active = true
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', format('Assigned validation rule is missing or inactive for %s', v_field_key));
    END IF;

    UPDATE public.form_config_v2_fields
    SET
      label = v_label,
      field_type = v_field_type,
      section_name = v_section_name,
      placeholder = v_placeholder,
      help_text = v_help_text,
      option_items = v_option_items,
      default_value = v_default_value,
      is_visible = v_is_visible,
      is_required = v_is_required,
      display_order = v_display_order,
      validation_rule_id = v_validation_rule_id,
      updated_by = v_actor_user_id,
      updated_at = now()
    WHERE id = v_field_row.id;

    v_updated_count := v_updated_count + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'updated_count', v_updated_count);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_signup_form_configuration_v2_with_session(text, jsonb) TO PUBLIC;

CREATE OR REPLACE FUNCTION public.create_field_library_item_v2_with_session(
  p_session_token text,
  p_field_key text,
  p_label text,
  p_field_type text,
  p_section_name text,
  p_placeholder text DEFAULT NULL,
  p_help_text text DEFAULT NULL,
  p_option_items jsonb DEFAULT NULL,
  p_validation_rule_id uuid DEFAULT NULL,
  p_is_system_field boolean DEFAULT false,
  p_is_locked boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
  v_field_key text := lower(trim(COALESCE(p_field_key, '')));
  v_label text := trim(COALESCE(p_label, ''));
  v_field_type text := lower(trim(COALESCE(p_field_type, '')));
  v_section_name text := COALESCE(NULLIF(trim(p_section_name), ''), 'General');
BEGIN
  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;
  IF NOT public.has_permission(v_actor_user_id, 'settings.forms.configure') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;
  IF v_field_key = '' OR v_field_key !~ '^[a-z][a-z0-9_]*$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid field_key format');
  END IF;
  IF v_label = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'label is required');
  END IF;
  IF v_field_type NOT IN ('text', 'textarea', 'select', 'checkbox', 'number', 'date', 'url', 'email', 'tel') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid field_type');
  END IF;
  IF p_option_items IS NOT NULL AND jsonb_typeof(p_option_items) <> 'array' THEN
    RETURN jsonb_build_object('success', false, 'error', 'option_items must be an array');
  END IF;
  IF v_field_type = 'select'
    AND (p_option_items IS NULL OR jsonb_array_length(p_option_items) = 0)
    AND NOT public.form_builder_v2_has_controlled_select_source(v_field_key)
  THEN
    RETURN jsonb_build_object('success', false, 'error', 'Select field requires option_items');
  END IF;
  IF p_validation_rule_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.validation_rules vr WHERE vr.id = p_validation_rule_id AND vr.is_active = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Validation rule is missing or inactive');
  END IF;

  INSERT INTO public.form_field_library_v2 (
    field_key, label, field_type, section_name, placeholder, help_text, option_items, validation_rule_id,
    is_locked, is_system_field, is_archived, created_by, updated_by
  )
  VALUES (
    v_field_key, v_label, v_field_type, v_section_name, NULLIF(p_placeholder, ''), NULLIF(p_help_text, ''),
    p_option_items, p_validation_rule_id, COALESCE(p_is_locked, false), COALESCE(p_is_system_field, false),
    false, v_actor_user_id, v_actor_user_id
  )
  ON CONFLICT (field_key)
  DO UPDATE SET
    label = EXCLUDED.label,
    field_type = EXCLUDED.field_type,
    section_name = EXCLUDED.section_name,
    placeholder = EXCLUDED.placeholder,
    help_text = EXCLUDED.help_text,
    option_items = EXCLUDED.option_items,
    validation_rule_id = EXCLUDED.validation_rule_id,
    is_locked = EXCLUDED.is_locked,
    is_system_field = EXCLUDED.is_system_field,
    is_archived = false,
    updated_by = v_actor_user_id,
    updated_at = now();

  UPDATE public.form_config_v2_fields f
  SET
    label = lib.label,
    field_type = lib.field_type,
    section_name = lib.section_name,
    placeholder = lib.placeholder,
    help_text = lib.help_text,
    option_items = lib.option_items,
    validation_rule_id = lib.validation_rule_id,
    is_locked = lib.is_locked,
    is_system_field = lib.is_system_field,
    updated_by = v_actor_user_id,
    updated_at = now()
  FROM public.form_field_library_v2 lib
  WHERE f.field_key = lib.field_key
    AND f.field_key = v_field_key
    AND f.is_deleted = false;

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_field_library_item_v2_with_session(text, text, text, text, text, text, text, jsonb, uuid, boolean, boolean) TO PUBLIC;

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
