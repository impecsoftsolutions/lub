/*
  COD-AUTH-FORM-BUILDER-PASSWORD-001

  Move signup/sign-in password UI back into Form Builder V2 by adding a
  first-class password field type and seeding locked auth fields. Passwords
  still stay outside normal dynamic form payload storage and are processed only
  through the password-auth RPC parameters.
*/

BEGIN;

-- Allow password only as a field type in the form-builder storage layer.
-- The public field-library create RPC still controls whether admins can create
-- arbitrary custom password fields.
ALTER TABLE public.form_field_library_v2
  DROP CONSTRAINT IF EXISTS form_field_library_v2_field_type_check;

ALTER TABLE public.form_field_library_v2
  ADD CONSTRAINT form_field_library_v2_field_type_check CHECK (
    field_type IN ('text', 'textarea', 'select', 'checkbox', 'number', 'date', 'url', 'email', 'tel', 'password')
  );

ALTER TABLE public.form_config_v2_fields
  DROP CONSTRAINT IF EXISTS form_config_v2_fields_field_type_check;

ALTER TABLE public.form_config_v2_fields
  ADD CONSTRAINT form_config_v2_fields_field_type_check CHECK (
    field_type IN ('text', 'textarea', 'select', 'checkbox', 'number', 'date', 'url', 'email', 'tel', 'password')
  );

ALTER TABLE public.form_config_v2_live_fields
  DROP CONSTRAINT IF EXISTS form_config_v2_live_fields_field_type_check;

ALTER TABLE public.form_config_v2_live_fields
  ADD CONSTRAINT form_config_v2_live_fields_field_type_check CHECK (
    field_type IN ('text', 'textarea', 'select', 'checkbox', 'number', 'date', 'url', 'email', 'tel', 'password')
  );

-- Locked auth field library entries.
INSERT INTO public.form_field_library_v2 (
  field_key,
  label,
  field_type,
  section_name,
  placeholder,
  help_text,
  option_items,
  min_length,
  max_length,
  validation_rule_id,
  is_locked,
  is_system_field,
  is_archived,
  created_at,
  updated_at
)
VALUES
  (
    'identifier',
    'Email or Mobile Number',
    'text',
    'Core Details',
    'Email address or 10-digit mobile number',
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    true,
    true,
    false,
    now(),
    now()
  ),
  (
    'password',
    'Password',
    'password',
    'Core Details',
    'Minimum 6 characters',
    NULL,
    NULL,
    6,
    NULL,
    NULL,
    true,
    true,
    false,
    now(),
    now()
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
  is_locked = true,
  is_system_field = true,
  is_archived = false,
  updated_at = now();

INSERT INTO public.form_config_v2_forms (form_key, form_name, description, is_active)
VALUES
  ('signup', 'Signup Form', 'Dynamic signup form configuration (V2)', true),
  ('signin', 'Sign In Form', 'Portal sign-in form configuration', true)
ON CONFLICT (form_key)
DO UPDATE SET
  form_name = EXCLUDED.form_name,
  description = EXCLUDED.description,
  is_active = true,
  updated_at = now();

-- Signup password field in draft config.
WITH signup_form AS (
  SELECT id
  FROM public.form_config_v2_forms
  WHERE form_key = 'signup'
  LIMIT 1
),
signup_order AS (
  SELECT COALESCE(
    (SELECT display_order + 1 FROM public.form_config_v2_fields f, signup_form sf WHERE f.form_id = sf.id AND f.field_key = 'gender' AND f.is_deleted = false LIMIT 1),
    (SELECT COALESCE(MAX(display_order), 0) + 1 FROM public.form_config_v2_fields f, signup_form sf WHERE f.form_id = sf.id),
    4
  ) AS display_order
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
  min_length,
  max_length,
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
  'password',
  'Password',
  'password',
  'Core Details',
  'Minimum 6 characters',
  NULL,
  NULL,
  6,
  NULL,
  NULL,
  true,
  true,
  true,
  true,
  so.display_order,
  NULL,
  false,
  NULL
FROM signup_form sf
CROSS JOIN signup_order so
ON CONFLICT (form_id, field_key)
DO UPDATE SET
  label = EXCLUDED.label,
  field_type = EXCLUDED.field_type,
  section_name = EXCLUDED.section_name,
  placeholder = EXCLUDED.placeholder,
  help_text = EXCLUDED.help_text,
  option_items = EXCLUDED.option_items,
  min_length = EXCLUDED.min_length,
  max_length = EXCLUDED.max_length,
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

-- Sign-in uses a single identifier field plus password. Retire the old
-- email/mobile fields from only the sign-in form.
WITH signin_form AS (
  SELECT id
  FROM public.form_config_v2_forms
  WHERE form_key = 'signin'
  LIMIT 1
)
UPDATE public.form_config_v2_fields f
SET
  is_deleted = true,
  deleted_at = COALESCE(deleted_at, now()),
  is_visible = false,
  is_required = false,
  updated_at = now()
FROM signin_form sf
WHERE f.form_id = sf.id
  AND f.field_key IN ('email', 'mobile_number');

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
  min_length,
  max_length,
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
  v.min_length,
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
    ('identifier'::text, 'Email or Mobile Number'::text, 'text'::text, 'Email address or 10-digit mobile number'::text, NULL::integer, 1::integer),
    ('password'::text, 'Password'::text, 'password'::text, 'Enter your password'::text, 6::integer, 2::integer)
) AS v(field_key, label, field_type, placeholder, min_length, display_order)
ON CONFLICT (form_id, field_key)
DO UPDATE SET
  label = EXCLUDED.label,
  field_type = EXCLUDED.field_type,
  section_name = EXCLUDED.section_name,
  placeholder = EXCLUDED.placeholder,
  help_text = EXCLUDED.help_text,
  option_items = EXCLUDED.option_items,
  min_length = EXCLUDED.min_length,
  max_length = EXCLUDED.max_length,
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

-- Keep live snapshots aligned immediately so public auth forms work after the
-- migration without a manual publish step.
SELECT set_config('lub.form_builder_live_write_context', 'publish_rpc', true);

WITH signup_form AS (
  SELECT id
  FROM public.form_config_v2_forms
  WHERE form_key = 'signup'
  LIMIT 1
)
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
  NULL
FROM public.form_config_v2_fields f
JOIN signup_form sf ON sf.id = f.form_id
WHERE f.field_key = 'password'
  AND f.is_deleted = false
ON CONFLICT (form_id, field_key)
DO UPDATE SET
  label = EXCLUDED.label,
  field_type = EXCLUDED.field_type,
  section_name = EXCLUDED.section_name,
  placeholder = EXCLUDED.placeholder,
  help_text = EXCLUDED.help_text,
  option_items = EXCLUDED.option_items,
  min_length = EXCLUDED.min_length,
  max_length = EXCLUDED.max_length,
  default_value = EXCLUDED.default_value,
  is_visible = EXCLUDED.is_visible,
  is_required = EXCLUDED.is_required,
  is_locked = EXCLUDED.is_locked,
  is_system_field = EXCLUDED.is_system_field,
  display_order = EXCLUDED.display_order,
  validation_rule_id = EXCLUDED.validation_rule_id,
  published_at = now();

WITH signin_form AS (
  SELECT id
  FROM public.form_config_v2_forms
  WHERE form_key = 'signin'
  LIMIT 1
)
DELETE FROM public.form_config_v2_live_fields lf
USING signin_form sf
WHERE lf.form_id = sf.id
  AND lf.field_key IN ('email', 'mobile_number');

WITH signin_form AS (
  SELECT id
  FROM public.form_config_v2_forms
  WHERE form_key = 'signin'
  LIMIT 1
)
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
  NULL
FROM public.form_config_v2_fields f
JOIN signin_form sf ON sf.id = f.form_id
WHERE f.field_key IN ('identifier', 'password')
  AND f.is_deleted = false
ON CONFLICT (form_id, field_key)
DO UPDATE SET
  label = EXCLUDED.label,
  field_type = EXCLUDED.field_type,
  section_name = EXCLUDED.section_name,
  placeholder = EXCLUDED.placeholder,
  help_text = EXCLUDED.help_text,
  option_items = EXCLUDED.option_items,
  min_length = EXCLUDED.min_length,
  max_length = EXCLUDED.max_length,
  default_value = EXCLUDED.default_value,
  is_visible = EXCLUDED.is_visible,
  is_required = EXCLUDED.is_required,
  is_locked = EXCLUDED.is_locked,
  is_system_field = EXCLUDED.is_system_field,
  display_order = EXCLUDED.display_order,
  validation_rule_id = EXCLUDED.validation_rule_id,
  published_at = now();

-- Update publish guard to match the current auth model.
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
      SELECT 1 FROM public.form_config_v2_fields f
      WHERE f.form_id = v_form_id
        AND f.field_key = 'email'
        AND f.is_deleted = false
        AND f.is_visible = true
        AND f.is_required = true
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Signup email must remain visible and required before publish');
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.form_config_v2_fields f
      WHERE f.form_id = v_form_id
        AND f.field_key = 'mobile_number'
        AND f.is_deleted = false
        AND f.is_visible = true
        AND f.is_required = true
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Signup mobile number must remain visible and required before publish');
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.form_config_v2_fields f
      WHERE f.form_id = v_form_id
        AND f.field_key = 'password'
        AND f.field_type = 'password'
        AND f.is_deleted = false
        AND f.is_visible = true
        AND f.is_required = true
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Signup password must remain visible and required before publish');
    END IF;
  ELSIF v_form_key = 'signin' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.form_config_v2_fields f
      WHERE f.form_id = v_form_id
        AND f.field_key = 'identifier'
        AND f.is_deleted = false
        AND f.is_visible = true
        AND f.is_required = true
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Sign-in identifier must remain visible and required before publish');
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.form_config_v2_fields f
      WHERE f.form_id = v_form_id
        AND f.field_key = 'password'
        AND f.field_type = 'password'
        AND f.is_deleted = false
        AND f.is_visible = true
        AND f.is_required = true
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Sign-in password must remain visible and required before publish');
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

NOTIFY pgrst, 'reload schema';

COMMIT;
