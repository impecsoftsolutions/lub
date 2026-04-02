/*
  # Add delete_payment_settings_with_session RPC

  1. Purpose
    - Allow super-admin payment settings deletion through the existing
      custom-session permission model

  2. Security
    - Derive actor from `p_session_token`
    - Enforce `settings.payment.manage` server-side
*/

CREATE OR REPLACE FUNCTION public.delete_payment_settings_with_session(
  p_session_token text,
  p_state text
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

  IF NOT public.has_permission(v_actor_user_id, 'settings.payment.manage') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  DELETE FROM public.payment_settings
  WHERE state = trim(COALESCE(p_state, ''));

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment settings not found');
  END IF;

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_payment_settings_with_session(text, text) TO PUBLIC;
