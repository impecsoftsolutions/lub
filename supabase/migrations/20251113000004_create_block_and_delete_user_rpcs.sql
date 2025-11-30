/*
  # Create Block/Unblock and Delete User RPCs

  1. Purpose
    - Create admin_block_unblock_user for freezing/unfreezing user accounts
    - Create admin_delete_user_by_id for hard-deleting general_user accounts
    - Fix broken BlockUserModal and DeleteUserModal functionality

  2. Security
    - Both SECURITY DEFINER with explicit authorization checks
    - Block/unblock works for all account types
    - Delete only works for account_type='general_user' (safety check)

  3. Features
    - Block: sets is_frozen=true and locks account
    - Unblock: sets is_frozen=false and clears lock
    - Delete: hard deletes user and related sessions/tokens (general_user only)
*/

-- =====================================================================
-- admin_block_unblock_user: Toggle is_frozen status
-- =====================================================================

CREATE OR REPLACE FUNCTION public.admin_block_unblock_user(
  p_user_id uuid,
  p_requesting_user_id uuid,
  p_is_frozen boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_admin boolean := false;
BEGIN
  -- -------- Authorize requester ----------
  SELECT EXISTS(
    SELECT 1
    FROM users u
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    WHERE u.id = p_requesting_user_id
      AND u.account_status = 'active'
      AND (u.account_type IN ('admin','both') OR ur.role IN ('super_admin','admin','editor'))
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  -- -------- Update user frozen status ----------
  UPDATE users
  SET is_frozen = p_is_frozen,
      locked_until = CASE
        WHEN p_is_frozen THEN now() + interval '100 years'
        ELSE NULL
      END,
      updated_at = now()
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'user not found');
  END IF;

  -- -------- End active sessions when blocking ----------
  IF p_is_frozen THEN
    DELETE FROM auth_sessions WHERE user_id = p_user_id;
  END IF;

  RETURN jsonb_build_object('success', true);

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.admin_block_unblock_user(uuid, uuid, boolean) TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.admin_block_unblock_user(uuid, uuid, boolean) IS
  'SECURITY DEFINER function for admins to block or unblock user accounts. Sets is_frozen flag and terminates active sessions when blocking. Used by BlockUserModal.';

-- =====================================================================
-- admin_delete_user_by_id: Hard delete general_user accounts
-- =====================================================================

CREATE OR REPLACE FUNCTION public.admin_delete_user_by_id(
  p_user_id uuid,
  p_requesting_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_admin boolean := false;
  v_account_type text;
BEGIN
  -- -------- Authorize requester ----------
  SELECT EXISTS(
    SELECT 1
    FROM users u
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    WHERE u.id = p_requesting_user_id
      AND u.account_status = 'active'
      AND (u.account_type IN ('admin','both') OR ur.role IN ('super_admin','admin','editor'))
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  -- -------- Check account type (only general_user can be deleted) ----------
  SELECT account_type INTO v_account_type FROM users WHERE id = p_user_id;

  IF v_account_type IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'user not found');
  END IF;

  IF v_account_type <> 'general_user' THEN
    RETURN jsonb_build_object('success', false, 'error', 'only general users can be deleted');
  END IF;

  -- -------- Cleanup related records ----------
  DELETE FROM auth_sessions WHERE user_id = p_user_id;
  DELETE FROM password_reset_tokens WHERE user_id = p_user_id;
  DELETE FROM user_roles WHERE user_id = p_user_id;

  -- -------- Delete user ----------
  DELETE FROM users WHERE id = p_user_id;

  RETURN jsonb_build_object('success', true);

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.admin_delete_user_by_id(uuid, uuid) TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.admin_delete_user_by_id(uuid, uuid) IS
  'SECURITY DEFINER function for admins to hard-delete general_user accounts. Prevents deletion of member/admin accounts. Cleans up sessions, tokens, and roles. Used by DeleteUserModal.';
