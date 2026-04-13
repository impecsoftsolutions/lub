/*
  # Member Edit Form Builder runtime contracts

  1) Seed `member_edit` form in builder domain using `join_lub` draft fields as baseline.
  2) Add authenticated live runtime read RPC for member profile edit flow.
  3) Add admin session-gated draft read RPC for Studio preview.
*/

-- =============================================================================
-- SECTION 1: Seed member_edit form from join_lub baseline
-- =============================================================================

INSERT INTO public.form_config_v2_forms (
  form_key,
  form_name,
  description,
  is_active
)
VALUES (
  'member_edit',
  'Member Edit Form',
  'Member profile edit form configuration',
  true
)
ON CONFLICT (form_key)
DO UPDATE SET
  form_name = EXCLUDED.form_name,
  description = EXCLUDED.description,
  is_active = true,
  updated_at = now();

WITH source_form AS (
  SELECT id
  FROM public.form_config_v2_forms
  WHERE form_key = 'join_lub'
  LIMIT 1
),
target_form AS (
  SELECT id
  FROM public.form_config_v2_forms
  WHERE form_key = 'member_edit'
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
  tf.id,
  sf.field_key,
  sf.label,
  sf.field_type,
  sf.section_name,
  sf.placeholder,
  sf.help_text,
  sf.option_items,
  sf.default_value,
  sf.is_visible,
  sf.is_required,
  sf.is_locked,
  sf.is_system_field,
  sf.display_order,
  sf.validation_rule_id,
  false,
  NULL
FROM source_form s
INNER JOIN public.form_config_v2_fields sf
  ON sf.form_id = s.id
CROSS JOIN target_form tf
WHERE sf.is_deleted = false
ON CONFLICT (form_id, field_key)
DO NOTHING;

-- =============================================================================
-- SECTION 2: Member-authenticated live runtime read contract
-- =============================================================================

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
    lf.default_value,
    lf.is_visible,
    lf.is_required,
    lf.is_locked,
    lf.is_system_field,
    lf.display_order,
    lf.validation_rule_id
  FROM public.form_config_v2_live_fields lf
  WHERE lf.form_id = v_form_id
  ORDER BY lf.section_name, lf.display_order, lf.field_key;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_member_edit_form_configuration_v2_with_session(text) TO PUBLIC;

-- =============================================================================
-- SECTION 3: Admin draft read contract for studio preview
-- =============================================================================

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
  WHERE fm.form_key = 'member_edit'
    AND fm.is_active = true
    AND f.is_deleted = false
  ORDER BY f.section_name, f.display_order, f.field_key;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_member_edit_form_configuration_v2_draft_with_session(text) TO PUBLIC;
