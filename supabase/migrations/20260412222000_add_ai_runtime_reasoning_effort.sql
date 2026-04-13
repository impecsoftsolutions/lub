/*
  # Add OpenAI reasoning effort to AI runtime settings (COD-AI-SETTINGS-002)

  Adds persisted reasoning-effort support for OpenAI runtime profiles and
  exposes it through existing admin/session and public runtime profile RPCs.
*/

BEGIN;

ALTER TABLE public.ai_runtime_settings
ADD COLUMN IF NOT EXISTS reasoning_effort text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ai_runtime_settings_reasoning_effort_check'
  ) THEN
    ALTER TABLE public.ai_runtime_settings
    ADD CONSTRAINT ai_runtime_settings_reasoning_effort_check
    CHECK (
      reasoning_effort IS NULL
      OR reasoning_effort IN ('low', 'medium', 'high', 'xhigh')
    );
  END IF;
END $$;

UPDATE public.ai_runtime_settings
SET reasoning_effort = 'medium',
    updated_at = now()
WHERE provider = 'openai'
  AND (reasoning_effort IS NULL OR trim(reasoning_effort) = '');

CREATE OR REPLACE FUNCTION public.get_ai_runtime_settings_with_session(
  p_session_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
  v_settings public.ai_runtime_settings%ROWTYPE;
  v_updated_by_email text;
  v_has_key boolean;
  v_masked_key text;
  v_trimmed_key text;
  v_reasoning_effort text;
BEGIN
  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);

  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT (
    public.has_permission(v_actor_user_id, 'settings.ai.view')
    OR public.has_permission(v_actor_user_id, 'settings.ai.manage')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  SELECT *
  INTO v_settings
  FROM public.ai_runtime_settings
  WHERE setting_key = 'member_normalization'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'data', jsonb_build_object(
        'setting_key', 'member_normalization',
        'provider', 'openai',
        'model', 'gpt-4o-mini',
        'reasoning_effort', 'medium',
        'is_enabled', false,
        'has_api_key', false,
        'api_key_masked', null,
        'updated_at', null,
        'updated_by_email', null,
        'live_updated_via', 'default'
      )
    );
  END IF;

  v_trimmed_key := trim(COALESCE(v_settings.api_key_secret, ''));
  v_has_key := (v_trimmed_key <> '');

  IF v_has_key THEN
    IF length(v_trimmed_key) <= 6 THEN
      v_masked_key := repeat('*', GREATEST(length(v_trimmed_key), 6));
    ELSE
      v_masked_key := left(v_trimmed_key, 4)
        || repeat('*', GREATEST(length(v_trimmed_key) - 6, 4))
        || right(v_trimmed_key, 2);
    END IF;
  ELSE
    v_masked_key := null;
  END IF;

  IF v_settings.updated_by IS NOT NULL THEN
    SELECT u.email
    INTO v_updated_by_email
    FROM public.users u
    WHERE u.id = v_settings.updated_by
    LIMIT 1;
  END IF;

  IF v_settings.provider = 'openai' THEN
    v_reasoning_effort := COALESCE(NULLIF(trim(v_settings.reasoning_effort), ''), 'medium');
    IF v_reasoning_effort NOT IN ('low', 'medium', 'high', 'xhigh') THEN
      v_reasoning_effort := 'medium';
    END IF;
  ELSE
    v_reasoning_effort := NULL;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'setting_key', v_settings.setting_key,
      'provider', v_settings.provider,
      'model', v_settings.model,
      'reasoning_effort', v_reasoning_effort,
      'is_enabled', v_settings.is_enabled,
      'has_api_key', v_has_key,
      'api_key_masked', v_masked_key,
      'updated_at', v_settings.updated_at,
      'updated_by_email', v_updated_by_email,
      'live_updated_via', 'admin_settings'
    )
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

DROP FUNCTION IF EXISTS public.upsert_ai_runtime_settings_with_session(text, text, text, boolean, text);

CREATE OR REPLACE FUNCTION public.upsert_ai_runtime_settings_with_session(
  p_session_token text,
  p_provider text,
  p_model text,
  p_reasoning_effort text DEFAULT NULL,
  p_is_enabled boolean DEFAULT false,
  p_api_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
  v_provider text;
  v_model text;
  v_existing_key text;
  v_final_key text;
  v_existing_reasoning_effort text;
  v_reasoning_effort text;
BEGIN
  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);

  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT public.has_permission(v_actor_user_id, 'settings.ai.manage') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  v_provider := lower(trim(COALESCE(p_provider, '')));
  v_model := trim(COALESCE(p_model, ''));

  IF v_provider = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Provider is required');
  END IF;

  IF v_provider NOT IN ('openai', 'google', 'anthropic', 'azure_openai', 'custom') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unsupported provider');
  END IF;

  IF v_model = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Model is required');
  END IF;

  SELECT
    api_key_secret,
    reasoning_effort
  INTO
    v_existing_key,
    v_existing_reasoning_effort
  FROM public.ai_runtime_settings
  WHERE setting_key = 'member_normalization'
  LIMIT 1;

  IF trim(COALESCE(p_api_key, '')) = '' THEN
    v_final_key := v_existing_key;
  ELSE
    v_final_key := trim(p_api_key);
  END IF;

  IF v_provider = 'openai' THEN
    v_reasoning_effort := lower(trim(COALESCE(p_reasoning_effort, '')));
    IF v_reasoning_effort = '' THEN
      v_reasoning_effort := lower(trim(COALESCE(v_existing_reasoning_effort, '')));
    END IF;
    IF v_reasoning_effort = '' THEN
      v_reasoning_effort := 'medium';
    END IF;
    IF v_reasoning_effort NOT IN ('low', 'medium', 'high', 'xhigh') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Unsupported reasoning effort');
    END IF;
  ELSE
    v_reasoning_effort := NULL;
  END IF;

  INSERT INTO public.ai_runtime_settings (
    setting_key,
    provider,
    model,
    reasoning_effort,
    api_key_secret,
    is_enabled,
    updated_by,
    created_at,
    updated_at
  ) VALUES (
    'member_normalization',
    v_provider,
    v_model,
    v_reasoning_effort,
    v_final_key,
    COALESCE(p_is_enabled, false),
    v_actor_user_id,
    now(),
    now()
  )
  ON CONFLICT (setting_key)
  DO UPDATE SET
    provider = EXCLUDED.provider,
    model = EXCLUDED.model,
    reasoning_effort = EXCLUDED.reasoning_effort,
    api_key_secret = EXCLUDED.api_key_secret,
    is_enabled = EXCLUDED.is_enabled,
    updated_by = EXCLUDED.updated_by,
    updated_at = now();

  RETURN jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'setting_key', 'member_normalization',
      'provider', v_provider,
      'model', v_model,
      'reasoning_effort', v_reasoning_effort,
      'is_enabled', COALESCE(p_is_enabled, false),
      'has_api_key', trim(COALESCE(v_final_key, '')) <> ''
    )
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_ai_runtime_settings_with_session(text, text, text, text, boolean, text) TO PUBLIC;

CREATE OR REPLACE FUNCTION public.get_ai_runtime_normalization_profile()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_settings public.ai_runtime_settings%ROWTYPE;
  v_reasoning_effort text;
BEGIN
  SELECT *
  INTO v_settings
  FROM public.ai_runtime_settings
  WHERE setting_key = 'member_normalization'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'data', jsonb_build_object(
        'provider', 'openai',
        'model', 'gpt-4o-mini',
        'reasoning_effort', 'medium',
        'is_enabled', false
      )
    );
  END IF;

  IF v_settings.provider = 'openai' THEN
    v_reasoning_effort := COALESCE(NULLIF(trim(v_settings.reasoning_effort), ''), 'medium');
    IF v_reasoning_effort NOT IN ('low', 'medium', 'high', 'xhigh') THEN
      v_reasoning_effort := 'medium';
    END IF;
  ELSE
    v_reasoning_effort := NULL;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'provider', v_settings.provider,
      'model', v_settings.model,
      'reasoning_effort', v_reasoning_effort,
      'is_enabled', v_settings.is_enabled
    )
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

COMMIT;

