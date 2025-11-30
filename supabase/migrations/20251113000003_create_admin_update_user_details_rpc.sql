/*
  # Create Admin Update User Details RPC

  1. Purpose
    - Allow admins to update user email, mobile number, and password
    - Password field has NO validation rules (admin override)
    - Replaces missing update_user_details RPC currently called by EditUserModal

  2. Security
    - SECURITY DEFINER to bypass RLS
    - Explicit authorization check (admin/editor/super_admin)
    - All parameters optional except user_id and requesting_user_id

  3. Features
    - Update email (normalized to lowercase)
    - Update mobile number
    - Update password with NO minimum length (admin can set any password)
    - Clear failed login attempts when setting new password
    - Set account_status to active when setting new password
*/

CREATE OR REPLACE FUNCTION public.admin_update_user_details(
  p_user_id uuid,
  p_requesting_user_id uuid,
  p_email text DEFAULT NULL,
  p_mobile_number text DEFAULT NULL,
  p_new_password text DEFAULT NULL
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

  -- -------- Update email if provided ----------
  IF p_email IS NOT NULL THEN
    UPDATE users
    SET email = lower(trim(p_email)),
        updated_at = now()
    WHERE id = p_user_id;
  END IF;

  -- -------- Update mobile number if provided ----------
  IF p_mobile_number IS NOT NULL THEN
    UPDATE users
    SET mobile_number = trim(p_mobile_number),
        updated_at = now()
    WHERE id = p_user_id;
  END IF;

  -- -------- Update password if provided (NO MIN LENGTH CHECK - admin override) ----------
  IF p_new_password IS NOT NULL AND length(p_new_password) >= 1 THEN
    UPDATE users
    SET password_hash = hash_password(p_new_password),
        account_status = 'active',
        failed_login_attempts = 0,
        locked_until = NULL,
        updated_at = now()
    WHERE id = p_user_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'user_id', p_user_id);

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.admin_update_user_details(uuid, uuid, text, text, text) TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.admin_update_user_details(uuid, uuid, text, text, text) IS
  'SECURITY DEFINER function for admins to update user email, mobile, and password. Password has NO validation rules (admin override). Used by Edit User modal in Users management.';
