/*
  Seed event_drafting AI runtime profile by cloning the current
  member_normalization profile settings.
*/

INSERT INTO public.ai_runtime_settings (
  setting_key,
  provider,
  model,
  api_key_secret,
  is_enabled,
  reasoning_effort,
  updated_by,
  created_at,
  updated_at
)
SELECT
  'event_drafting',
  provider,
  model,
  api_key_secret,
  true,
  reasoning_effort,
  updated_by,
  now(),
  now()
FROM public.ai_runtime_settings
WHERE setting_key = 'member_normalization'
ON CONFLICT (setting_key)
DO UPDATE SET
  provider = EXCLUDED.provider,
  model = EXCLUDED.model,
  api_key_secret = EXCLUDED.api_key_secret,
  is_enabled = EXCLUDED.is_enabled,
  reasoning_effort = EXCLUDED.reasoning_effort,
  updated_by = EXCLUDED.updated_by,
  updated_at = now();
