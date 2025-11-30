/*
  # Add general_user to account_type constraint

  1. Changes
    - Update the CHECK constraint on users.account_type to include 'general_user'
    - 'general_user' represents users who have registered but not yet been approved as members
    - When admin approves membership, account_type changes from 'general_user' to 'member'

  2. Valid account_type values after this migration:
    - 'admin': Admin-only access
    - 'member': Member-only access
    - 'both': Both admin and member access
    - 'general_user': Registered but not yet approved (temporary state)

  3. Security
    - RLS policies already restrict general_user accounts appropriately
    - Only approved members with account_type='member' or 'both' can access member features
*/

-- Drop the existing CHECK constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_account_type_check;

-- Add the new CHECK constraint that includes 'general_user'
ALTER TABLE users ADD CONSTRAINT users_account_type_check
  CHECK (account_type IN ('admin', 'member', 'both', 'general_user'));

-- Update the column comment to document the new value
COMMENT ON COLUMN users.account_type IS 'User type: admin (admin only), member (member only), both (admin + member), general_user (registered but not approved)';
