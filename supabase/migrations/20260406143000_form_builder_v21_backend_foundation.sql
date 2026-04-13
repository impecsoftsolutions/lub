/*
  # Form Builder V2.1 Backend Foundation

  1) Adds centralized field library table
  2) Backfills Signup + Join forms into shared builder domain
  3) Adds builder + field-library RPC contracts
*/

-- =============================================================================
-- SECTION 1: Schema alignment + backfill
-- =============================================================================

DROP INDEX IF EXISTS public.idx_form_config_v2_fields_global_key_active;

CREATE TABLE IF NOT EXISTS public.form_field_library_v2 (
  field_key text PRIMARY KEY,
  label text NOT NULL,
  field_type text NOT NULL,
  section_name text NOT NULL DEFAULT 'General',
  placeholder text,
  help_text text,
  option_items jsonb,
  validation_rule_id uuid REFERENCES public.validation_rules(id) ON DELETE SET NULL,
  is_locked boolean NOT NULL DEFAULT false,
  is_system_field boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT form_field_library_v2_field_type_check CHECK (
    field_type IN ('text', 'textarea', 'select', 'checkbox', 'number', 'date', 'url', 'email', 'tel')
  ),
  CONSTRAINT form_field_library_v2_field_key_check CHECK (
    field_key ~ '^[a-z][a-z0-9_]*$'
  ),
  CONSTRAINT form_field_library_v2_option_items_array_check CHECK (
    option_items IS NULL OR jsonb_typeof(option_items) = 'array'
  )
);

CREATE INDEX IF NOT EXISTS idx_form_field_library_v2_archived
  ON public.form_field_library_v2(is_archived, section_name, field_key);

ALTER TABLE public.form_field_library_v2 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read form field library v2" ON public.form_field_library_v2;
CREATE POLICY "Allow public read form field library v2"
  ON public.form_field_library_v2
  FOR SELECT
  TO anon, authenticated
  USING (NOT is_archived);

DROP TRIGGER IF EXISTS trg_form_field_library_v2_set_updated_at ON public.form_field_library_v2;
CREATE TRIGGER trg_form_field_library_v2_set_updated_at
  BEFORE UPDATE ON public.form_field_library_v2
  FOR EACH ROW
  EXECUTE FUNCTION public.form_config_v2_set_updated_at();

INSERT INTO public.form_field_library_v2 (
  field_key, label, field_type, section_name, placeholder, help_text, option_items,
  validation_rule_id, is_locked, is_system_field, is_archived, created_at, updated_at
)
SELECT
  src.field_key, src.label, src.field_type, src.section_name, src.placeholder, src.help_text, src.option_items,
  src.validation_rule_id, src.is_locked, src.is_system_field, false, src.created_at, src.updated_at
FROM (
  SELECT DISTINCT ON (lower(trim(f.field_key)))
    lower(trim(f.field_key)) AS field_key,
    f.label,
    f.field_type,
    f.section_name,
    f.placeholder,
    f.help_text,
    f.option_items,
    f.validation_rule_id,
    f.is_locked,
    f.is_system_field,
    f.created_at,
    f.updated_at
  FROM public.form_config_v2_fields f
  WHERE f.is_deleted = false
  ORDER BY lower(trim(f.field_key)), f.updated_at DESC, f.created_at DESC
) src
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
  updated_at = now();

INSERT INTO public.form_field_library_v2 (
  field_key, label, field_type, section_name, validation_rule_id,
  is_locked, is_system_field, is_archived, created_at, updated_at
)
SELECT
  lower(trim(ffc.field_name)) AS field_key,
  ffc.field_label,
  CASE
    WHEN lower(COALESCE(vr.rule_type, '')) = 'email' THEN 'email'
    WHEN lower(COALESCE(vr.rule_type, '')) = 'number' THEN 'number'
    WHEN lower(COALESCE(vr.rule_type, '')) = 'url' THEN 'url'
    WHEN lower(COALESCE(vr.rule_type, '')) = 'phone' THEN 'tel'
    WHEN lower(ffc.field_name) LIKE '%mobile%' OR lower(ffc.field_name) LIKE '%phone%' OR lower(ffc.field_name) LIKE '%tel%' THEN 'tel'
    WHEN lower(ffc.field_name) LIKE '%email%' THEN 'email'
    WHEN lower(ffc.field_name) LIKE '%website%' OR lower(ffc.field_name) LIKE '%url%' THEN 'url'
    WHEN lower(ffc.field_name) LIKE '%date%' OR lower(ffc.field_name) LIKE '%dob%' THEN 'date'
    WHEN lower(ffc.field_name) IN ('state', 'district', 'city', 'gender') THEN 'select'
    ELSE 'text'
  END AS field_type,
  COALESCE(NULLIF(trim(ffc.section_name), ''), 'General') AS section_name,
  ffc.validation_rule_id,
  COALESCE(ffc.is_system_field, false),
  COALESCE(ffc.is_system_field, false),
  false,
  ffc.created_at,
  ffc.updated_at
FROM public.form_field_configurations ffc
LEFT JOIN public.validation_rules vr ON vr.id = ffc.validation_rule_id
WHERE lower(trim(ffc.field_name)) ~ '^[a-z][a-z0-9_]*$'
ON CONFLICT (field_key) DO NOTHING;

INSERT INTO public.form_config_v2_forms (form_key, form_name, description, is_active)
VALUES ('join_lub', 'Join LUB Form', 'Join member registration form configuration in centralized builder', true)
ON CONFLICT (form_key)
DO UPDATE SET
  form_name = EXCLUDED.form_name,
  description = EXCLUDED.description,
  is_active = true,
  updated_at = now();

WITH join_form AS (
  SELECT id
  FROM public.form_config_v2_forms
  WHERE form_key = 'join_lub'
  LIMIT 1
)
INSERT INTO public.form_config_v2_fields (
  form_id, field_key, label, field_type, section_name, placeholder, help_text, option_items,
  default_value, is_visible, is_required, is_locked, is_system_field, display_order,
  validation_rule_id, is_deleted, deleted_at
)
SELECT
  jf.id,
  lower(trim(ffc.field_name)) AS field_key,
  COALESCE(lib.label, ffc.field_label) AS label,
  COALESCE(lib.field_type, 'text') AS field_type,
  COALESCE(lib.section_name, COALESCE(NULLIF(trim(ffc.section_name), ''), 'General')) AS section_name,
  lib.placeholder,
  lib.help_text,
  lib.option_items,
  NULL,
  COALESCE(ffc.is_visible, true),
  CASE WHEN COALESCE(ffc.is_visible, true) THEN COALESCE(ffc.is_required, false) ELSE false END,
  COALESCE(lib.is_locked, COALESCE(ffc.is_system_field, false)),
  COALESCE(lib.is_system_field, COALESCE(ffc.is_system_field, false)),
  COALESCE(NULLIF(ffc.display_order, 0), 1),
  COALESCE(lib.validation_rule_id, ffc.validation_rule_id),
  false,
  NULL
FROM join_form jf
INNER JOIN public.form_field_configurations ffc ON true
LEFT JOIN public.form_field_library_v2 lib ON lib.field_key = lower(trim(ffc.field_name))
WHERE lower(trim(ffc.field_name)) ~ '^[a-z][a-z0-9_]*$'
ON CONFLICT (form_id, field_key) DO NOTHING;

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
  updated_at = now()
FROM public.form_field_library_v2 lib
WHERE f.field_key = lib.field_key
  AND f.is_deleted = false;

-- =============================================================================
-- SECTION 2: Read contracts
-- =============================================================================

CREATE OR REPLACE FUNCTION public.list_forms_builder_v2()
RETURNS TABLE (
  id uuid,
  form_key text,
  form_name text,
  description text,
  is_active boolean,
  field_count integer,
  updated_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    fm.id,
    fm.form_key,
    fm.form_name,
    fm.description,
    fm.is_active,
    COALESCE(fc.field_count, 0)::integer AS field_count,
    fm.updated_at
  FROM public.form_config_v2_forms fm
  LEFT JOIN (
    SELECT
      form_id,
      COUNT(*) AS field_count
    FROM public.form_config_v2_fields
    WHERE is_deleted = false
    GROUP BY form_id
  ) fc ON fc.form_id = fm.id
  ORDER BY fm.form_name, fm.form_key;
$$;

GRANT EXECUTE ON FUNCTION public.list_forms_builder_v2() TO PUBLIC;

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
  LEFT JOIN public.form_field_library_v2 lib
    ON lib.field_key = f.field_key
  WHERE fm.form_key = trim(COALESCE(p_form_key, ''))
  ORDER BY COALESCE(lib.section_name, f.section_name), f.display_order, f.field_key;
$$;

GRANT EXECUTE ON FUNCTION public.get_form_builder_schema_v2(text) TO PUBLIC;

-- =============================================================================
-- SECTION 3: Builder write contracts (_with_session)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_form_builder_v2_with_session(
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

  IF EXISTS (SELECT 1 FROM public.form_config_v2_forms f WHERE f.form_key = v_form_key) THEN
    RETURN jsonb_build_object('success', false, 'error', 'form_key already exists');
  END IF;

  INSERT INTO public.form_config_v2_forms (form_key, form_name, description, is_active)
  VALUES (v_form_key, v_form_name, NULLIF(trim(COALESCE(p_description, '')), ''), true)
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'id', v_row.id,
      'form_key', v_row.form_key,
      'form_name', v_row.form_name,
      'description', v_row.description,
      'is_active', v_row.is_active,
      'updated_at', v_row.updated_at
    )
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_form_builder_v2_with_session(text, text, text, text) TO PUBLIC;

CREATE OR REPLACE FUNCTION public.clone_form_builder_v2_with_session(
  p_session_token text,
  p_source_form_key text,
  p_target_form_key text,
  p_target_form_name text,
  p_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
  v_source_form_id uuid;
  v_target_form_row public.form_config_v2_forms%ROWTYPE;
  v_source_form_key text := lower(trim(COALESCE(p_source_form_key, '')));
  v_target_form_key text := lower(trim(COALESCE(p_target_form_key, '')));
  v_target_form_name text := trim(COALESCE(p_target_form_name, ''));
BEGIN
  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;
  IF NOT public.has_permission(v_actor_user_id, 'settings.forms.configure') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;
  IF v_source_form_key = '' OR v_target_form_key = '' OR v_target_form_name = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'source/target form fields are required');
  END IF;
  IF v_target_form_key !~ '^[a-z][a-z0-9_]*$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid target form_key format');
  END IF;

  SELECT id INTO v_source_form_id
  FROM public.form_config_v2_forms
  WHERE form_key = v_source_form_key
  LIMIT 1;
  IF v_source_form_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Source form not found');
  END IF;
  IF EXISTS (SELECT 1 FROM public.form_config_v2_forms WHERE form_key = v_target_form_key) THEN
    RETURN jsonb_build_object('success', false, 'error', 'target form_key already exists');
  END IF;

  INSERT INTO public.form_config_v2_forms (form_key, form_name, description, is_active)
  VALUES (v_target_form_key, v_target_form_name, NULLIF(trim(COALESCE(p_description, '')), ''), true)
  RETURNING * INTO v_target_form_row;

  INSERT INTO public.form_config_v2_fields (
    form_id, field_key, label, field_type, section_name, placeholder, help_text, option_items, default_value,
    is_visible, is_required, is_locked, is_system_field, display_order, validation_rule_id, is_deleted, deleted_at,
    created_by, updated_by
  )
  SELECT
    v_target_form_row.id, src.field_key, src.label, src.field_type, src.section_name, src.placeholder, src.help_text,
    src.option_items, src.default_value, src.is_visible, src.is_required, src.is_locked, src.is_system_field,
    src.display_order, src.validation_rule_id, false, NULL, v_actor_user_id, v_actor_user_id
  FROM public.form_config_v2_fields src
  WHERE src.form_id = v_source_form_id
    AND src.is_deleted = false;

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.clone_form_builder_v2_with_session(text, text, text, text, text) TO PUBLIC;

CREATE OR REPLACE FUNCTION public.archive_form_builder_v2_with_session(
  p_session_token text,
  p_form_key text,
  p_archive boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
  v_form_key text := lower(trim(COALESCE(p_form_key, '')));
BEGIN
  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;
  IF NOT public.has_permission(v_actor_user_id, 'settings.forms.configure') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  UPDATE public.form_config_v2_forms
  SET is_active = CASE WHEN COALESCE(p_archive, true) THEN false ELSE true END, updated_at = now()
  WHERE form_key = v_form_key;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Form not found');
  END IF;

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.archive_form_builder_v2_with_session(text, text, boolean) TO PUBLIC;

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
      form_id, field_key, label, field_type, section_name, placeholder, help_text, option_items, default_value,
      is_visible, is_required, is_locked, is_system_field, display_order, validation_rule_id, is_deleted, deleted_at,
      created_by, updated_by
    )
    VALUES (
      v_form_id, v_field_key, v_library_row.label, v_library_row.field_type, v_library_row.section_name,
      v_library_row.placeholder, v_library_row.help_text, v_library_row.option_items, NULL,
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

GRANT EXECUTE ON FUNCTION public.attach_field_to_form_v2_with_session(text, text, text, boolean, boolean, integer) TO PUBLIC;

CREATE OR REPLACE FUNCTION public.detach_field_from_form_v2_with_session(
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
  v_form_key text := lower(trim(COALESCE(p_form_key, '')));
  v_field_key text := lower(trim(COALESCE(p_field_key, '')));
  v_field_row public.form_config_v2_fields%ROWTYPE;
BEGIN
  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;
  IF NOT public.has_permission(v_actor_user_id, 'settings.forms.configure') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  SELECT id INTO v_form_id FROM public.form_config_v2_forms WHERE form_key = v_form_key LIMIT 1;
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
    RETURN jsonb_build_object('success', false, 'error', 'Protected fields cannot be detached');
  END IF;

  UPDATE public.form_config_v2_fields
  SET is_deleted = true, deleted_at = now(), updated_by = v_actor_user_id, updated_at = now()
  WHERE id = v_field_row.id;

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.detach_field_from_form_v2_with_session(text, text, text) TO PUBLIC;

CREATE OR REPLACE FUNCTION public.reorder_form_fields_v2_with_session(
  p_session_token text,
  p_form_key text,
  p_field_keys jsonb
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
BEGIN
  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;
  IF NOT public.has_permission(v_actor_user_id, 'settings.forms.configure') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;
  IF p_field_keys IS NULL OR jsonb_typeof(p_field_keys) <> 'array' THEN
    RETURN jsonb_build_object('success', false, 'error', 'field_keys must be an array');
  END IF;

  SELECT id INTO v_form_id FROM public.form_config_v2_forms WHERE form_key = v_form_key LIMIT 1;
  IF v_form_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Form not found');
  END IF;

  WITH ordered AS (
    SELECT lower(trim(value)) AS field_key, ordinality::integer AS ord
    FROM jsonb_array_elements_text(p_field_keys) WITH ORDINALITY
  )
  UPDATE public.form_config_v2_fields f
  SET display_order = o.ord, updated_by = v_actor_user_id, updated_at = now()
  FROM ordered o
  WHERE f.form_id = v_form_id
    AND f.field_key = o.field_key
    AND f.is_deleted = false;

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reorder_form_fields_v2_with_session(text, text, jsonb) TO PUBLIC;

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
      v_is_visible := true;
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

-- =============================================================================
-- SECTION 4: Field library contracts (_with_session)
-- =============================================================================

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
  ORDER BY lib.is_archived, lib.section_name, lib.label, lib.field_key;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_field_library_v2_with_session(text) TO PUBLIC;

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
  IF v_field_type = 'select' AND (p_option_items IS NULL OR jsonb_array_length(p_option_items) = 0) THEN
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
    p_is_system_field,
    p_is_locked
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_field_library_item_v2_with_session(text, text, text, text, text, text, text, jsonb, uuid, boolean, boolean) TO PUBLIC;

CREATE OR REPLACE FUNCTION public.archive_field_library_item_v2_with_session(
  p_session_token text,
  p_field_key text,
  p_archive boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
  v_field_key text := lower(trim(COALESCE(p_field_key, '')));
BEGIN
  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);
  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;
  IF NOT public.has_permission(v_actor_user_id, 'settings.forms.configure') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  UPDATE public.form_field_library_v2
  SET
    is_archived = COALESCE(p_archive, true),
    updated_by = v_actor_user_id,
    updated_at = now()
  WHERE field_key = v_field_key;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Field library item not found');
  END IF;

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.archive_field_library_item_v2_with_session(text, text, boolean) TO PUBLIC;
