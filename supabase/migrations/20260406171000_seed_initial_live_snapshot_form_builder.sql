/*
  # Seed initial live snapshots for draft->live workflow

  Ensures runtime reads a stable live snapshot immediately after enabling
  publish workflow, rather than falling back to draft until first publish.
*/

WITH forms_without_live AS (
  SELECT fm.id
  FROM public.form_config_v2_forms fm
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.form_config_v2_live_fields lf
    WHERE lf.form_id = fm.id
  )
),
inserted AS (
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
    NULL
  FROM public.form_config_v2_fields f
  INNER JOIN forms_without_live fl ON fl.id = f.form_id
  WHERE f.is_deleted = false
  RETURNING form_id
)
UPDATE public.form_config_v2_forms fm
SET live_published_at = COALESCE(fm.live_published_at, now())
WHERE fm.id IN (
  SELECT DISTINCT i.form_id
  FROM inserted i
);
