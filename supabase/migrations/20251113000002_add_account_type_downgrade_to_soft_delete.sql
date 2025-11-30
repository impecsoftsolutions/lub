/*
  # Add Account Type Downgrade to Soft Delete Member RPC

  1. Purpose
    - When a member registration is soft-deleted, also downgrade the linked user account
    - Changes users.account_type from 'member' to 'general_user'
    - Maintains consistency between registration status and account type

  2. Changes
    - Extend admin_soft_delete_member to update users.account_type after archiving registration
    - Only affects users with account_type='member' (not admin/both)
    - Preserves user account for potential re-registration

  3. Security
    - Uses existing SECURITY DEFINER function authorization
    - Only executes if user_id exists and account_type is 'member'
*/

-- Recreate the function with account_type downgrade logic
CREATE OR REPLACE FUNCTION public.admin_soft_delete_member(
  p_registration_id uuid,
  p_requesting_user_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user record;
  v_is_authorized boolean := false;
  v_mr member_registrations%rowtype;
BEGIN
  -- -------- Validate inputs ----------
  IF p_registration_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'registration_id is required');
  END IF;
  IF p_requesting_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'requesting_user_id is required');
  END IF;

  -- -------- AuthN: requester exists & active ----------
  SELECT *
    INTO v_user
  FROM users
  WHERE id = p_requesting_user_id
    AND account_status = 'active';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'requesting user not found or inactive');
  END IF;

  -- -------- AuthZ: must be super_admin/admin/editor ----------
  IF v_user.account_type IN ('super_admin','admin','both') THEN
    v_is_authorized := true;
  ELSE
    SELECT EXISTS(
      SELECT 1 FROM user_roles
      WHERE user_id = p_requesting_user_id
        AND role IN ('super_admin','admin','editor')
    ) INTO v_is_authorized;
  END IF;

  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized to delete members');
  END IF;

  -- -------- Load the registration row (RLS bypassed by SECURITY DEFINER) ----------
  SELECT *
    INTO v_mr
  FROM member_registrations
  WHERE id = p_registration_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'registration not found');
  END IF;

  -- -------- Archive into deleted_members with EXPLICIT column list ----------
  INSERT INTO deleted_members (
    original_id,
    full_name, email, mobile_number, gender, date_of_birth,
    member_id, company_name, company_designation_id, company_address,
    city, other_city_name, is_custom_city, district, state, pin_code,
    industry, activity_type, constitution, annual_turnover, number_of_employees,
    products_services, brand_names, website,
    gst_registered, gst_number, gst_certificate_url,
    pan_company, esic_registered, epf_registered, udyam_certificate_url,
    alternate_contact_name, alternate_mobile, referred_by,
    profile_photo_url,
    status, rejection_reason, approval_date,
    is_active, amount_paid, payment_date, payment_proof_url, payment_mode,
    transaction_id, bank_reference, user_id, is_legacy_member, reapplication_count,
    created_at, last_modified_by, last_modified_at,
    deleted_by, deleted_at, deletion_reason
  ) VALUES (
    v_mr.id,
    v_mr.full_name, v_mr.email, v_mr.mobile_number, v_mr.gender, v_mr.date_of_birth,
    v_mr.member_id, v_mr.company_name, v_mr.company_designation_id, v_mr.company_address,
    v_mr.city, v_mr.other_city_name, v_mr.is_custom_city, v_mr.district, v_mr.state, v_mr.pin_code,
    v_mr.industry, v_mr.activity_type, v_mr.constitution, v_mr.annual_turnover, v_mr.number_of_employees,
    v_mr.products_services, v_mr.brand_names, v_mr.website,
    v_mr.gst_registered, v_mr.gst_number, v_mr.gst_certificate_url,
    v_mr.pan_company, v_mr.esic_registered, v_mr.epf_registered, v_mr.udyam_certificate_url,
    v_mr.alternate_contact_name, v_mr.alternate_mobile, v_mr.referred_by,
    v_mr.profile_photo_url,
    v_mr.status, v_mr.rejection_reason, v_mr.approval_date,
    COALESCE(v_mr.is_active, true), v_mr.amount_paid, v_mr.payment_date, v_mr.payment_proof_url, v_mr.payment_mode,
    v_mr.transaction_id, v_mr.bank_reference, v_mr.user_id, v_mr.is_legacy_member, COALESCE(v_mr.reapplication_count, 0),
    v_mr.created_at, v_mr.last_modified_by, v_mr.last_modified_at,
    p_requesting_user_id, now(), p_reason
  );

  -- -------- Delete original ----------
  DELETE FROM member_registrations WHERE id = p_registration_id;

  -- -------- Audit ----------
  INSERT INTO member_audit_history(member_id, action_type, changed_by, change_reason, created_at)
  VALUES (p_registration_id, 'delete', p_requesting_user_id, p_reason, now());

  -- -------- Downgrade user account_type if member ----------
  IF v_mr.user_id IS NOT NULL THEN
    UPDATE users
    SET account_type = 'general_user',
        updated_at = now()
    WHERE id = v_mr.user_id
      AND account_type = 'member';
  END IF;

  RETURN jsonb_build_object('success', true, 'deleted_id', p_registration_id);

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'admin_soft_delete_member error: % %', SQLERRM, SQLSTATE;
    RETURN jsonb_build_object('success', false, 'error', 'database error: '||SQLERRM);
END;
$$;

-- Keep existing grant
GRANT EXECUTE ON FUNCTION public.admin_soft_delete_member(uuid, uuid, text) TO authenticated;

-- Update comment
COMMENT ON FUNCTION public.admin_soft_delete_member(uuid, uuid, text) IS
  'SECURITY DEFINER function to soft-delete a member registration. Bypasses RLS to handle rejected registrations. Validates permissions, archives to deleted_members, deletes original, logs audit trail, and downgrades user account_type from member to general_user.';
