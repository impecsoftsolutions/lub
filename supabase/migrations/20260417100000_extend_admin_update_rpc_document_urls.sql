/*
  # Extend admin update_member_registration RPC for document URL persistence

  ## Purpose
  Allow the admin edit route to persist GST and UDYAM document URLs for any
  admin with `members.edit`, while keeping payment proof URL restricted to
  super admins.

  ## Changes
  1. `payment_proof_url` is no longer stripped unconditionally. It is removed
     from `v_update_data` only for non-super-admins.
  2. `gst_certificate_url`, `udyam_certificate_url`, and `payment_proof_url`
     are now persisted in the UPDATE SET block.

  ## Notes
  - Function signature and return type remain unchanged.
  - Session wrapper `update_member_registration_with_session` is unchanged.
  - Client wrapper in `src/lib/supabase.ts` is unchanged.
*/

DROP FUNCTION IF EXISTS update_member_registration(uuid, uuid, jsonb, boolean);

CREATE OR REPLACE FUNCTION update_member_registration(
  p_member_id uuid,
  p_requesting_user_id uuid,
  p_updates jsonb,
  p_is_super_admin boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_record RECORD;
  v_member_record RECORD;
  v_member_jsonb jsonb;
  v_is_authorized boolean := false;
  v_update_data jsonb := p_updates;
  v_field_key text;
  v_old_value text;
  v_new_value text;
  v_rows_updated integer := 0;
  v_new_email text;
  v_new_mobile text;
  v_email_changed boolean := false;
  v_mobile_changed boolean := false;
  v_users_sync_failed boolean := false;
BEGIN
  IF p_member_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Member ID is required'
    );
  END IF;

  IF p_requesting_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Requesting user ID is required'
    );
  END IF;

  IF p_updates IS NULL OR p_updates = '{}'::jsonb THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No updates provided'
    );
  END IF;

  SELECT * INTO v_user_record
  FROM users
  WHERE id = p_requesting_user_id
    AND account_status = 'active';

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User not found or inactive'
    );
  END IF;

  IF v_user_record.account_type IN ('admin', 'both', 'super_admin') THEN
    v_is_authorized := true;
  END IF;

  IF NOT v_is_authorized THEN
    SELECT EXISTS(
      SELECT 1 FROM user_roles
      WHERE user_id = p_requesting_user_id
        AND role IN ('super_admin', 'admin', 'editor')
    ) INTO v_is_authorized;
  END IF;

  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User does not have permission to update member registrations'
    );
  END IF;

  SELECT * INTO v_member_record
  FROM member_registrations
  WHERE id = p_member_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Member not found'
    );
  END IF;

  v_member_jsonb := to_jsonb(v_member_record);

  IF NOT p_is_super_admin THEN
    v_update_data := v_update_data - 'amount_paid';
    v_update_data := v_update_data - 'payment_date';
    v_update_data := v_update_data - 'payment_proof_url';
    v_update_data := v_update_data - 'payment_mode';
    v_update_data := v_update_data - 'transaction_id';
    v_update_data := v_update_data - 'bank_reference';
    v_update_data := v_update_data - 'member_id';
  END IF;

  v_update_data := v_update_data - 'id';
  v_update_data := v_update_data - 'created_at';
  v_update_data := v_update_data - 'is_legacy_member';
  v_update_data := v_update_data - 'user_id';
  v_update_data := v_update_data - 'submission_id';

  v_update_data := v_update_data || jsonb_build_object(
    'last_modified_by', p_requesting_user_id,
    'last_modified_at', now()
  );

  IF NOT (v_update_data ? 'is_custom_city') THEN
    v_update_data := v_update_data || jsonb_build_object('is_custom_city', false);
  END IF;

  IF v_update_data ? 'email' THEN
    v_new_email := v_update_data->>'email';
    IF v_new_email IS DISTINCT FROM v_member_record.email THEN
      v_email_changed := true;
    END IF;
  END IF;

  IF v_update_data ? 'mobile_number' THEN
    v_new_mobile := v_update_data->>'mobile_number';
    IF v_new_mobile IS DISTINCT FROM v_member_record.mobile_number THEN
      v_mobile_changed := true;
    END IF;
  END IF;

  UPDATE member_registrations
  SET
    full_name = COALESCE((v_update_data->>'full_name'), full_name),
    email = COALESCE((v_update_data->>'email'), email),
    mobile_number = COALESCE((v_update_data->>'mobile_number'), mobile_number),
    gender = COALESCE((v_update_data->>'gender'), gender),
    date_of_birth = COALESCE((v_update_data->>'date_of_birth')::date, date_of_birth),
    member_id = CASE
      WHEN v_update_data->>'member_id' IS NOT NULL
        AND v_update_data->>'member_id' != ''
        AND v_update_data->>'member_id' != COALESCE(member_id, '')
      THEN v_update_data->>'member_id'
      WHEN v_update_data->>'member_id' = ''
      THEN NULL
      ELSE member_id
    END,
    company_name = COALESCE((v_update_data->>'company_name'), company_name),
    company_designation_id = COALESCE((v_update_data->>'company_designation_id')::uuid, company_designation_id),
    company_address = COALESCE((v_update_data->>'company_address'), company_address),
    city = CASE
      WHEN v_update_data ? 'city' THEN (v_update_data->>'city')
      ELSE city
    END,
    other_city_name = CASE
      WHEN v_update_data ? 'other_city_name' THEN (v_update_data->>'other_city_name')
      ELSE other_city_name
    END,
    is_custom_city = COALESCE((v_update_data->>'is_custom_city')::boolean, is_custom_city),
    district = COALESCE((v_update_data->>'district'), district),
    state = COALESCE((v_update_data->>'state'), state),
    pin_code = COALESCE((v_update_data->>'pin_code'), pin_code),
    industry = COALESCE((v_update_data->>'industry'), industry),
    activity_type = COALESCE((v_update_data->>'activity_type'), activity_type),
    constitution = COALESCE((v_update_data->>'constitution'), constitution),
    annual_turnover = COALESCE((v_update_data->>'annual_turnover'), annual_turnover),
    number_of_employees = COALESCE((v_update_data->>'number_of_employees'), number_of_employees),
    products_services = COALESCE((v_update_data->>'products_services'), products_services),
    brand_names = COALESCE((v_update_data->>'brand_names'), brand_names),
    website = COALESCE((v_update_data->>'website'), website),
    gst_registered = COALESCE((v_update_data->>'gst_registered'), gst_registered),
    gst_number = COALESCE((v_update_data->>'gst_number'), gst_number),
    pan_company = COALESCE((v_update_data->>'pan_company'), pan_company),
    esic_registered = COALESCE((v_update_data->>'esic_registered'), esic_registered),
    epf_registered = COALESCE((v_update_data->>'epf_registered'), epf_registered),
    alternate_contact_name = COALESCE((v_update_data->>'alternate_contact_name'), alternate_contact_name),
    alternate_mobile = COALESCE((v_update_data->>'alternate_mobile'), alternate_mobile),
    referred_by = COALESCE((v_update_data->>'referred_by'), referred_by),
    profile_photo_url = CASE
      WHEN v_update_data ? 'profile_photo_url' THEN (v_update_data->>'profile_photo_url')
      ELSE profile_photo_url
    END,
    gst_certificate_url = CASE
      WHEN v_update_data ? 'gst_certificate_url'
      THEN (v_update_data->>'gst_certificate_url')
      ELSE gst_certificate_url
    END,
    udyam_certificate_url = CASE
      WHEN v_update_data ? 'udyam_certificate_url'
      THEN (v_update_data->>'udyam_certificate_url')
      ELSE udyam_certificate_url
    END,
    payment_proof_url = CASE
      WHEN v_update_data ? 'payment_proof_url'
      THEN (v_update_data->>'payment_proof_url')
      ELSE payment_proof_url
    END,
    amount_paid = CASE
      WHEN p_is_super_admin AND v_update_data ? 'amount_paid'
      THEN (v_update_data->>'amount_paid')
      ELSE amount_paid
    END,
    payment_date = CASE
      WHEN p_is_super_admin AND v_update_data ? 'payment_date'
      THEN (v_update_data->>'payment_date')::date
      ELSE payment_date
    END,
    payment_mode = CASE
      WHEN p_is_super_admin AND v_update_data ? 'payment_mode'
      THEN (v_update_data->>'payment_mode')
      ELSE payment_mode
    END,
    transaction_id = CASE
      WHEN p_is_super_admin AND v_update_data ? 'transaction_id'
      THEN (v_update_data->>'transaction_id')
      ELSE transaction_id
    END,
    bank_reference = CASE
      WHEN p_is_super_admin AND v_update_data ? 'bank_reference'
      THEN (v_update_data->>'bank_reference')
      ELSE bank_reference
    END,
    last_modified_by = p_requesting_user_id,
    last_modified_at = now()
  WHERE id = p_member_id;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Failed to update member - no rows affected'
    );
  END IF;

  IF v_member_record.user_id IS NOT NULL AND (v_email_changed OR v_mobile_changed) THEN
    BEGIN
      UPDATE users
      SET
        email = CASE
          WHEN v_email_changed THEN v_new_email
          ELSE email
        END,
        mobile_number = CASE
          WHEN v_mobile_changed THEN v_new_mobile
          ELSE mobile_number
        END,
        updated_at = now()
      WHERE id = v_member_record.user_id;

      IF FOUND THEN
        RAISE NOTICE 'Synced credentials to users table for user_id: %', v_member_record.user_id;
        IF v_email_changed THEN
          RAISE NOTICE '  - Email: % -> %', v_member_record.email, v_new_email;
        END IF;
        IF v_mobile_changed THEN
          RAISE NOTICE '  - Mobile: % -> %', v_member_record.mobile_number, v_new_mobile;
        END IF;
      ELSE
        RAISE WARNING 'Failed to sync to users table: user_id % not found', v_member_record.user_id;
        v_users_sync_failed := true;
      END IF;

    EXCEPTION
      WHEN unique_violation THEN
        RAISE WARNING 'Users table sync failed - credential already exists (user_id: %)', v_member_record.user_id;
        v_users_sync_failed := true;
      WHEN OTHERS THEN
        RAISE WARNING 'Users table sync failed: % % (user_id: %)', SQLERRM, SQLSTATE, v_member_record.user_id;
        v_users_sync_failed := true;
    END;
  END IF;

  FOR v_field_key IN SELECT jsonb_object_keys(v_update_data)
  LOOP
    CONTINUE WHEN v_field_key IN ('last_modified_by', 'last_modified_at');

    v_old_value := COALESCE(v_member_jsonb->>v_field_key, '');
    v_new_value := COALESCE(v_update_data->>v_field_key, '');

    IF v_old_value IS DISTINCT FROM v_new_value THEN
      INSERT INTO member_audit_history (
        member_id,
        action_type,
        field_name,
        old_value,
        new_value,
        changed_by,
        created_at
      ) VALUES (
        p_member_id,
        'update',
        v_field_key,
        v_old_value,
        v_new_value,
        p_requesting_user_id,
        now()
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'rows_updated', v_rows_updated,
    'users_sync_warning', v_users_sync_failed
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error in update_member_registration: % %', SQLERRM, SQLSTATE;
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Database error: ' || SQLERRM
    );
END;
$$;

COMMENT ON FUNCTION update_member_registration(uuid, uuid, jsonb, boolean) IS
  'SECURITY DEFINER RPC to update member registrations. Extends admin persistence for GST/UDYAM document URLs and keeps payment proof URL super-admin only, while preserving users-table credential sync.';

GRANT EXECUTE ON FUNCTION update_member_registration(uuid, uuid, jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION update_member_registration(uuid, uuid, jsonb, boolean) TO anon;

DO $$
BEGIN
  RAISE NOTICE '? Extended update_member_registration RPC function for admin document URLs';
  RAISE NOTICE '? gst_certificate_url now persists for authorized admins';
  RAISE NOTICE '? udyam_certificate_url now persists for authorized admins';
  RAISE NOTICE '? payment_proof_url remains super-admin only';
END $$;
