/*
  # Add portal_manager to user_roles valid roles

  1. Schema Changes
    - Update the valid_roles CHECK constraint in user_roles table
    - Add 'portal_manager' to the list of valid roles

  2. Existing Roles
    - super_admin, state_president, state_general_secretary
    - district_president, district_general_secretary
    - it_division_head, accounts_head
    - portal_manager (new)
*/

-- Drop the existing constraint
ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS valid_roles;

-- Add the updated constraint with portal_manager
ALTER TABLE user_roles ADD CONSTRAINT valid_roles 
CHECK (role = ANY (ARRAY[
  'super_admin'::text, 
  'state_president'::text, 
  'state_general_secretary'::text, 
  'district_president'::text, 
  'district_general_secretary'::text, 
  'it_division_head'::text, 
  'accounts_head'::text,
  'portal_manager'::text
]));