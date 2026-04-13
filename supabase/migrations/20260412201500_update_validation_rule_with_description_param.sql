-- Add description persistence support to validation rule updates

BEGIN;

DROP FUNCTION IF EXISTS public.update_validation_rule_with_session(text, uuid, text, text);

CREATE OR REPLACE FUNCTION public.update_validation_rule_with_session(
  p_session_token text,
  p_rule_id uuid,
  p_validation_pattern text,
  p_error_message text,
  p_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
BEGIN
  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);

  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT public.has_permission(v_actor_user_id, 'settings.validation.manage') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  UPDATE validation_rules
  SET
    validation_pattern = COALESCE(p_validation_pattern, validation_pattern),
    error_message = COALESCE(p_error_message, error_message),
    description = COALESCE(p_description, description),
    updated_at = now()
  WHERE id = p_rule_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Validation rule not found');
  END IF;

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_validation_rule_with_session(text, uuid, text, text, text) TO PUBLIC;

COMMIT;

