/*
  # Add admin-configurable normalization rules domain (NORMALIZATION-RULES-ADMIN-001)

  1. Purpose
    - Move Verify-time member-registration normalization rules out of the hardcoded edge-function prompt
    - Provide admin-managed normalization rule storage with session-wrapped read/write/reorder RPCs
    - Keep normalization distinct from regex validation and Smart Upload extraction

  2. Security
    - Read requires settings.normalization.view or settings.normalization.manage
    - Mutations require settings.normalization.manage
    - Browser writes remain session-token wrapped; no direct table writes are exposed
*/

-- -----------------------------------------------------------------------------
-- Section 1: Add permissions for normalization settings
-- -----------------------------------------------------------------------------

INSERT INTO public.permissions (code, name, description, category, is_active)
VALUES
  ('settings.normalization.view', 'View Normalization Rules', 'View Verify-time text normalization rules for member registration', 'settings', true),
  ('settings.normalization.manage', 'Manage Normalization Rules', 'Configure Verify-time text normalization rules for member registration', 'settings', true)
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  is_active = EXCLUDED.is_active,
  updated_at = now();

INSERT INTO public.role_permissions (role, permission_code, granted_by, is_revoked)
VALUES
  ('super_admin', 'settings.normalization.view', NULL, false),
  ('super_admin', 'settings.normalization.manage', NULL, false),
  ('admin', 'settings.normalization.view', NULL, false),
  ('admin', 'settings.normalization.manage', NULL, false)
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- Section 2: Create normalization rules table
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.member_normalization_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_key text NOT NULL UNIQUE,
  label text NOT NULL,
  category text NOT NULL,
  instruction_text text NOT NULL DEFAULT '',
  default_instruction_text text NOT NULL DEFAULT '',
  is_enabled boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT normalization_rules_category_check CHECK (
    category IN ('identity', 'contact', 'company', 'business', 'referral')
  )
);

ALTER TABLE public.member_normalization_rules
  ADD COLUMN IF NOT EXISTS field_key text,
  ADD COLUMN IF NOT EXISTS label text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS instruction_text text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS default_instruction_text text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS is_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS display_order integer,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DELETE FROM public.member_normalization_rules
WHERE field_key IS NULL
   OR label IS NULL
   OR category IS NULL
   OR display_order IS NULL;

ALTER TABLE public.member_normalization_rules
  ALTER COLUMN field_key SET NOT NULL,
  ALTER COLUMN label SET NOT NULL,
  ALTER COLUMN category SET NOT NULL,
  ALTER COLUMN display_order SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'normalization_rules_category_check'
      AND conrelid = 'public.member_normalization_rules'::regclass
  ) THEN
    ALTER TABLE public.member_normalization_rules
      ADD CONSTRAINT normalization_rules_category_check CHECK (
        category IN ('identity', 'contact', 'company', 'business', 'referral')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_member_normalization_rules_category ON public.member_normalization_rules(category);
CREATE INDEX IF NOT EXISTS idx_member_normalization_rules_display_order ON public.member_normalization_rules(display_order);
CREATE INDEX IF NOT EXISTS idx_member_normalization_rules_enabled ON public.member_normalization_rules(is_enabled);
CREATE UNIQUE INDEX IF NOT EXISTS idx_member_normalization_rules_field_key ON public.member_normalization_rules(field_key);

COMMENT ON TABLE public.member_normalization_rules IS
  'Admin-configurable Verify-time normalization instructions for member registration. Separate from validation rules and Smart Upload extraction policies.';
COMMENT ON COLUMN public.member_normalization_rules.field_key IS
  'Exact normalization field key used by normalize-member runtime.';
COMMENT ON COLUMN public.member_normalization_rules.instruction_text IS
  'Current admin-managed instruction sent to the normalization runtime for this field.';
COMMENT ON COLUMN public.member_normalization_rules.default_instruction_text IS
  'Built-in default instruction for this field, used for UI restore-default actions and runtime fallback seeding.';

INSERT INTO public.member_normalization_rules (
  field_key,
  label,
  category,
  instruction_text,
  default_instruction_text,
  is_enabled,
  display_order
)
VALUES
  ('full_name', 'Full Name', 'identity', 'Title Case, trim extra spaces', 'Title Case, trim extra spaces', true, 1),
  ('email', 'Email Address', 'contact', 'Keep as provided', 'Keep as provided', false, 2),
  ('mobile_number', 'Mobile Number', 'contact', 'Keep as provided', 'Keep as provided', false, 3),
  ('company_name', 'Company Name', 'company', 'Title Case, trim extra spaces', 'Title Case, trim extra spaces', true, 4),
  ('company_address', 'Company Address', 'company', 'Trim extra spaces and normalize spacing', 'Trim extra spaces and normalize spacing', true, 5),
  ('products_services', 'Products & Services', 'business', 'Trim extra spaces and normalize punctuation spacing', 'Trim extra spaces and normalize punctuation spacing', true, 6),
  ('alternate_contact_name', 'Alternate Contact Name', 'contact', 'Title Case, trim extra spaces', 'Title Case, trim extra spaces', true, 7),
  ('alternate_mobile', 'Alternate Mobile', 'contact', 'Keep as provided', 'Keep as provided', false, 8),
  ('referred_by', 'Referred By', 'referral', 'Title Case, trim extra spaces', 'Title Case, trim extra spaces', true, 9)
ON CONFLICT (field_key) DO UPDATE
SET
  label = EXCLUDED.label,
  category = EXCLUDED.category,
  default_instruction_text = EXCLUDED.default_instruction_text,
  display_order = EXCLUDED.display_order,
  updated_at = now();

ALTER TABLE public.member_normalization_rules ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- Section 3: Session-wrapped read RPC
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_normalization_rules_with_session(
  p_session_token text
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

  IF NOT (
    public.has_permission(v_actor_user_id, 'settings.normalization.view')
    OR public.has_permission(v_actor_user_id, 'settings.normalization.manage')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'data', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', nr.id,
            'field_key', nr.field_key,
            'label', nr.label,
            'category', nr.category,
            'instruction_text', nr.instruction_text,
            'default_instruction_text', nr.default_instruction_text,
            'is_enabled', nr.is_enabled,
            'display_order', nr.display_order,
            'updated_at', nr.updated_at,
            'updated_by', nr.updated_by,
            'updated_by_email', u.email
          )
          ORDER BY nr.display_order, nr.label
        )
        FROM public.member_normalization_rules nr
        LEFT JOIN public.users u ON u.id = nr.updated_by
      ),
      '[]'::jsonb
    )
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_normalization_rules_with_session(text) TO PUBLIC;

-- -----------------------------------------------------------------------------
-- Section 4: Session-wrapped update RPC
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_normalization_rule_with_session(
  p_session_token text,
  p_field_key text,
  p_instruction_text text DEFAULT NULL,
  p_is_enabled boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
  v_field_key text;
BEGIN
  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);

  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT public.has_permission(v_actor_user_id, 'settings.normalization.manage') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  v_field_key := NULLIF(trim(COALESCE(p_field_key, '')), '');
  IF v_field_key IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Field key is required');
  END IF;

  UPDATE public.member_normalization_rules
  SET
    instruction_text = CASE
      WHEN p_instruction_text IS NULL THEN instruction_text
      ELSE trim(p_instruction_text)
    END,
    is_enabled = COALESCE(p_is_enabled, is_enabled),
    updated_by = v_actor_user_id,
    updated_at = now()
  WHERE field_key = v_field_key;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Normalization rule not found');
  END IF;

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_normalization_rule_with_session(text, text, text, boolean) TO PUBLIC;

-- -----------------------------------------------------------------------------
-- Section 5: Session-wrapped reorder RPC
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reorder_normalization_rules_with_session(
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
  v_field_key text;
  v_display_order integer;
  v_updated_count integer := 0;
BEGIN
  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);

  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT public.has_permission(v_actor_user_id, 'settings.normalization.manage') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  IF p_updates IS NULL OR jsonb_typeof(p_updates) <> 'array' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Updates array is required');
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_updates)
  LOOP
    v_field_key := NULLIF(trim(COALESCE(v_item->>'field_key', '')), '');
    v_display_order := NULLIF(v_item->>'display_order', '')::integer;

    IF v_field_key IS NULL OR v_display_order IS NULL THEN
      CONTINUE;
    END IF;

    UPDATE public.member_normalization_rules
    SET
      display_order = v_display_order,
      updated_by = v_actor_user_id,
      updated_at = now()
    WHERE field_key = v_field_key;

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

GRANT EXECUTE ON FUNCTION public.reorder_normalization_rules_with_session(text, jsonb) TO PUBLIC;
