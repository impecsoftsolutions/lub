/*
  # Add Signup Prefill Payload Session RPC

  - Exposes latest signup submission payload (core + custom) for the active custom session user.
  - Keeps browser reads on hardened `_with_session` contract instead of direct table reads.
  - Used by Join prefill pipeline to hydrate dynamic fields added in Signup Form Builder.
*/

CREATE OR REPLACE FUNCTION public.get_signup_prefill_payload_with_session(
  p_session_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_core_payload jsonb := '{}'::jsonb;
  v_custom_payload jsonb := '{}'::jsonb;
  v_created_at timestamptz;
BEGIN
  v_user_id := public.resolve_custom_session_user_id(p_session_token);

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  SELECT
    COALESCE(s.core_payload, '{}'::jsonb),
    COALESCE(s.custom_payload, '{}'::jsonb),
    s.created_at
  INTO
    v_core_payload,
    v_custom_payload,
    v_created_at
  FROM public.form_config_v2_submissions s
  WHERE s.form_key = 'signup'
    AND s.user_id = v_user_id
  ORDER BY s.created_at DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'success', true,
    'data', v_core_payload || v_custom_payload,
    'core_payload', v_core_payload,
    'custom_payload', v_custom_payload,
    'submission_created_at', v_created_at
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_signup_prefill_payload_with_session(text) TO PUBLIC;

