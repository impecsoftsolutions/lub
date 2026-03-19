/*
  # Add session-token wrappers for validation/form display-order mutations

  1. Purpose
    - Remove remaining direct privileged updates for validation and form display ordering
    - Enforce session-token actor derivation + permission checks server-side
*/

CREATE OR REPLACE FUNCTION public.update_validation_rule_display_order_with_session(
  p_session_token text,
  p_rule_id uuid,
  p_display_order integer
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

  UPDATE public.validation_rules
  SET
    display_order = COALESCE(p_display_order, display_order),
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

GRANT EXECUTE ON FUNCTION public.update_validation_rule_display_order_with_session(text, uuid, integer) TO PUBLIC;

CREATE OR REPLACE FUNCTION public.update_form_field_display_orders_with_session(
  p_session_token text,
  p_updates jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
  v_item jsonb;
  v_field_name text;
  v_display_order integer;
  v_updated_count integer := 0;
BEGIN
  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);

  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT public.has_permission(v_actor_user_id, 'settings.forms.configure') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  IF p_updates IS NULL OR jsonb_typeof(p_updates) <> 'array' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Updates array is required');
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_updates)
  LOOP
    v_field_name := NULLIF(trim(v_item->>'field_name'), '');
    v_display_order := NULLIF(v_item->>'display_order', '')::integer;

    IF v_field_name IS NULL OR v_display_order IS NULL THEN
      CONTINUE;
    END IF;

    UPDATE public.form_field_configurations
    SET
      display_order = v_display_order,
      updated_by = v_actor_user_id,
      updated_at = now()
    WHERE field_name = v_field_name;

    IF FOUND THEN
      v_updated_count := v_updated_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'updated_count', v_updated_count);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_form_field_display_orders_with_session(text, jsonb) TO PUBLIC;
