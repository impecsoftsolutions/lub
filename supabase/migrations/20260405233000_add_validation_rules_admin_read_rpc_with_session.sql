/*
  # Validation Rules Admin Read RPC (_with_session)

  Fix
  - Admin Validation Settings currently reads `validation_rules` via direct table select.
  - RLS public read policy exposes only `is_active = true`, so deactivated rules disappear from admin page.

  Solution
  - Add session-token RPC that returns all validation rules for users with
    `settings.validation.view` or `settings.validation.manage`.
*/

CREATE OR REPLACE FUNCTION public.get_validation_rules_with_session(
  p_session_token text
)
RETURNS TABLE (
  id uuid,
  rule_name text,
  rule_type text,
  category text,
  validation_pattern text,
  error_message text,
  description text,
  is_active boolean,
  display_order integer,
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
    RETURN;
  END IF;

  IF NOT (
    public.has_permission(v_actor_user_id, 'settings.validation.view')
    OR public.has_permission(v_actor_user_id, 'settings.validation.manage')
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    vr.id,
    vr.rule_name,
    vr.rule_type,
    vr.category,
    vr.validation_pattern,
    vr.error_message,
    vr.description,
    vr.is_active,
    vr.display_order,
    vr.created_at,
    vr.updated_at
  FROM public.validation_rules vr
  ORDER BY vr.display_order, vr.rule_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_validation_rules_with_session(text) TO PUBLIC;
