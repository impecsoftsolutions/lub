/*
  # Create admin_soft_delete_member RPC Function

  1. Purpose
    - Replace client-side soft delete with SECURITY DEFINER RPC
    - Bypass RLS issues that block SELECT on rejected registrations
    - Ensure atomic soft delete with proper authorization

  2. Security
    - SECURITY DEFINER to bypass RLS safely
    - Explicit authentication check (user exists and active)
    - Explicit authorization check (super_admin, admin, editor roles)
    - SET search_path to 'public' for SQL injection protection

  3. Functionality
    - Validates all input parameters
    - Checks requesting user's permissions
    - Loads registration data (bypassing RLS)
    - Archives to deleted_members with explicit column mapping
    - Deletes from member_registrations
    - Logs audit trail
    - Returns JSONB response with success status

  4. Returns
    - success: boolean
    - deleted_id: uuid (on success)
    - error: text (on failure)
*/

-- =====================================================================
-- admin_soft_delete_member: move a registration to deleted_members
-- SECURITY DEFINER to bypass RLS safely, with explicit auth checks.
-- Returns: { "success": bool, "deleted_id": uuid, "error"?: text }
-- =====================================================================

create or replace function public.admin_soft_delete_member(
  p_registration_id uuid,
  p_requesting_user_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user record;
  v_is_authorized boolean := false;
  v_mr member_registrations%rowtype;
begin
  -- -------- Validate inputs ----------
  if p_registration_id is null then
    return jsonb_build_object('success', false, 'error', 'registration_id is required');
  end if;
  if p_requesting_user_id is null then
    return jsonb_build_object('success', false, 'error', 'requesting_user_id is required');
  end if;

  -- -------- AuthN: requester exists & active ----------
  select *
    into v_user
  from users
  where id = p_requesting_user_id
    and account_status = 'active';
  if not found then
    return jsonb_build_object('success', false, 'error', 'requesting user not found or inactive');
  end if;

  -- -------- AuthZ: must be super_admin/admin/editor ----------
  if v_user.account_type in ('super_admin','admin','both') then
    v_is_authorized := true;
  else
    select exists(
      select 1 from user_roles
      where user_id = p_requesting_user_id
        and role in ('super_admin','admin','editor')
    ) into v_is_authorized;
  end if;

  if not v_is_authorized then
    return jsonb_build_object('success', false, 'error', 'not authorized to delete members');
  end if;

  -- -------- Load the registration row (RLS bypassed by SECURITY DEFINER) ----------
  select *
    into v_mr
  from member_registrations
  where id = p_registration_id;

  if not found then
    return jsonb_build_object('success', false, 'error', 'registration not found');
  end if;

  -- -------- Archive into deleted_members with EXPLICIT column list ----------
  insert into deleted_members (
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
  ) values (
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
    coalesce(v_mr.is_active, true), v_mr.amount_paid, v_mr.payment_date, v_mr.payment_proof_url, v_mr.payment_mode,
    v_mr.transaction_id, v_mr.bank_reference, v_mr.user_id, v_mr.is_legacy_member, coalesce(v_mr.reapplication_count, 0),
    v_mr.created_at, v_mr.last_modified_by, v_mr.last_modified_at,
    p_requesting_user_id, now(), p_reason
  );

  -- -------- Delete original ----------
  delete from member_registrations where id = p_registration_id;

  -- -------- Audit ----------
  insert into member_audit_history(member_id, action_type, changed_by, change_reason, created_at)
  values (p_registration_id, 'delete', p_requesting_user_id, p_reason, now());

  return jsonb_build_object('success', true, 'deleted_id', p_registration_id);

exception
  when others then
    raise warning 'admin_soft_delete_member error: % %', sqlerrm, sqlstate;
    return jsonb_build_object('success', false, 'error', 'database error: '||sqlerrm);
end;
$$;

grant execute on function public.admin_soft_delete_member(uuid, uuid, text) to authenticated;

comment on function public.admin_soft_delete_member(uuid, uuid, text) is
  'SECURITY DEFINER function to soft-delete a member registration. Bypasses RLS to handle rejected registrations. Validates permissions, archives to deleted_members, deletes original, and logs audit trail.';

-- =====================================================================
-- End
-- =====================================================================
