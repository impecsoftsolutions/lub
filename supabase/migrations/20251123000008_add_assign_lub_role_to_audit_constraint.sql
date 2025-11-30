/*
  # Add 'assign_lub_role' to member_audit_history Constraint

  1. Issue
    - admin_assign_member_lub_role inserts action_type = 'assign_lub_role'
    - Current constraint only allows: 'update', 'status_change', 'deactivate', 
      'activate', 'delete', 'restore', 'create'
    - Error: "new row for relation member_audit_history violates check 
      constraint member_audit_history_action_type_check"

  2. Solution
    - Drop existing constraint
    - Recreate with all original values PLUS 'assign_lub_role'
    - This allows leadership role assignment audits to be logged

  3. Safety
    - No data changes
    - No impact on existing audit records
    - All existing action types remain valid
*/

-- =====================================================================
-- Extend member_audit_history action_type constraint
-- =====================================================================

-- Drop the existing constraint
ALTER TABLE member_audit_history
  DROP CONSTRAINT IF EXISTS member_audit_history_action_type_check;

-- Recreate constraint with original values plus new leadership action
ALTER TABLE member_audit_history
  ADD CONSTRAINT member_audit_history_action_type_check
  CHECK (
    action_type IN (
      -- Original allowed values
      'update',
      'status_change',
      'deactivate',
      'activate',
      'delete',
      'restore',
      'create',
      -- New value for leadership role assignments
      'assign_lub_role'
    )
  );

-- Add comment explaining the constraint
COMMENT ON CONSTRAINT member_audit_history_action_type_check ON member_audit_history IS
  'Ensures action_type contains valid audit action values. Includes standard CRUD operations (create, update, delete, restore) and status changes (activate, deactivate, status_change), plus leadership role assignments (assign_lub_role).';

-- =====================================================================
-- End
-- =====================================================================
