/*
  # Update user_roles valid_roles constraint to include portal_manager

  1. Changes
    - Drop the existing valid_roles check constraint
    - Add new valid_roles check constraint that includes 'portal_manager'
    - Keep all existing allowed roles: super_admin, state_president, state_general_secretary, district_president, district_general_secretary, it_division_head, accounts_head
    - Add new role: portal_manager

  2. Security
    - No changes to RLS policies
    - Maintains all existing constraints and indexes
*/

-- Drop the existing valid_roles constraint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'valid_roles' 
    AND table_name = 'user_roles' 
    AND table_schema = 'public'
  ) THEN
    ALTER TABLE user_roles DROP CONSTRAINT valid_roles;
  END IF;
END $$;

-- Add the updated valid_roles constraint with portal_manager included
ALTER TABLE user_roles 
ADD CONSTRAINT valid_roles 
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