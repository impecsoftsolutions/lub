/*
  # Create get_member_login_status RPC Function

  1. Purpose
    - Block login for users whose member record is approved but deactivated (is_active = false)
    - Return login status with reason and state information

  2. Function Details
    - Name: get_member_login_status
    - Parameters: p_user_id (uuid)
    - Returns: jsonb { can_login: boolean, reason: text, state: text }
    - Security: SECURITY DEFINER with search_path 'public'

  3. Logic
    - Check if user has approved member record with is_active = false → Block login
    - Check if user has approved member record with is_active = true → Allow login
    - Check if user has pending/rejected/no membership → Allow login (handled by other checks)

  4. Security
    - Read-only access to member_registrations
    - Fails open on error (returns can_login: true)
    - Grants execute to authenticated users
*/

-- ====================================================================
-- RPC: get_member_login_status
-- Purpose: Block login if user has an approved member record that is deactivated.
-- Returns: { can_login: boolean, reason: text, state: text }
-- ====================================================================

create or replace function public.get_member_login_status(
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_has_membership boolean := false;
  v_has_pending boolean := false;
  v_has_rejected boolean := false;
  v_is_approved_active boolean := false;
  v_is_approved_inactive boolean := false;
  v_state text := 'no-membership';
begin
  -- Any membership rows?
  select exists(select 1 from member_registrations mr where mr.user_id = p_user_id)
    into v_has_membership;

  -- Pending?
  select exists(select 1 from member_registrations mr where mr.user_id = p_user_id and mr.status = 'pending')
    into v_has_pending;

  -- Rejected?
  select exists(select 1 from member_registrations mr where mr.user_id = p_user_id and mr.status = 'rejected')
    into v_has_rejected;

  -- Approved active?
  select exists(select 1 from member_registrations mr where mr.user_id = p_user_id and mr.status = 'approved' and mr.is_active = true)
    into v_is_approved_active;

  -- Approved inactive (deactivated)?
  select exists(select 1 from member_registrations mr where mr.user_id = p_user_id and mr.status = 'approved' and mr.is_active = false)
    into v_is_approved_inactive;

  if v_is_approved_inactive then
    v_state := 'approved:inactive';
    return jsonb_build_object('can_login', false, 'reason', 'Your LUB member account is deactivated. Please contact admin.', 'state', v_state);
  elsif v_is_approved_active then
    v_state := 'approved:active';
    return jsonb_build_object('can_login', true, 'reason', null, 'state', v_state);
  elsif v_has_pending then
    v_state := 'pending';
    return jsonb_build_object('can_login', true, 'reason', null, 'state', v_state);
  elsif v_has_rejected then
    v_state := 'rejected';
    return jsonb_build_object('can_login', true, 'reason', null, 'state', v_state);
  else
    -- no membership
    v_state := 'no-membership';
    return jsonb_build_object('can_login', true, 'reason', null, 'state', v_state);
  end if;
exception
  when others then
    raise warning 'get_member_login_status error: % %', sqlerrm, sqlstate;
    return jsonb_build_object('can_login', true, 'reason', null, 'state', 'unknown'); -- fail open
end;
$$;

grant execute on function public.get_member_login_status(uuid) to authenticated;
