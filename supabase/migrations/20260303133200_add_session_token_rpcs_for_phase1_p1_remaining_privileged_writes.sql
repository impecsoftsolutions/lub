/*
  # Add session-token RPCs for remaining privileged admin writes

  1. Purpose
    - Move remaining privileged browser-side writes behind SECURITY DEFINER RPCs
    - Derive the acting user from the custom session token
    - Enforce permission checks server-side with has_permission(...)
*/

-- =============================================
-- Admin member edit wrapper
-- =============================================

CREATE OR REPLACE FUNCTION public.update_member_registration_with_session(
  p_member_id uuid,
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
  v_is_super_admin boolean := false;
BEGIN
  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);

  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT public.has_permission(v_actor_user_id, 'members.edit') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM user_roles ur
    WHERE ur.user_id = v_actor_user_id
      AND ur.role = 'super_admin'
  )
  INTO v_is_super_admin;

  RETURN public.update_member_registration(
    p_member_id,
    v_actor_user_id,
    COALESCE(p_updates, '{}'::jsonb),
    v_is_super_admin
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_member_registration_with_session(uuid, text, jsonb) TO PUBLIC;

-- =============================================
-- Member active toggle
-- =============================================

CREATE OR REPLACE FUNCTION public.toggle_member_registration_active_with_session(
  p_member_id uuid,
  p_session_token text,
  p_is_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
  v_current_is_active boolean;
BEGIN
  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);

  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT public.has_permission(v_actor_user_id, 'members.edit') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  SELECT mr.is_active
  INTO v_current_is_active
  FROM member_registrations mr
  WHERE mr.id = p_member_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Member registration not found');
  END IF;

  IF COALESCE(v_current_is_active, false) = COALESCE(p_is_active, false) THEN
    RETURN jsonb_build_object('success', true, 'changed', false);
  END IF;

  UPDATE member_registrations
  SET
    is_active = p_is_active,
    last_modified_by = v_actor_user_id,
    last_modified_at = now(),
    deactivated_at = CASE WHEN p_is_active THEN NULL ELSE now() END,
    deactivated_by = CASE WHEN p_is_active THEN NULL ELSE v_actor_user_id END
  WHERE id = p_member_id;

  INSERT INTO member_audit_history (
    member_id,
    action_type,
    changed_by,
    change_reason
  )
  VALUES (
    p_member_id,
    CASE WHEN p_is_active THEN 'activate' ELSE 'deactivate' END,
    v_actor_user_id,
    CASE WHEN p_is_active THEN 'Member activated' ELSE 'Member deactivated' END
  );

  RETURN jsonb_build_object('success', true, 'changed', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_member_registration_active_with_session(uuid, text, boolean) TO PUBLIC;

-- =============================================
-- Validation rules mutations
-- =============================================

CREATE OR REPLACE FUNCTION public.create_validation_rule_with_session(
  p_session_token text,
  p_rule_name text,
  p_rule_type text,
  p_category text,
  p_validation_pattern text,
  p_error_message text,
  p_description text,
  p_display_order integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
  v_rule validation_rules%ROWTYPE;
BEGIN
  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);

  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT public.has_permission(v_actor_user_id, 'settings.validation.manage') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  INSERT INTO validation_rules (
    rule_name,
    rule_type,
    category,
    validation_pattern,
    error_message,
    description,
    display_order,
    is_active
  )
  VALUES (
    lower(trim(COALESCE(p_rule_name, ''))),
    COALESCE(trim(p_rule_type), ''),
    COALESCE(trim(p_category), ''),
    COALESCE(p_validation_pattern, ''),
    COALESCE(p_error_message, ''),
    COALESCE(p_description, ''),
    COALESCE(p_display_order, 0),
    true
  )
  RETURNING *
  INTO v_rule;

  RETURN jsonb_build_object(
    'success', true,
    'data', to_jsonb(v_rule)
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_validation_rule_with_session(text, text, text, text, text, text, text, integer) TO PUBLIC;

CREATE OR REPLACE FUNCTION public.update_validation_rule_with_session(
  p_session_token text,
  p_rule_id uuid,
  p_validation_pattern text,
  p_error_message text
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
    error_message = COALESCE(p_error_message, error_message)
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

GRANT EXECUTE ON FUNCTION public.update_validation_rule_with_session(text, uuid, text, text) TO PUBLIC;

CREATE OR REPLACE FUNCTION public.toggle_validation_rule_active_with_session(
  p_session_token text,
  p_rule_id uuid,
  p_is_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
  v_current_is_active boolean;
BEGIN
  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);

  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT public.has_permission(v_actor_user_id, 'settings.validation.manage') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  SELECT vr.is_active
  INTO v_current_is_active
  FROM validation_rules vr
  WHERE vr.id = p_rule_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Validation rule not found');
  END IF;

  IF COALESCE(v_current_is_active, false) = COALESCE(p_is_active, false) THEN
    RETURN jsonb_build_object('success', true, 'changed', false);
  END IF;

  UPDATE validation_rules
  SET is_active = p_is_active
  WHERE id = p_rule_id;

  RETURN jsonb_build_object('success', true, 'changed', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_validation_rule_active_with_session(text, uuid, boolean) TO PUBLIC;

CREATE OR REPLACE FUNCTION public.update_validation_rule_category_with_session(
  p_session_token text,
  p_rule_id uuid,
  p_new_category text
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
  SET category = COALESCE(trim(p_new_category), category)
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

GRANT EXECUTE ON FUNCTION public.update_validation_rule_category_with_session(text, uuid, text) TO PUBLIC;

-- =============================================
-- Payment settings mutations
-- =============================================

CREATE OR REPLACE FUNCTION public.create_payment_settings_with_session(
  p_session_token text,
  p_payload jsonb
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

  INSERT INTO payment_settings (
    state,
    qr_code_image_url,
    account_holder_name,
    bank_name,
    branch,
    account_number,
    ifsc_code,
    male_fee,
    female_fee,
    validity_years
  )
  VALUES (
    trim(COALESCE(p_payload ->> 'state', '')),
    COALESCE(p_payload ->> 'qr_code_image_url', ''),
    COALESCE(p_payload ->> 'account_holder_name', ''),
    COALESCE(p_payload ->> 'bank_name', ''),
    COALESCE(p_payload ->> 'branch', ''),
    COALESCE(p_payload ->> 'account_number', ''),
    COALESCE(p_payload ->> 'ifsc_code', ''),
    NULLIF(p_payload ->> 'male_fee', '')::integer,
    NULLIF(p_payload ->> 'female_fee', '')::integer,
    NULLIF(p_payload ->> 'validity_years', '')::integer
  );

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_payment_settings_with_session(text, jsonb) TO PUBLIC;

CREATE OR REPLACE FUNCTION public.update_payment_settings_with_session(
  p_session_token text,
  p_state text,
  p_updates jsonb
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

  UPDATE payment_settings
  SET
    state = COALESCE(NULLIF(trim(p_updates ->> 'state'), ''), state),
    qr_code_image_url = COALESCE(p_updates ->> 'qr_code_image_url', qr_code_image_url),
    account_holder_name = COALESCE(p_updates ->> 'account_holder_name', account_holder_name),
    bank_name = COALESCE(p_updates ->> 'bank_name', bank_name),
    branch = COALESCE(p_updates ->> 'branch', branch),
    account_number = COALESCE(p_updates ->> 'account_number', account_number),
    ifsc_code = COALESCE(p_updates ->> 'ifsc_code', ifsc_code),
    male_fee = COALESCE(NULLIF(p_updates ->> 'male_fee', '')::integer, male_fee),
    female_fee = COALESCE(NULLIF(p_updates ->> 'female_fee', '')::integer, female_fee),
    validity_years = COALESCE(NULLIF(p_updates ->> 'validity_years', '')::integer, validity_years)
  WHERE state = p_state;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment settings not found');
  END IF;

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_payment_settings_with_session(text, text, jsonb) TO PUBLIC;

-- =============================================
-- District mutations
-- =============================================

CREATE OR REPLACE FUNCTION public.add_district_with_session(
  p_session_token text,
  p_state_id uuid,
  p_district_name text,
  p_is_active boolean
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

  IF NOT public.has_permission(v_actor_user_id, 'locations.districts.manage') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  INSERT INTO districts_master (
    state_id,
    district_name,
    is_active
  )
  VALUES (
    p_state_id,
    trim(COALESCE(p_district_name, '')),
    COALESCE(p_is_active, true)
  );

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_district_with_session(text, uuid, text, boolean) TO PUBLIC;

CREATE OR REPLACE FUNCTION public.update_district_with_session(
  p_session_token text,
  p_district_id uuid,
  p_district_name text,
  p_is_active boolean
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

  IF NOT public.has_permission(v_actor_user_id, 'locations.districts.manage') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  UPDATE districts_master
  SET
    district_name = COALESCE(NULLIF(trim(p_district_name), ''), district_name),
    is_active = COALESCE(p_is_active, is_active)
  WHERE id = p_district_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'District not found');
  END IF;

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_district_with_session(text, uuid, text, boolean) TO PUBLIC;

CREATE OR REPLACE FUNCTION public.delete_district_hard_with_session(
  p_session_token text,
  p_district_id uuid
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

  IF NOT public.has_permission(v_actor_user_id, 'locations.districts.manage') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM cities_master cm
    WHERE cm.district_id = p_district_id
    LIMIT 1
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'District has cities mapped to it');
  END IF;

  DELETE FROM districts_master
  WHERE id = p_district_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'District not found');
  END IF;

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_district_hard_with_session(text, uuid) TO PUBLIC;

CREATE OR REPLACE FUNCTION public.toggle_district_active_with_session(
  p_session_token text,
  p_district_id uuid,
  p_is_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
  v_current_is_active boolean;
BEGIN
  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);

  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT public.has_permission(v_actor_user_id, 'locations.districts.manage') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  SELECT dm.is_active
  INTO v_current_is_active
  FROM districts_master dm
  WHERE dm.id = p_district_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'District not found');
  END IF;

  IF COALESCE(v_current_is_active, false) = COALESCE(p_is_active, false) THEN
    RETURN jsonb_build_object('success', true, 'changed', false);
  END IF;

  UPDATE districts_master
  SET is_active = p_is_active
  WHERE id = p_district_id;

  RETURN jsonb_build_object('success', true, 'changed', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_district_active_with_session(text, uuid, boolean) TO PUBLIC;
