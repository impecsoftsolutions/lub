/*
  # Create admin_reorder_lub_roles RPC

  1. Problem
    - Drag-and-drop reordering in Roles Master shows success toast but doesn't persist
    - Current implementation uses direct UPDATE queries blocked by RLS
    - Service: supabase.from('lub_roles_master').update({ display_order })
    - Changes lost on page refresh

  2. Solution
    - Create SECURITY DEFINER RPC to bypass RLS
    - Accepts ordered array of role IDs
    - Updates display_order based on position in array
    - Performs authorization checks (account_type OR user_roles)
    - Returns success/failure with count of updated roles

  3. Authorization
    - Checks users.account_type IN ('admin', 'both', 'super_admin')
    - OR user_roles.role IN ('super_admin', 'admin', 'editor')
    - Requires account_status = 'active'
    - Raises exception if not authorized

  4. Usage
    - Admin drags role from position A to position B
    - UI computes new role ID order
    - Calls RPC with ordered array of UUIDs
    - RPC sets display_order = 1, 2, 3, ... based on array index
    - Changes immediately visible across all features using display_order
*/

-- =============================================================================
-- Drop existing function if it exists (avoid signature conflicts)
-- =============================================================================

DROP FUNCTION IF EXISTS admin_reorder_lub_roles(uuid, uuid[]);

-- =============================================================================
-- Create Reorder RPC
-- =============================================================================

CREATE OR REPLACE FUNCTION admin_reorder_lub_roles(
  p_requesting_user_id uuid,
  p_role_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_authorized boolean := false;
  v_idx integer;
  v_role_id uuid;
  v_updated_count integer := 0;
BEGIN
  -- ==========================================================================
  -- Authorization Check
  -- ==========================================================================
  
  SELECT TRUE
  INTO v_is_authorized
  FROM users u
  WHERE u.id = p_requesting_user_id
    AND u.account_status = 'active'
    AND (
      -- Path A: Direct admin account type
      u.account_type IN ('admin', 'both', 'super_admin')
      OR
      -- Path B: Admin role via user_roles
      EXISTS (
        SELECT 1
        FROM user_roles ur
        WHERE ur.user_id = u.id
          AND ur.role IN ('super_admin', 'admin', 'editor')
      )
    )
  LIMIT 1;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'Authorization failed: User % is not allowed to reorder LUB roles', p_requesting_user_id
      USING ERRCODE = '42501';
  END IF;

  -- ==========================================================================
  -- Validation
  -- ==========================================================================
  
  IF p_role_ids IS NULL OR array_length(p_role_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No role IDs provided for reorder'
      USING ERRCODE = '22023';
  END IF;

  -- ==========================================================================
  -- Update display_order based on index in p_role_ids array
  -- ==========================================================================
  
  v_idx := 1;
  FOREACH v_role_id IN ARRAY p_role_ids LOOP
    UPDATE lub_roles_master
    SET 
      display_order = v_idx,
      updated_at = NOW()
    WHERE id = v_role_id;

    IF FOUND THEN
      v_updated_count := v_updated_count + 1;
    END IF;

    v_idx := v_idx + 1;
  END LOOP;

  -- ==========================================================================
  -- Return Success
  -- ==========================================================================
  
  RETURN jsonb_build_object(
    'success', true,
    'updated_count', v_updated_count,
    'total_roles', array_length(p_role_ids, 1)
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Database error: %s', SQLERRM)
    );
END;
$$;

-- =============================================================================
-- Grant Permissions
-- =============================================================================

GRANT EXECUTE ON FUNCTION admin_reorder_lub_roles(uuid, uuid[]) TO postgres, authenticated, anon;

-- =============================================================================
-- Add Comment
-- =============================================================================

COMMENT ON FUNCTION admin_reorder_lub_roles(uuid, uuid[]) IS
  'Admin-only RPC: Reorders LUB roles by updating display_order based on position in provided array. Performs authorization check. SECURITY DEFINER bypasses RLS. Returns {success: true/false, updated_count: number, error?: string}.';

-- =============================================================================
-- Log Completion
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Created admin_reorder_lub_roles RPC';
  RAISE NOTICE 'Drag-and-drop reordering will now persist to database';
  RAISE NOTICE 'Changes immediately visible in Roles Master, Member Assignments, and Leadership pages';
END $$;

-- =============================================================================
-- End
-- =============================================================================
