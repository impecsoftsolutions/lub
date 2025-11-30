/*
  # Update user_roles Foreign Keys

  1. Purpose
    - Update user_id to reference new users table
    - Update other tables referencing auth.users

  2. Process
    - Update user_roles table
    - Update form_field_configurations table
    - Update pending_cities_master table
    - Update any audit tables

  3. Safety
    - Foreign keys maintain referential integrity
    - No data loss
*/

-- =============================================
-- Update user_roles table
-- =============================================

-- Step 1: Drop old foreign key constraint
ALTER TABLE user_roles
DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey;

-- Step 2: Add foreign key constraint to new users table
-- Note: user_id values are already correct (we preserved UUIDs)
ALTER TABLE user_roles
ADD CONSTRAINT user_roles_user_id_fkey
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- Verify all user_roles have valid user_id references
DO $$
DECLARE
  orphaned_count integer;
BEGIN
  SELECT COUNT(*) INTO orphaned_count
  FROM user_roles ur
  WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = ur.user_id);

  IF orphaned_count > 0 THEN
    RAISE WARNING '% user_roles records have invalid user_id references', orphaned_count;
  ELSE
    RAISE NOTICE 'All user_roles records have valid user_id references';
  END IF;
END $$;

-- =============================================
-- Update form_field_configurations table
-- =============================================

-- These columns reference admin users who made changes
ALTER TABLE form_field_configurations
DROP CONSTRAINT IF EXISTS form_field_configurations_created_by_fkey,
DROP CONSTRAINT IF EXISTS form_field_configurations_updated_by_fkey;

ALTER TABLE form_field_configurations
ADD CONSTRAINT form_field_configurations_created_by_fkey
FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE form_field_configurations
ADD CONSTRAINT form_field_configurations_updated_by_fkey
FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;

-- =============================================
-- Update pending_cities_master table
-- =============================================

ALTER TABLE pending_cities_master
DROP CONSTRAINT IF EXISTS pending_cities_master_submitted_by_fkey,
DROP CONSTRAINT IF EXISTS pending_cities_master_reviewed_by_fkey;

ALTER TABLE pending_cities_master
ADD CONSTRAINT pending_cities_master_submitted_by_fkey
FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE pending_cities_master
ADD CONSTRAINT pending_cities_master_reviewed_by_fkey
FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL;

-- =============================================
-- Update member_registrations admin tracking columns
-- =============================================

-- These columns track which admin modified the member record
ALTER TABLE member_registrations
DROP CONSTRAINT IF EXISTS member_registrations_last_modified_by_fkey,
DROP CONSTRAINT IF EXISTS member_registrations_first_viewed_by_fkey,
DROP CONSTRAINT IF EXISTS member_registrations_deactivated_by_fkey;

-- Add foreign keys if the columns exist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'member_registrations' AND column_name = 'last_modified_by'
  ) THEN
    ALTER TABLE member_registrations
    ADD CONSTRAINT member_registrations_last_modified_by_fkey
    FOREIGN KEY (last_modified_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'member_registrations' AND column_name = 'first_viewed_by'
  ) THEN
    ALTER TABLE member_registrations
    ADD CONSTRAINT member_registrations_first_viewed_by_fkey
    FOREIGN KEY (first_viewed_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'member_registrations' AND column_name = 'deactivated_by'
  ) THEN
    ALTER TABLE member_registrations
    ADD CONSTRAINT member_registrations_deactivated_by_fkey
    FOREIGN KEY (deactivated_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- =============================================
-- Update member_audit_history table
-- =============================================

ALTER TABLE member_audit_history
DROP CONSTRAINT IF EXISTS member_audit_history_changed_by_fkey;

ALTER TABLE member_audit_history
ADD CONSTRAINT member_audit_history_changed_by_fkey
FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL;

-- =============================================
-- Update deleted_members table
-- =============================================

ALTER TABLE deleted_members
DROP CONSTRAINT IF EXISTS deleted_members_deleted_by_fkey;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deleted_members' AND column_name = 'deleted_by'
  ) THEN
    ALTER TABLE deleted_members
    ADD CONSTRAINT deleted_members_deleted_by_fkey
    FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Log completion
DO $$
BEGIN
  RAISE NOTICE 'All foreign keys updated to reference custom users table';
END $$;

COMMENT ON TABLE users IS
  'Custom authentication table. Replaces auth.users for all user management.';
