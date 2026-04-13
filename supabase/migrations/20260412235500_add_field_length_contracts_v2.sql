/*
  # Field Length Contracts for Form Builder V2

  1) Add optional min/max length columns to field library, draft fields, and live fields.
  2) Extend builder/library/runtime read contracts to include min_length/max_length.
  3) Extend field-library write contracts to persist min/max lengths with type-aware guards.
  4) Preserve draft->live propagation by publishing min/max columns to live snapshots.
*/

BEGIN;

-- =============================================================================
-- SECTION 1: Schema columns + constraints
-- =============================================================================

ALTER TABLE public.form_field_library_v2
  ADD COLUMN IF NOT EXISTS min_length integer,
  ADD COLUMN IF NOT EXISTS max_length integer;

ALTER TABLE public.form_config_v2_fields
  ADD COLUMN IF NOT EXISTS min_length integer,
  ADD COLUMN IF NOT EXISTS max_length integer;

ALTER TABLE public.form_config_v2_live_fields
  ADD COLUMN IF NOT EXISTS min_length integer,
  ADD COLUMN IF NOT EXISTS max_length integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'form_field_library_v2_min_length_non_negative_check'
  ) THEN
    ALTER TABLE public.form_field_library_v2
      ADD CONSTRAINT form_field_library_v2_min_length_non_negative_check
      CHECK (min_length IS NULL OR min_length >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'form_field_library_v2_max_length_positive_check'
  ) THEN
    ALTER TABLE public.form_field_library_v2
      ADD CONSTRAINT form_field_library_v2_max_length_positive_check
      CHECK (max_length IS NULL OR max_length > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'form_field_library_v2_min_lte_max_check'
  ) THEN
    ALTER TABLE public.form_field_library_v2
      ADD CONSTRAINT form_field_library_v2_min_lte_max_check
      CHECK (
        min_length IS NULL
        OR max_length IS NULL
        OR min_length <= max_length
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'form_config_v2_fields_min_length_non_negative_check'
  ) THEN
    ALTER TABLE public.form_config_v2_fields
      ADD CONSTRAINT form_config_v2_fields_min_length_non_negative_check
      CHECK (min_length IS NULL OR min_length >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'form_config_v2_fields_max_length_positive_check'
  ) THEN
    ALTER TABLE public.form_config_v2_fields
      ADD CONSTRAINT form_config_v2_fields_max_length_positive_check
      CHECK (max_length IS NULL OR max_length > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'form_config_v2_fields_min_lte_max_check'
  ) THEN
    ALTER TABLE public.form_config_v2_fields
      ADD CONSTRAINT form_config_v2_fields_min_lte_max_check
      CHECK (
        min_length IS NULL
        OR max_length IS NULL
        OR min_length <= max_length
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'form_config_v2_live_fields_min_length_non_negative_check'
  ) THEN
    ALTER TABLE public.form_config_v2_live_fields
      ADD CONSTRAINT form_config_v2_live_fields_min_length_non_negative_check
      CHECK (min_length IS NULL OR min_length >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'form_config_v2_live_fields_max_length_positive_check'
  ) THEN
    ALTER TABLE public.form_config_v2_live_fields
      ADD CONSTRAINT form_config_v2_live_fields_max_length_positive_check
      CHECK (max_length IS NULL OR max_length > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'form_config_v2_live_fields_min_lte_max_check'
  ) THEN
    ALTER TABLE public.form_config_v2_live_fields
      ADD CONSTRAINT form_config_v2_live_fields_min_lte_max_check
      CHECK (
        min_length IS NULL
        OR max_length IS NULL
        OR min_length <= max_length
      );
  END IF;
END
$$;

-- =============================================================================
-- SECTION 2: Builder/library read contracts
-- =============================================================================

DROP FUNCTION IF EXISTS public.get_form_builder_schema_v2(text);

CREATE OR REPLACE FUNCTION public.get_form_builder_schema_v2(
  p_form_key text
)
RETURNS TABLE (
  form_id uuid,
  id uuid,
  form_key text,
  form_name text,
  description text,
  is_active boolean,
  field_key text,
  label text,
  field_type text,
  section_name text,
  placeholder text,
  help_text text,
  option_items jsonb,
  min_length integer,
  max_length integer,
  default_value text,
  is_visible boolean,
  is_required boolean,
  is_locked boolean,
  is_system_field boolean,
  display_order integer,
  validation_rule_id uuid,
  library_is_archived boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    fm.id AS form_id,
    f.id,
    fm.form_key,
    fm.form_name,
    fm.description,
    fm.is_active,
    f.field_key,
    COALESCE(lib.label, f.label) AS label,
    COALESCE(lib.field_type, f.field_type) AS field_type,
    COALESCE(lib.section_name, f.section_name) AS section_name,
    COALESCE(lib.placeholder, f.placeholder) AS placeholder,
    COALESCE(lib.help_text, f.help_text) AS help_text,
    COALESCE(lib.option_items, f.option_items) AS option_items,
    COALESCE(lib.min_length, f.min_length) AS min_length,
    COALESCE(lib.max_length, f.max_length) AS max_length,
    f.default_value,
    f.is_visible,
    f.is_required,
    COALESCE(lib.is_locked, f.is_locked) AS is_locked,
    COALESCE(lib.is_system_field, f.is_system_field) AS is_system_field,
    f.display_order,
    COALESCE(lib.validation_rule_id, f.validation_rule_id) AS validation_rule_id,
    COALESCE(lib.is_archived, false) AS library_is_archived
  FROM public.form_config_v2_forms fm
  LEFT JOIN public.form_config_v2_fields f
    ON f.form_id = fm.id
    AND f.is_deleted = false
    AND f.field_key <> ALL(ARRAY['id', 'status', 'created_at', 'updated_at'])
  LEFT JOIN public.form_field_library_v2 lib
    ON lib.field_key = f.field_key
  WHERE fm.form_key = trim(COALESCE(p_form_key, ''))
  ORDER BY COALESCE(lib.section_name, f.section_name), f.display_order, f.field_key;
$$;

GRANT EXECUTE ON FUNCTION public.get_form_builder_schema_v2(text) TO PUBLIC;

DROP FUNCTION IF EXISTS public.list_field_library_v2_with_session(text);

CREATE OR REPLACE FUNCTION public.list_field_library_v2_with_session(
  p_session_token text
)
RETURNS TABLE (
  field_key text,
  label text,
  field_type text,
  section_name text,
  placeholder text,
  help_text text,
  option_items jsonb,
  min_length integer,
  max_length integer,
  validation_rule_id uuid,
  is_locked boolean,
  is_system_field boolean,
  is_archived boolean,
  usage_count integer,
  created_at timestamptz,
  updated_at timestamptz
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
    lib.field_key,
    lib.label,
    lib.field_type,
    lib.section_name,
    lib.placeholder,
    lib.help_text,
    lib.option_items,
    lib.min_length,
    lib.max_length,
    lib.validation_rule_id,
    lib.is_locked,
    lib.is_system_field,
    lib.is_archived,
    COALESCE(use_count.usage_count, 0)::integer AS usage_count,
    lib.created_at,
    lib.updated_at
  FROM public.form_field_library_v2 lib
  LEFT JOIN (
    SELECT f.field_key, COUNT(*) AS usage_count
    FROM public.form_config_v2_fields f
    INNER JOIN public.form_config_v2_forms fm ON fm.id = f.form_id
    WHERE f.is_deleted = false
      AND fm.is_active = true
    GROUP BY f.field_key
  ) use_count ON use_count.field_key = lib.field_key
  WHERE lib.field_key <> ALL(ARRAY['id', 'status', 'created_at', 'updated_at'])
  ORDER BY lib.is_archived, lib.section_name, lib.label, lib.field_key;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_field_library_v2_with_session(text) TO PUBLIC;

-- =============================================================================
-- SECTION 3: Field library write contracts (min/max aware)
-- =============================================================================

DROP FUNCTION IF EXISTS public.update_field_library_item_v2_with_session(
  text, text, text, text, text, text, text, jsonb, uuid, boolean, boolean
);
DROP FUNCTION IF EXISTS public.create_field_library_item_v2_with_session(
  text, text, text, text, text, text, text, jsonb, uuid, boolean, boolean
);

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
  p_min_length integer DEFAULT NULL,
  p_max_length integer DEFAULT NULL,
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
  v_min_length integer := p_min_length;
  v_max_length integer := p_max_length;
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
  IF v_field_key = ANY(ARRAY['id', 'status', 'created_at', 'updated_at']) THEN
    RETURN jsonb_build_object('success', false, 'error', 'System metadata field key is reserved');
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

  -- Length settings are supported only on free-typing field types.
  IF v_field_type NOT IN ('text', 'textarea', 'email', 'tel', 'number') THEN
    v_min_length := NULL;
    v_max_length := NULL;
  END IF;

  IF v_min_length IS NOT NULL AND v_min_length < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'min_length must be greater than or equal to 0');
  END IF;

  IF v_max_length IS NOT NULL AND v_max_length <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'max_length must be greater than 0');
  END IF;

  IF v_min_length IS NOT NULL AND v_max_length IS NOT NULL AND v_min_length > v_max_length THEN
    RETURN jsonb_build_object('success', false, 'error', 'min_length cannot exceed max_length');
  END IF;

  INSERT INTO public.form_field_library_v2 (
    field_key, label, field_type, section_name, placeholder, help_text, option_items, min_length, max_length, validation_rule_id,
    is_locked, is_system_field, is_archived, created_by, updated_by
  )
  VALUES (
    v_field_key, v_label, v_field_type, v_section_name, NULLIF(p_placeholder, ''), NULLIF(p_help_text, ''),
    p_option_items, v_min_length, v_max_length, p_validation_rule_id,
    COALESCE(p_is_locked, false), COALESCE(p_is_system_field, false),
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
    min_length = EXCLUDED.min_length,
    max_length = EXCLUDED.max_length,
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
    min_length = lib.min_length,
    max_length = lib.max_length,
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

GRANT EXECUTE ON FUNCTION public.create_field_library_item_v2_with_session(
  text, text, text, text, text, text, text, jsonb, uuid, integer, integer, boolean, boolean
) TO PUBLIC;

CREATE OR REPLACE FUNCTION public.update_field_library_item_v2_with_session(
  p_session_token text,
  p_field_key text,
  p_label text,
  p_field_type text,
  p_section_name text,
  p_placeholder text DEFAULT NULL,
  p_help_text text DEFAULT NULL,
  p_option_items jsonb DEFAULT NULL,
  p_validation_rule_id uuid DEFAULT NULL,
  p_min_length integer DEFAULT NULL,
  p_max_length integer DEFAULT NULL,
  p_is_system_field boolean DEFAULT false,
  p_is_locked boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN public.create_field_library_item_v2_with_session(
    p_session_token,
    p_field_key,
    p_label,
    p_field_type,
    p_section_name,
    p_placeholder,
    p_help_text,
    p_option_items,
    p_validation_rule_id,
    p_min_length,
    p_max_length,
    p_is_system_field,
    p_is_locked
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_field_library_item_v2_with_session(
  text, text, text, text, text, text, text, jsonb, uuid, integer, integer, boolean, boolean
) TO PUBLIC;

-- =============================================================================
-- SECTION 4: Attach + publish propagation
-- =============================================================================

CREATE OR REPLACE FUNCTION public.attach_field_to_form_v2_with_session(
  p_session_token text,
  p_form_key text,
  p_field_key text,
  p_is_visible boolean DEFAULT true,
  p_is_required boolean DEFAULT false,
  p_display_order integer DEFAULT NULL
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
  v_is_visible boolean := COALESCE(p_is_visible, true);
  v_is_required boolean := COALESCE(p_is_required, false);
  v_display_order integer;
  v_library_row public.form_field_library_v2%ROWTYPE;
  v_existing_row public.form_config_v2_fields%ROWTYPE;
BEGIN
  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;
  IF NOT public.has_permission(v_actor_user_id, 'settings.forms.configure') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  IF v_field_key = ANY(ARRAY['id', 'status', 'created_at', 'updated_at']) THEN
    RETURN jsonb_build_object('success', false, 'error', 'System metadata fields cannot be attached');
  END IF;

  SELECT id INTO v_form_id FROM public.form_config_v2_forms WHERE form_key = v_form_key LIMIT 1;
  IF v_form_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Form not found');
  END IF;
  SELECT * INTO v_library_row
  FROM public.form_field_library_v2
  WHERE field_key = v_field_key AND is_archived = false
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Field not found in library');
  END IF;

  IF v_library_row.is_locked OR v_library_row.is_system_field THEN
    v_is_visible := true;
    v_is_required := true;
  ELSIF v_is_required THEN
    v_is_visible := true;
  END IF;

  IF p_display_order IS NULL THEN
    SELECT COALESCE(MAX(display_order), 0) + 1
    INTO v_display_order
    FROM public.form_config_v2_fields f
    WHERE f.form_id = v_form_id
      AND f.is_deleted = false;
  ELSE
    v_display_order := p_display_order;
  END IF;

  SELECT * INTO v_existing_row
  FROM public.form_config_v2_fields f
  WHERE f.form_id = v_form_id
    AND f.field_key = v_field_key
  LIMIT 1;

  IF FOUND THEN
    IF NOT v_existing_row.is_deleted THEN
      RETURN jsonb_build_object('success', false, 'error', 'field already attached to this form');
    END IF;

    UPDATE public.form_config_v2_fields
    SET
      label = v_library_row.label,
      field_type = v_library_row.field_type,
      section_name = v_library_row.section_name,
      placeholder = v_library_row.placeholder,
      help_text = v_library_row.help_text,
      option_items = v_library_row.option_items,
      min_length = v_library_row.min_length,
      max_length = v_library_row.max_length,
      default_value = NULL,
      is_visible = v_is_visible,
      is_required = v_is_required,
      is_locked = v_library_row.is_locked,
      is_system_field = v_library_row.is_system_field,
      display_order = v_display_order,
      validation_rule_id = v_library_row.validation_rule_id,
      is_deleted = false,
      deleted_at = NULL,
      updated_by = v_actor_user_id,
      updated_at = now()
    WHERE id = v_existing_row.id;
  ELSE
    INSERT INTO public.form_config_v2_fields (
      form_id, field_key, label, field_type, section_name, placeholder, help_text, option_items, min_length, max_length, default_value,
      is_visible, is_required, is_locked, is_system_field, display_order, validation_rule_id, is_deleted, deleted_at,
      created_by, updated_by
    )
    VALUES (
      v_form_id, v_field_key, v_library_row.label, v_library_row.field_type, v_library_row.section_name,
      v_library_row.placeholder, v_library_row.help_text, v_library_row.option_items, v_library_row.min_length, v_library_row.max_length, NULL,
      v_is_visible, v_is_required, v_library_row.is_locked, v_library_row.is_system_field, v_display_order,
      v_library_row.validation_rule_id, false, NULL, v_actor_user_id, v_actor_user_id
    );
  END IF;

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

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
    min_length,
    max_length,
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
    f.min_length,
    f.max_length,
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

-- =============================================================================
-- SECTION 5: Runtime read contracts (signup/signin/join/member-edit)
-- =============================================================================

DROP FUNCTION IF EXISTS public.get_signup_form_configuration_v2();
DROP FUNCTION IF EXISTS public.get_signup_form_configuration_v2_draft_with_session(text);
DROP FUNCTION IF EXISTS public.get_signin_form_configuration_v2();
DROP FUNCTION IF EXISTS public.get_signin_form_configuration_v2_draft_with_session(text);
DROP FUNCTION IF EXISTS public.get_join_form_configuration_v2();
DROP FUNCTION IF EXISTS public.get_join_form_configuration_v2_draft_with_session(text);
DROP FUNCTION IF EXISTS public.get_member_edit_form_configuration_v2_with_session(text);
DROP FUNCTION IF EXISTS public.get_member_edit_form_configuration_v2_draft_with_session(text);

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
  min_length integer,
  max_length integer,
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
    lf.min_length,
    lf.max_length,
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
  min_length integer,
  max_length integer,
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
    f.min_length,
    f.max_length,
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
  min_length integer,
  max_length integer,
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
    lf.min_length,
    lf.max_length,
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
  min_length integer,
  max_length integer,
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
    f.min_length,
    f.max_length,
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

CREATE OR REPLACE FUNCTION public.get_join_form_configuration_v2()
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
  min_length integer,
  max_length integer,
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
  WITH join_form AS (
    SELECT fm.id, fm.form_key
    FROM public.form_config_v2_forms fm
    WHERE fm.form_key = 'join_lub'
      AND fm.is_active = true
    LIMIT 1
  )
  SELECT
    lf.id,
    jf.form_key,
    lf.field_key,
    lf.label,
    lf.field_type,
    lf.section_name,
    lf.placeholder,
    lf.help_text,
    lf.option_items,
    lf.min_length,
    lf.max_length,
    lf.default_value,
    lf.is_visible,
    lf.is_required,
    lf.is_locked,
    lf.is_system_field,
    lf.display_order,
    lf.validation_rule_id
  FROM join_form jf
  INNER JOIN public.form_config_v2_live_fields lf
    ON lf.form_id = jf.id
  WHERE lf.field_key <> ALL(ARRAY['id', 'status', 'created_at', 'updated_at'])
  ORDER BY lf.section_name, lf.display_order, lf.field_key;
$$;

GRANT EXECUTE ON FUNCTION public.get_join_form_configuration_v2() TO PUBLIC;

CREATE OR REPLACE FUNCTION public.get_join_form_configuration_v2_draft_with_session(
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
  min_length integer,
  max_length integer,
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
    f.min_length,
    f.max_length,
    f.default_value,
    f.is_visible,
    f.is_required,
    f.is_locked,
    f.is_system_field,
    f.display_order,
    f.validation_rule_id
  FROM public.form_config_v2_fields f
  INNER JOIN public.form_config_v2_forms fm ON fm.id = f.form_id
  WHERE fm.form_key = 'join_lub'
    AND fm.is_active = true
    AND f.is_deleted = false
    AND f.field_key <> ALL(ARRAY['id', 'status', 'created_at', 'updated_at'])
  ORDER BY f.section_name, f.display_order, f.field_key;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_join_form_configuration_v2_draft_with_session(text) TO PUBLIC;

CREATE OR REPLACE FUNCTION public.get_member_edit_form_configuration_v2_with_session(
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
  min_length integer,
  max_length integer,
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
  v_form_id uuid;
BEGIN
  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Invalid session';
  END IF;

  SELECT fm.id
  INTO v_form_id
  FROM public.form_config_v2_forms fm
  WHERE fm.form_key = 'member_edit'
    AND fm.is_active = true
  LIMIT 1;

  IF v_form_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    lf.id,
    'member_edit'::text AS form_key,
    lf.field_key,
    lf.label,
    lf.field_type,
    lf.section_name,
    lf.placeholder,
    lf.help_text,
    lf.option_items,
    lf.min_length,
    lf.max_length,
    lf.default_value,
    lf.is_visible,
    lf.is_required,
    lf.is_locked,
    lf.is_system_field,
    lf.display_order,
    lf.validation_rule_id
  FROM public.form_config_v2_live_fields lf
  WHERE lf.form_id = v_form_id
    AND lf.field_key <> ALL(ARRAY['id', 'status', 'created_at', 'updated_at'])
  ORDER BY lf.section_name, lf.display_order, lf.field_key;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_member_edit_form_configuration_v2_with_session(text) TO PUBLIC;

CREATE OR REPLACE FUNCTION public.get_member_edit_form_configuration_v2_draft_with_session(
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
  min_length integer,
  max_length integer,
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
    f.min_length,
    f.max_length,
    f.default_value,
    f.is_visible,
    f.is_required,
    f.is_locked,
    f.is_system_field,
    f.display_order,
    f.validation_rule_id
  FROM public.form_config_v2_fields f
  INNER JOIN public.form_config_v2_forms fm ON fm.id = f.form_id
  WHERE fm.form_key = 'member_edit'
    AND fm.is_active = true
    AND f.is_deleted = false
    AND f.field_key <> ALL(ARRAY['id', 'status', 'created_at', 'updated_at'])
  ORDER BY f.section_name, f.display_order, f.field_key;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_member_edit_form_configuration_v2_draft_with_session(text) TO PUBLIC;

COMMIT;
