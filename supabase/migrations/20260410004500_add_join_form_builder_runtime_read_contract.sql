/*
  # Join form runtime read contract (Builder live snapshot)

  Adds a public runtime read RPC for the Join form so `/join` can read
  only published live configuration from Form Builder (`join_lub`).
*/

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
  ORDER BY lf.section_name, lf.display_order, lf.field_key;
$$;

GRANT EXECUTE ON FUNCTION public.get_join_form_configuration_v2() TO PUBLIC;

/*
  Builder live validation mapping resolver for form runtime.
  Used by Join client validation flow to fetch active rule details
  from published live snapshot.
*/

CREATE OR REPLACE FUNCTION public.get_form_field_validation_rule_v2(
  p_form_key text,
  p_field_key text
)
RETURNS TABLE (
  validation_rule_id uuid,
  validation_pattern text,
  error_message text,
  rule_name text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    lf.validation_rule_id,
    vr.validation_pattern,
    vr.error_message,
    vr.rule_name
  FROM public.form_config_v2_forms fm
  INNER JOIN public.form_config_v2_live_fields lf
    ON lf.form_id = fm.id
  LEFT JOIN public.validation_rules vr
    ON vr.id = lf.validation_rule_id
   AND vr.is_active = true
  WHERE fm.form_key = trim(COALESCE(p_form_key, ''))
    AND fm.is_active = true
    AND lf.field_key = trim(COALESCE(p_field_key, ''))
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_form_field_validation_rule_v2(text, text) TO PUBLIC;
