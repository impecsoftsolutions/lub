/*
  # Form Builder Live Publish Workflow

  Adds a draft->live publish workflow so builder edits do not affect public runtime
  until explicitly published.
*/

-- =============================================================================
-- SECTION 1: Live snapshot schema
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.form_config_v2_live_fields (
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
  published_at timestamptz NOT NULL DEFAULT now(),
  published_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT form_config_v2_live_fields_form_field_key_unique UNIQUE (form_id, field_key),
  CONSTRAINT form_config_v2_live_fields_field_type_check CHECK (
    field_type IN ('text', 'textarea', 'select', 'checkbox', 'number', 'date', 'url', 'email', 'tel')
  ),
  CONSTRAINT form_config_v2_live_fields_field_key_check CHECK (
    field_key ~ '^[a-z][a-z0-9_]*$'
  ),
  CONSTRAINT form_config_v2_live_fields_option_items_array_check CHECK (
    option_items IS NULL OR jsonb_typeof(option_items) = 'array'
  ),
  CONSTRAINT form_config_v2_live_fields_required_implies_visible CHECK (
    (NOT is_required) OR is_visible
  )
);

CREATE INDEX IF NOT EXISTS idx_form_config_v2_live_fields_lookup
  ON public.form_config_v2_live_fields(form_id, section_name, display_order);

CREATE INDEX IF NOT EXISTS idx_form_config_v2_live_fields_validation_rule_id
  ON public.form_config_v2_live_fields(validation_rule_id)
  WHERE validation_rule_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_form_config_v2_live_fields_set_updated_at ON public.form_config_v2_live_fields;
CREATE TRIGGER trg_form_config_v2_live_fields_set_updated_at
  BEFORE UPDATE ON public.form_config_v2_live_fields
  FOR EACH ROW
  EXECUTE FUNCTION public.form_config_v2_set_updated_at();

ALTER TABLE public.form_config_v2_live_fields ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read form_config_v2_live_fields" ON public.form_config_v2_live_fields;
CREATE POLICY "Allow public read form_config_v2_live_fields"
  ON public.form_config_v2_live_fields
  FOR SELECT
  TO anon, authenticated
  USING (true);

ALTER TABLE public.form_config_v2_forms
  ADD COLUMN IF NOT EXISTS live_published_at timestamptz,
  ADD COLUMN IF NOT EXISTS live_published_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

-- =============================================================================
-- SECTION 2: Runtime read path (prefer live snapshot)
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
  INNER JOIN public.form_config_v2_live_fields lf ON lf.form_id = sf.id
  WHERE EXISTS (
    SELECT 1
    FROM public.form_config_v2_live_fields lx
    WHERE lx.form_id = sf.id
  )

  UNION ALL

  SELECT
    f.id,
    sf.form_key,
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
  FROM signup_form sf
  INNER JOIN public.form_config_v2_fields f ON f.form_id = sf.id
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.form_config_v2_live_fields lx
    WHERE lx.form_id = sf.id
  )
    AND f.is_deleted = false

  ORDER BY section_name, display_order, field_key;
$$;

GRANT EXECUTE ON FUNCTION public.get_signup_form_configuration_v2() TO PUBLIC;

-- =============================================================================
-- SECTION 3: Publish RPC (_with_session)
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
