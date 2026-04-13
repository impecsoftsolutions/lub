/*
  # Add AI runtime settings admin contracts (COD-AI-SETTINGS-001)

  1. Purpose
    - Provide admin-configurable AI provider/model/key settings for normalization workflows
    - Keep API key hidden from browser responses (masked only)
    - Enforce custom-session + permission checks through _with_session RPC wrappers

  2. Security
    - Read requires settings.ai.view (or settings.ai.manage)
    - Write requires settings.ai.manage
    - Raw api_key_secret is never returned by read RPC
*/

-- -----------------------------------------------------------------------------
-- Section 1: Add permissions for AI settings
-- -----------------------------------------------------------------------------

INSERT INTO public.permissions (code, name, description, category, is_active)
VALUES
  ('settings.ai.view', 'View AI Settings', 'View AI provider/model configuration status', 'settings', true),
  ('settings.ai.manage', 'Manage AI Settings', 'Configure AI provider/model/api key settings', 'settings', true)
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  is_active = EXCLUDED.is_active,
  updated_at = now();

INSERT INTO public.role_permissions (role, permission_code, granted_by, is_revoked)
VALUES
  ('super_admin', 'settings.ai.view', NULL, false),
  ('super_admin', 'settings.ai.manage', NULL, false),
  ('admin', 'settings.ai.view', NULL, false),
  ('admin', 'settings.ai.manage', NULL, false)
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- Section 2: Create AI runtime settings table
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ai_runtime_settings (
  setting_key text PRIMARY KEY,
  provider text NOT NULL DEFAULT 'openai',
  model text NOT NULL DEFAULT 'gpt-4o-mini',
  api_key_secret text,
  is_enabled boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_runtime_settings_provider_check CHECK (
    provider IN ('openai', 'google', 'anthropic', 'azure_openai', 'custom')
  )
);

COMMENT ON TABLE public.ai_runtime_settings IS
  'Singleton-like AI runtime settings storage. API key is kept server-side and never returned raw to clients.';
COMMENT ON COLUMN public.ai_runtime_settings.setting_key IS
  'Logical settings key (currently member_normalization).';
COMMENT ON COLUMN public.ai_runtime_settings.api_key_secret IS
  'Raw provider API key. Never returned via read RPCs; only masked presence metadata is exposed.';

INSERT INTO public.ai_runtime_settings (setting_key, provider, model, is_enabled)
VALUES ('member_normalization', 'openai', 'gpt-4o-mini', false)
ON CONFLICT (setting_key) DO NOTHING;

ALTER TABLE public.ai_runtime_settings ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- Section 3: Session-wrapped read RPC (masked key)
-- -----------------------------------------------------------------------------

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

  RETURN jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'setting_key', v_settings.setting_key,
      'provider', v_settings.provider,
      'model', v_settings.model,
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

GRANT EXECUTE ON FUNCTION public.get_ai_runtime_settings_with_session(text) TO PUBLIC;

-- -----------------------------------------------------------------------------
-- Section 4: Session-wrapped write RPC (upsert)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.upsert_ai_runtime_settings_with_session(
  p_session_token text,
  p_provider text,
  p_model text,
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

  SELECT api_key_secret
  INTO v_existing_key
  FROM public.ai_runtime_settings
  WHERE setting_key = 'member_normalization'
  LIMIT 1;

  IF trim(COALESCE(p_api_key, '')) = '' THEN
    v_final_key := v_existing_key;
  ELSE
    v_final_key := trim(p_api_key);
  END IF;

  INSERT INTO public.ai_runtime_settings (
    setting_key,
    provider,
    model,
    api_key_secret,
    is_enabled,
    updated_by,
    created_at,
    updated_at
  ) VALUES (
    'member_normalization',
    v_provider,
    v_model,
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
      'is_enabled', COALESCE(p_is_enabled, false),
      'has_api_key', trim(COALESCE(v_final_key, '')) <> ''
    )
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_ai_runtime_settings_with_session(text, text, text, boolean, text) TO PUBLIC;

-- -----------------------------------------------------------------------------
-- Section 5: Public runtime profile (non-sensitive)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_ai_runtime_normalization_profile()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_settings public.ai_runtime_settings%ROWTYPE;
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
        'is_enabled', false
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'provider', v_settings.provider,
      'model', v_settings.model,
      'is_enabled', v_settings.is_enabled
    )
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ai_runtime_normalization_profile() TO PUBLIC;
