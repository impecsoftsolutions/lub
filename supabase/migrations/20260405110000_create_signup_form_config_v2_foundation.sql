/*
  # Signup Form Configuration V2 Foundation (Hybrid)

  1. Creates reusable V2 form/config/submission tables
  2. Seeds Signup form with protected core fields (email/mobile/state)
  3. Adds secure RPCs for read/write/create/delete on signup V2 config
  4. Adds create_portal_user_with_session_v2 for signup-v2 runtime + custom field persistence
*/

-- =============================================================================
-- SECTION 1: Tables
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.form_config_v2_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_key text UNIQUE NOT NULL,
  form_name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.form_config_v2_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.form_config_v2_forms(id) ON DELETE CASCADE,
  field_key text NOT NULL,
  label text NOT NULL,
  field_type text NOT NULL,
  section_name text NOT NULL DEFAULT 'General',
  placeholder text,
  help_text text,
  option_items jsonb,
  default_value text,
  is_visible boolean NOT NULL DEFAULT true,
  is_required boolean NOT NULL DEFAULT false,
  is_locked boolean NOT NULL DEFAULT false,
  is_system_field boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 1,
  validation_rule_id uuid REFERENCES public.validation_rules(id) ON DELETE SET NULL,
  is_deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT form_config_v2_fields_field_type_check CHECK (
    field_type IN ('text', 'textarea', 'select', 'checkbox', 'number', 'date', 'url', 'email', 'tel')
  ),
  CONSTRAINT form_config_v2_fields_field_key_check CHECK (
    field_key ~ '^[a-z][a-z0-9_]*$'
  ),
  CONSTRAINT form_config_v2_fields_option_items_array_check CHECK (
    option_items IS NULL OR jsonb_typeof(option_items) = 'array'
  ),
  CONSTRAINT form_config_v2_fields_required_implies_visible CHECK (
    (NOT is_required) OR is_visible
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_form_config_v2_fields_form_field_key
  ON public.form_config_v2_fields(form_id, field_key);

CREATE INDEX IF NOT EXISTS idx_form_config_v2_fields_lookup
  ON public.form_config_v2_fields(form_id, is_deleted, section_name, display_order);

CREATE INDEX IF NOT EXISTS idx_form_config_v2_fields_validation_rule_id
  ON public.form_config_v2_fields(validation_rule_id)
  WHERE validation_rule_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.form_config_v2_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_key text NOT NULL REFERENCES public.form_config_v2_forms(form_key) ON DELETE RESTRICT,
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'signup_v2',
  core_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  custom_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT form_config_v2_submissions_core_payload_object CHECK (jsonb_typeof(core_payload) = 'object'),
  CONSTRAINT form_config_v2_submissions_custom_payload_object CHECK (jsonb_typeof(custom_payload) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_form_config_v2_submissions_form_created
  ON public.form_config_v2_submissions(form_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_form_config_v2_submissions_user
  ON public.form_config_v2_submissions(user_id)
  WHERE user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.form_config_v2_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_form_config_v2_forms_set_updated_at ON public.form_config_v2_forms;
CREATE TRIGGER trg_form_config_v2_forms_set_updated_at
  BEFORE UPDATE ON public.form_config_v2_forms
  FOR EACH ROW
  EXECUTE FUNCTION public.form_config_v2_set_updated_at();

DROP TRIGGER IF EXISTS trg_form_config_v2_fields_set_updated_at ON public.form_config_v2_fields;
CREATE TRIGGER trg_form_config_v2_fields_set_updated_at
  BEFORE UPDATE ON public.form_config_v2_fields
  FOR EACH ROW
  EXECUTE FUNCTION public.form_config_v2_set_updated_at();

-- =============================================================================
-- SECTION 2: Policies / Seed
-- =============================================================================

ALTER TABLE public.form_config_v2_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_config_v2_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_config_v2_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read form_config_v2_forms" ON public.form_config_v2_forms;
CREATE POLICY "Allow public read form_config_v2_forms"
  ON public.form_config_v2_forms
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Allow public read form_config_v2_fields" ON public.form_config_v2_fields;
CREATE POLICY "Allow public read form_config_v2_fields"
  ON public.form_config_v2_fields
  FOR SELECT
  TO anon, authenticated
  USING (NOT is_deleted);

-- No direct browser writes/reads for submissions; inserts happen via SECURITY DEFINER RPCs.

INSERT INTO public.form_config_v2_forms (form_key, form_name, description, is_active)
VALUES ('signup', 'Signup Form', 'Dynamic signup form configuration (V2)', true)
ON CONFLICT (form_key)
DO UPDATE SET
  form_name = EXCLUDED.form_name,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active,
  updated_at = now();

WITH signup_form AS (
  SELECT id
  FROM public.form_config_v2_forms
  WHERE form_key = 'signup'
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
  signup_form.id,
  v.field_key,
  v.label,
  v.field_type,
  'Core Details',
  v.placeholder,
  v.help_text,
  NULL,
  NULL,
  true,
  true,
  v.is_locked,
  true,
  v.display_order,
  v.validation_rule_id,
  false,
  NULL
FROM signup_form
CROSS JOIN (
  VALUES
    ('email', 'Email Address', 'email', 'your.email@example.com', 'Used for login and account identification', 1, true, (SELECT id FROM public.validation_rules WHERE rule_name = 'email_format' LIMIT 1)),
    ('mobile_number', 'Mobile Number', 'tel', '10-digit mobile number', 'Used for login verification', 2, true, (SELECT id FROM public.validation_rules WHERE rule_name = 'mobile_number' LIMIT 1)),
    ('state', 'State', 'select', 'Select State', 'Used for payment settings and profile prefill', 3, false, NULL)
) AS v(field_key, label, field_type, placeholder, help_text, display_order, is_locked, validation_rule_id)
ON CONFLICT (form_id, field_key)
DO UPDATE SET
  label = EXCLUDED.label,
  field_type = EXCLUDED.field_type,
  section_name = EXCLUDED.section_name,
  placeholder = EXCLUDED.placeholder,
  help_text = EXCLUDED.help_text,
  display_order = EXCLUDED.display_order,
  validation_rule_id = EXCLUDED.validation_rule_id,
  is_visible = true,
  is_required = true,
  is_locked = EXCLUDED.is_locked,
  is_system_field = true,
  is_deleted = false,
  deleted_at = NULL,
  updated_at = now();

-- =============================================================================
-- SECTION 3: Read RPC
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
$$;

GRANT EXECUTE ON FUNCTION public.get_signup_form_configuration_v2() TO PUBLIC;

-- =============================================================================
-- SECTION 4: Admin Write RPCs (_with_session)
-- =============================================================================

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

CREATE OR REPLACE FUNCTION public.create_signup_custom_field_v2_with_session(
  p_session_token text,
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
  v_field_key text := lower(trim(COALESCE(p_field_key, '')));
  v_field_type text := lower(trim(COALESCE(p_field_type, '')));
  v_section_name text := COALESCE(NULLIF(trim(p_section_name), ''), 'Custom Fields');
  v_is_visible boolean := COALESCE(p_is_visible, true);
  v_is_required boolean := COALESCE(p_is_required, false);
  v_display_order integer;
  v_existing public.form_config_v2_fields%ROWTYPE;
  v_row public.form_config_v2_fields%ROWTYPE;
  v_existing_found boolean := false;
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

  IF v_field_key IN ('email', 'mobile_number', 'state') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Core fields cannot be created as custom fields');
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
    SELECT 1 FROM public.validation_rules vr
    WHERE vr.id = p_validation_rule_id
      AND vr.is_active = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Validation rule is missing or inactive');
  END IF;

  IF v_is_required THEN
    v_is_visible := true;
  END IF;

  SELECT id INTO v_form_id
  FROM public.form_config_v2_forms
  WHERE form_key = 'signup'
  LIMIT 1;

  IF v_form_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Signup form configuration not initialized');
  END IF;

  SELECT * INTO v_existing
  FROM public.form_config_v2_fields
  WHERE form_id = v_form_id
    AND field_key = v_field_key
  LIMIT 1;

  v_existing_found := FOUND;

  IF v_existing_found AND v_existing.is_deleted = false THEN
    RETURN jsonb_build_object('success', false, 'error', 'field_key already exists');
  END IF;

  IF p_display_order IS NULL THEN
    SELECT COALESCE(MAX(display_order), 0) + 1
    INTO v_display_order
    FROM public.form_config_v2_fields
    WHERE form_id = v_form_id
      AND is_deleted = false
      AND section_name = v_section_name;
  ELSE
    v_display_order := p_display_order;
  END IF;

  IF v_existing_found THEN
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
    WHERE id = v_existing.id
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
      'form_key', 'signup',
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

GRANT EXECUTE ON FUNCTION public.create_signup_custom_field_v2_with_session(text, text, text, text, text, text, text, jsonb, text, boolean, boolean, integer, uuid) TO PUBLIC;

CREATE OR REPLACE FUNCTION public.delete_signup_custom_field_v2_with_session(
  p_session_token text,
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
  v_field_row public.form_config_v2_fields%ROWTYPE;
BEGIN
  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);

  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT public.has_permission(v_actor_user_id, 'settings.forms.configure') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  IF v_field_key = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'field_key is required');
  END IF;

  SELECT id INTO v_form_id
  FROM public.form_config_v2_forms
  WHERE form_key = 'signup'
  LIMIT 1;

  IF v_form_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Signup form configuration not initialized');
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

GRANT EXECUTE ON FUNCTION public.delete_signup_custom_field_v2_with_session(text, text) TO PUBLIC;

-- =============================================================================
-- SECTION 5: Signup-v2 auth/session RPC with dynamic payload persistence
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_portal_user_with_session_v2(
  p_email text,
  p_mobile_number text,
  p_state text DEFAULT NULL,
  p_dynamic_payload jsonb DEFAULT NULL,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_email text := lower(trim(COALESCE(p_email, '')));
  v_mobile text := regexp_replace(COALESCE(trim(p_mobile_number), ''), '[^0-9]', '', 'g');
  v_state text := trim(COALESCE(p_state, ''));
  v_user public.users%ROWTYPE;
  v_session_token text;
  v_expires_at timestamptz := now() + interval '7 days';
  v_state_required boolean := true;
  v_state_visible boolean := true;
  v_signup_form_id uuid;
  v_sanitized_payload jsonb := '{}'::jsonb;
  v_payload_item record;
  v_required_field record;
  v_rule_field record;
  v_custom_value jsonb;
  v_custom_text text;
  v_rule_pattern text;
  v_rule_error text;
BEGIN
  IF v_mobile ~ '^0[0-9]{10}$' THEN
    v_mobile := substring(v_mobile FROM 2);
  END IF;

  IF v_email = '' OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Please enter a valid email address.');
  END IF;

  IF v_mobile = '' OR v_mobile !~ '^[1-9][0-9]{9}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Mobile number must be exactly 10 digits.');
  END IF;

  SELECT id INTO v_signup_form_id
  FROM public.form_config_v2_forms
  WHERE form_key = 'signup'
  LIMIT 1;

  IF v_signup_form_id IS NOT NULL THEN
    SELECT
      COALESCE(f.is_visible, true),
      COALESCE(f.is_required, true)
    INTO
      v_state_visible,
      v_state_required
    FROM public.form_config_v2_fields f
    WHERE f.form_id = v_signup_form_id
      AND f.field_key = 'state'
      AND f.is_deleted = false
    LIMIT 1;
  END IF;

  IF NOT v_state_visible THEN
    v_state_required := false;
    v_state := '';
  END IF;

  IF v_state_required AND v_state = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Please select a state.');
  END IF;

  IF v_state <> '' AND NOT EXISTS (
    SELECT 1
    FROM public.v_active_payment_settings vaps
    WHERE vaps.state = v_state
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Please select a valid state.');
  END IF;

  IF jsonb_typeof(COALESCE(p_dynamic_payload, '{}'::jsonb)) <> 'object' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid dynamic payload.');
  END IF;

  IF v_signup_form_id IS NOT NULL THEN
    FOR v_payload_item IN
      SELECT key, value
      FROM jsonb_each(COALESCE(p_dynamic_payload, '{}'::jsonb))
    LOOP
      IF EXISTS (
        SELECT 1
        FROM public.form_config_v2_fields f
        WHERE f.form_id = v_signup_form_id
          AND f.field_key = v_payload_item.key
          AND f.is_deleted = false
          AND f.is_system_field = false
          AND f.is_visible = true
      ) THEN
        v_sanitized_payload := v_sanitized_payload || jsonb_build_object(v_payload_item.key, v_payload_item.value);
      END IF;
    END LOOP;

    FOR v_required_field IN
      SELECT
        f.field_key,
        f.label,
        f.field_type
      FROM public.form_config_v2_fields f
      WHERE f.form_id = v_signup_form_id
        AND f.is_deleted = false
        AND f.is_system_field = false
        AND f.is_visible = true
        AND f.is_required = true
    LOOP
      v_custom_value := v_sanitized_payload -> v_required_field.field_key;

      IF v_required_field.field_type = 'checkbox' THEN
        IF v_custom_value IS NULL THEN
          RETURN jsonb_build_object('success', false, 'error', format('%s is required.', v_required_field.label));
        END IF;
      ELSE
        v_custom_text := trim(COALESCE(v_custom_value #>> '{}', ''));
        IF v_custom_value IS NULL OR v_custom_text = '' THEN
          RETURN jsonb_build_object('success', false, 'error', format('%s is required.', v_required_field.label));
        END IF;
      END IF;
    END LOOP;

    FOR v_rule_field IN
      SELECT
        f.field_key,
        f.label,
        f.validation_rule_id
      FROM public.form_config_v2_fields f
      WHERE f.form_id = v_signup_form_id
        AND f.is_deleted = false
        AND f.is_system_field = false
        AND f.is_visible = true
        AND f.validation_rule_id IS NOT NULL
    LOOP
      v_custom_value := v_sanitized_payload -> v_rule_field.field_key;

      IF v_custom_value IS NULL THEN
        CONTINUE;
      END IF;

      v_custom_text := trim(COALESCE(v_custom_value #>> '{}', ''));
      IF v_custom_text = '' THEN
        CONTINUE;
      END IF;

      SELECT vr.validation_pattern, vr.error_message
      INTO v_rule_pattern, v_rule_error
      FROM public.validation_rules vr
      WHERE vr.id = v_rule_field.validation_rule_id
        AND vr.is_active = true
      LIMIT 1;

      IF v_rule_pattern IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', format('Validation rule missing for %s.', v_rule_field.label));
      END IF;

      IF v_custom_text !~ v_rule_pattern THEN
        RETURN jsonb_build_object('success', false, 'error', COALESCE(v_rule_error, format('%s is invalid.', v_rule_field.label)));
      END IF;
    END LOOP;
  END IF;

  INSERT INTO public.users (
    email,
    mobile_number,
    state,
    account_type,
    account_status,
    created_at,
    updated_at
  )
  VALUES (
    v_email,
    v_mobile,
    NULLIF(v_state, ''),
    'general_user',
    'active',
    now(),
    now()
  )
  RETURNING *
  INTO v_user;

  SELECT public.generate_session_token()
  INTO v_session_token;

  IF v_session_token IS NULL OR v_session_token = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Failed to create account session.');
  END IF;

  INSERT INTO public.auth_sessions (
    user_id,
    session_token,
    ip_address,
    user_agent,
    expires_at,
    last_activity_at
  )
  VALUES (
    v_user.id,
    v_session_token,
    p_ip_address,
    p_user_agent,
    v_expires_at,
    now()
  );

  INSERT INTO public.form_config_v2_submissions (
    form_key,
    user_id,
    source,
    core_payload,
    custom_payload
  )
  VALUES (
    'signup',
    v_user.id,
    'signup_v2',
    jsonb_build_object(
      'email', v_email,
      'mobile_number', v_mobile,
      'state', NULLIF(v_state, '')
    ),
    v_sanitized_payload
  );

  RETURN jsonb_build_object(
    'success', true,
    'sessionToken', v_session_token,
    'expiresAt', v_expires_at,
    'user', jsonb_build_object(
      'id', v_user.id,
      'email', v_user.email,
      'mobile_number', v_user.mobile_number,
      'state', v_user.state,
      'account_type', v_user.account_type,
      'account_status', v_user.account_status,
      'email_verified', v_user.email_verified,
      'mobile_verified', v_user.mobile_verified,
      'is_active', v_user.is_active,
      'last_login_at', v_user.last_login_at,
      'failed_login_attempts', COALESCE(v_user.failed_login_attempts, 0),
      'locked_until', v_user.locked_until,
      'created_at', v_user.created_at,
      'updated_at', v_user.updated_at
    )
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',
      CASE
        WHEN lower(SQLERRM) LIKE '%email%' THEN 'This email address is already registered. You can either sign in to your account or register with a different email address.'
        WHEN lower(SQLERRM) LIKE '%mobile%' THEN 'This mobile number is already registered. You can either sign in to your account or register with a different mobile number.'
        ELSE 'This email address or mobile number is already registered.'
      END
    );
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_portal_user_with_session_v2(text, text, text, jsonb, text, text) TO PUBLIC;
