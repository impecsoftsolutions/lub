/*
  # Admin add/delete for normalization rules (COD-NORMALIZATION-RULES-ADD-DELETE-034)

  1. Purpose
    - Expand the Admin "Normalization Rules" surface from edit/enable/disable/reorder
      into a true CRUD lifecycle: add and (soft) delete admin-managed rules that the
      `normalize-member` runtime reads at request time.
    - Retire the hardcoded 9-key fixed catalog assumption in the runtime; the rule
      table becomes the source of truth for which `field_key` values get normalized.

  2. Behavior
    - Soft-retire model: deletes set `is_retired=true` instead of removing the row.
      This preserves audit history (`updated_by`, `updated_at`) and keeps the
      `field_key` slot reserved so re-adding the same key reactivates instead of
      colliding on the unique index.
    - Add: typed `field_key` input validated by regex `^[a-z][a-z0-9_]{1,63}$`.
      Categories remain the existing 5 (`identity`, `contact`, `company`, `business`,
      `referral`) — same CHECK constraint as the original migration.
    - Display order on add: appended at end (`MAX(display_order) + 1`).

  3. Security
    - Reads still require `settings.normalization.view` or `.manage`.
    - Add and delete require `settings.normalization.manage`.
    - All RPCs are SECURITY DEFINER + `search_path='public'` and resolve the actor
      from the custom session token (no client-trusted user IDs).

  4. Backward compatibility
    - Existing rules stay active (`is_retired` defaults to false on backfill).
    - Existing update/reorder RPCs untouched. The previous read RPC is replaced
      with one that filters retired rows by default.
*/

-- -----------------------------------------------------------------------------
-- Section 1: Add `is_retired` column
-- -----------------------------------------------------------------------------

ALTER TABLE public.member_normalization_rules
  ADD COLUMN IF NOT EXISTS is_retired boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_member_normalization_rules_is_retired
  ON public.member_normalization_rules(is_retired);

COMMENT ON COLUMN public.member_normalization_rules.is_retired IS
  'Soft-retire flag. True means admin removed the rule; runtime ignores it; '
  're-adding the same field_key reactivates the row instead of inserting a duplicate.';

-- -----------------------------------------------------------------------------
-- Section 2: Replace read RPC to filter retired rules
-- (keeps the same return envelope shape so the existing service / admin page work)
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
        WHERE nr.is_retired = false
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
-- Section 3: New CREATE RPC
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_normalization_rule_with_session(
  p_session_token   text,
  p_field_key       text,
  p_label           text,
  p_category        text,
  p_instruction_text text,
  p_is_enabled      boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id   uuid;
  v_field_key       text;
  v_label           text;
  v_category        text;
  v_instruction     text;
  v_existing_id     uuid;
  v_existing_retired boolean;
  v_next_order      integer;
  v_rule_id         uuid;
BEGIN
  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);

  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_session', 'error', 'Invalid session');
  END IF;

  IF NOT public.has_permission(v_actor_user_id, 'settings.normalization.manage') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'permission_denied', 'error', 'not authorized');
  END IF;

  v_field_key := lower(NULLIF(trim(COALESCE(p_field_key, '')), ''));
  v_label := NULLIF(trim(COALESCE(p_label, '')), '');
  v_category := NULLIF(trim(COALESCE(p_category, '')), '');
  v_instruction := trim(COALESCE(p_instruction_text, ''));

  IF v_field_key IS NULL OR v_field_key !~ '^[a-z][a-z0-9_]{1,63}$' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'invalid_field_key',
      'error', 'Field key must match ^[a-z][a-z0-9_]{1,63}$'
    );
  END IF;

  IF v_label IS NULL OR length(v_label) > 120 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'invalid_label',
      'error', 'Label is required and must be at most 120 characters'
    );
  END IF;

  IF v_category IS NULL OR v_category NOT IN ('identity', 'contact', 'company', 'business', 'referral') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'invalid_category',
      'error', 'Category must be one of identity / contact / company / business / referral'
    );
  END IF;

  IF length(v_instruction) > 2000 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'invalid_instruction',
      'error', 'Instruction must be at most 2000 characters'
    );
  END IF;

  -- Reactivate or insert.
  SELECT id, is_retired INTO v_existing_id, v_existing_retired
  FROM public.member_normalization_rules
  WHERE field_key = v_field_key
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    IF v_existing_retired = false THEN
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'field_key_exists',
        'error', 'A rule with this field_key already exists'
      );
    END IF;

    UPDATE public.member_normalization_rules
    SET
      label = v_label,
      category = v_category,
      instruction_text = v_instruction,
      default_instruction_text = v_instruction,
      is_enabled = COALESCE(p_is_enabled, true),
      is_retired = false,
      updated_by = v_actor_user_id,
      updated_at = now()
    WHERE id = v_existing_id;

    RETURN jsonb_build_object(
      'success', true,
      'reactivated', true,
      'id', v_existing_id,
      'field_key', v_field_key
    );
  END IF;

  SELECT COALESCE(MAX(display_order), 0) + 1
    INTO v_next_order
  FROM public.member_normalization_rules;

  INSERT INTO public.member_normalization_rules (
    field_key, label, category, instruction_text, default_instruction_text,
    is_enabled, display_order, updated_by, is_retired
  )
  VALUES (
    v_field_key, v_label, v_category, v_instruction, v_instruction,
    COALESCE(p_is_enabled, true), v_next_order, v_actor_user_id, false
  )
  RETURNING id INTO v_rule_id;

  RETURN jsonb_build_object(
    'success', true,
    'reactivated', false,
    'id', v_rule_id,
    'field_key', v_field_key,
    'display_order', v_next_order
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'unexpected_error', 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_normalization_rule_with_session(text, text, text, text, text, boolean) TO PUBLIC;

-- -----------------------------------------------------------------------------
-- Section 4: New DELETE (soft-retire) RPC
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.delete_normalization_rule_with_session(
  p_session_token text,
  p_field_key     text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
  v_field_key     text;
  v_existing_id   uuid;
  v_already_retired boolean;
BEGIN
  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);

  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_session', 'error', 'Invalid session');
  END IF;

  IF NOT public.has_permission(v_actor_user_id, 'settings.normalization.manage') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'permission_denied', 'error', 'not authorized');
  END IF;

  v_field_key := lower(NULLIF(trim(COALESCE(p_field_key, '')), ''));
  IF v_field_key IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'invalid_field_key',
      'error', 'Field key is required'
    );
  END IF;

  SELECT id, is_retired INTO v_existing_id, v_already_retired
  FROM public.member_normalization_rules
  WHERE field_key = v_field_key
  LIMIT 1;

  IF v_existing_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'rule_not_found',
      'error', 'Normalization rule not found'
    );
  END IF;

  IF v_already_retired THEN
    -- Idempotent: already retired returns success without modifying timestamps.
    RETURN jsonb_build_object('success', true, 'already_retired', true, 'id', v_existing_id);
  END IF;

  UPDATE public.member_normalization_rules
  SET
    is_retired = true,
    is_enabled = false,
    updated_by = v_actor_user_id,
    updated_at = now()
  WHERE id = v_existing_id;

  RETURN jsonb_build_object(
    'success', true,
    'already_retired', false,
    'id', v_existing_id
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'unexpected_error', 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_normalization_rule_with_session(text, text) TO PUBLIC;

COMMENT ON FUNCTION public.create_normalization_rule_with_session(text, text, text, text, text, boolean) IS
  'Admin-add a normalization rule. Soft-reactivates a previously retired rule with the same field_key.';
COMMENT ON FUNCTION public.delete_normalization_rule_with_session(text, text) IS
  'Admin-delete (soft-retire) a normalization rule. Runtime stops applying it immediately.';
