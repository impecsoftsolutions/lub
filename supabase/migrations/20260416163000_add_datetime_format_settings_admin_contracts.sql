/*
  # Add global date/time format settings admin contracts (CLAUDE-DATETIME-FORMAT-001)

  1. Purpose
    - Provide admin-configurable global date and time display settings
    - Apply consistently across admin, public, and member-facing surfaces
    - Expose a non-sensitive public runtime profile for browser formatting

  2. Security
    - Read requires settings.datetime.view or settings.datetime.manage
    - Write requires settings.datetime.manage
*/

-- -----------------------------------------------------------------------------
-- Section 1: Add permissions for date/time format settings
-- -----------------------------------------------------------------------------

INSERT INTO public.permissions (code, name, description, category, is_active)
VALUES
  ('settings.datetime.view', 'View Date & Time Settings', 'View global date and time display settings', 'settings', true),
  ('settings.datetime.manage', 'Manage Date & Time Settings', 'Configure global date and time display settings', 'settings', true)
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  is_active = EXCLUDED.is_active,
  updated_at = now();

INSERT INTO public.role_permissions (role, permission_code, granted_by, is_revoked)
VALUES
  ('super_admin', 'settings.datetime.view', NULL, false),
  ('super_admin', 'settings.datetime.manage', NULL, false),
  ('admin', 'settings.datetime.view', NULL, false),
  ('admin', 'settings.datetime.manage', NULL, false)
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- Section 2: Create singleton-like settings table
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.datetime_format_settings (
  setting_key text PRIMARY KEY,
  date_format text NOT NULL DEFAULT 'dd-mm-yyyy',
  time_format text NOT NULL DEFAULT '12h',
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT datetime_format_settings_date_format_check CHECK (
    date_format IN ('dd-mm-yyyy', 'mm-dd-yyyy', 'yyyy-mm-dd', 'dd-mmm-yyyy')
  ),
  CONSTRAINT datetime_format_settings_time_format_check CHECK (
    time_format IN ('12h', '24h')
  )
);

COMMENT ON TABLE public.datetime_format_settings IS
  'Singleton-like storage for global browser date/time display preferences.';
COMMENT ON COLUMN public.datetime_format_settings.setting_key IS
  'Logical settings key (currently global_display).';
COMMENT ON COLUMN public.datetime_format_settings.date_format IS
  'Preferred global date format.';
COMMENT ON COLUMN public.datetime_format_settings.time_format IS
  'Preferred global time format.';

INSERT INTO public.datetime_format_settings (setting_key, date_format, time_format)
VALUES ('global_display', 'dd-mm-yyyy', '12h')
ON CONFLICT (setting_key) DO NOTHING;

ALTER TABLE public.datetime_format_settings ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- Section 3: Session-wrapped read RPC
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_datetime_format_settings_with_session(
  p_session_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
  v_settings public.datetime_format_settings%ROWTYPE;
  v_updated_by_email text;
BEGIN
  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);

  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT (
    public.has_permission(v_actor_user_id, 'settings.datetime.view')
    OR public.has_permission(v_actor_user_id, 'settings.datetime.manage')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  SELECT *
  INTO v_settings
  FROM public.datetime_format_settings
  WHERE setting_key = 'global_display'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'data', jsonb_build_object(
        'setting_key', 'global_display',
        'date_format', 'dd-mm-yyyy',
        'time_format', '12h',
        'updated_at', null,
        'updated_by_email', null,
        'live_updated_via', 'default'
      )
    );
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
      'date_format', v_settings.date_format,
      'time_format', v_settings.time_format,
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

GRANT EXECUTE ON FUNCTION public.get_datetime_format_settings_with_session(text) TO PUBLIC;

-- -----------------------------------------------------------------------------
-- Section 4: Session-wrapped write RPC (upsert)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.upsert_datetime_format_settings_with_session(
  p_session_token text,
  p_date_format text,
  p_time_format text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
  v_date_format text;
  v_time_format text;
BEGIN
  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);

  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT public.has_permission(v_actor_user_id, 'settings.datetime.manage') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  v_date_format := lower(trim(COALESCE(p_date_format, '')));
  v_time_format := lower(trim(COALESCE(p_time_format, '')));

  IF v_date_format NOT IN ('dd-mm-yyyy', 'mm-dd-yyyy', 'yyyy-mm-dd', 'dd-mmm-yyyy') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unsupported date format');
  END IF;

  IF v_time_format NOT IN ('12h', '24h') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unsupported time format');
  END IF;

  INSERT INTO public.datetime_format_settings (
    setting_key,
    date_format,
    time_format,
    updated_by,
    created_at,
    updated_at
  ) VALUES (
    'global_display',
    v_date_format,
    v_time_format,
    v_actor_user_id,
    now(),
    now()
  )
  ON CONFLICT (setting_key)
  DO UPDATE SET
    date_format = EXCLUDED.date_format,
    time_format = EXCLUDED.time_format,
    updated_by = EXCLUDED.updated_by,
    updated_at = now();

  RETURN jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'setting_key', 'global_display',
      'date_format', v_date_format,
      'time_format', v_time_format
    )
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_datetime_format_settings_with_session(text, text, text) TO PUBLIC;

-- -----------------------------------------------------------------------------
-- Section 5: Public runtime profile (non-sensitive)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_datetime_format_runtime_profile()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_settings public.datetime_format_settings%ROWTYPE;
BEGIN
  SELECT *
  INTO v_settings
  FROM public.datetime_format_settings
  WHERE setting_key = 'global_display'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'data', jsonb_build_object(
        'date_format', 'dd-mm-yyyy',
        'time_format', '12h'
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'date_format', v_settings.date_format,
      'time_format', v_settings.time_format
    )
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_datetime_format_runtime_profile() TO PUBLIC;
