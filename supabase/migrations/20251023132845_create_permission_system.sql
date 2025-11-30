/*
  # Permission System Foundation - Phase 1B

  ## Overview
  Creates a granular permission system to replace simple role-based access control.
  Provides 39 permissions across 7 categories mapped to 4 user roles.

  ## Database Objects Created
  1. Tables:
     - permissions: Defines all available permissions (39 records)
     - role_permissions: Maps roles to permissions (soft-delete pattern)

  2. Functions:
     - has_permission(user_id, permission_code): Check specific permission
     - get_user_permissions(user_id): Get all permissions for a user
     - current_user_has_permission(permission_code): Check current user's permission

  ## Permission Categories (39 total)
  - Members (11): View, approve, reject, edit, delete, restore, export, bulk actions
  - Locations (7): State, district, city management and approvals
  - Settings (8): Validation, forms, directory, payment configuration
  - Organization (4): Profile and designation management
  - Users (5): User and role management
  - Audit (2): View and export audit logs
  - Dashboard (1): Basic dashboard access
  - System (1): Super-admin wildcard permission

  ## Role Mappings
  - super_admin: All 39 permissions
  - admin: ~25 permissions (full member/location/org management)
  - editor: ~10 permissions (view and edit, no delete)
  - viewer: ~8 permissions (read-only access)

  ## Security
  - Soft-delete pattern preserves audit trail
  - Helper functions use SECURITY DEFINER with restricted search_path
  - Permission code format enforced via CHECK constraint

  ## Rollback
  To rollback this migration:
    DROP FUNCTION IF EXISTS current_user_has_permission(text);
    DROP FUNCTION IF EXISTS get_user_permissions(uuid);
    DROP FUNCTION IF EXISTS has_permission(uuid, text);
    DROP TABLE IF EXISTS role_permissions CASCADE;
    DROP TABLE IF EXISTS permissions CASCADE;
*/

-- =============================================================================
-- SECTION 1: Create Permissions Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  category text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  CONSTRAINT code_format CHECK (code ~ '^[a-z_]+\.[a-z_]+(\.[a-z_]+)?$')
);

CREATE INDEX IF NOT EXISTS idx_permissions_code ON permissions(code);
CREATE INDEX IF NOT EXISTS idx_permissions_category ON permissions(category);
CREATE INDEX IF NOT EXISTS idx_permissions_is_active ON permissions(is_active);

COMMENT ON TABLE permissions IS 'Defines all available permissions in the system for granular access control. Each permission represents a specific action or access level within the admin panel.';
COMMENT ON COLUMN permissions.code IS 'Unique permission code in format: category.action or category.subcategory.action (e.g., members.view, locations.states.manage)';
COMMENT ON COLUMN permissions.category IS 'High-level category for grouping permissions (members, locations, settings, organization, users, audit, dashboard, system)';
COMMENT ON COLUMN permissions.is_active IS 'Whether this permission is currently active. Inactive permissions are not enforced but kept for historical tracking.';

-- =============================================================================
-- SECTION 2: Create Role-Permissions Junction Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL,
  permission_code text NOT NULL,
  granted_at timestamptz DEFAULT now(),
  granted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  is_revoked boolean DEFAULT false,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES users(id) ON DELETE SET NULL,

  FOREIGN KEY (permission_code) REFERENCES permissions(code) ON DELETE CASCADE,
  CHECK (role IN ('super_admin', 'admin', 'editor', 'viewer')),
  CONSTRAINT valid_revoke_state CHECK (
    (is_revoked = false AND revoked_at IS NULL AND revoked_by IS NULL) OR
    (is_revoked = true AND revoked_at IS NOT NULL)
  )
);

-- Unique constraint: only one active assignment per role-permission pair
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_role_permission
  ON role_permissions(role, permission_code)
  WHERE NOT is_revoked;

CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission ON role_permissions(permission_code);
CREATE INDEX IF NOT EXISTS idx_role_permissions_active ON role_permissions(role, permission_code) WHERE NOT is_revoked;
CREATE INDEX IF NOT EXISTS idx_role_permissions_granted_by ON role_permissions(granted_by) WHERE granted_by IS NOT NULL;

COMMENT ON TABLE role_permissions IS 'Maps which permissions each role has. Uses soft-delete pattern (is_revoked) to preserve audit trail of permission changes.';
COMMENT ON COLUMN role_permissions.granted_by IS 'User who granted this permission. NULL for system-granted permissions from migrations.';
COMMENT ON COLUMN role_permissions.is_revoked IS 'Soft delete flag. When true, permission is revoked but record is kept for audit trail.';

-- =============================================================================
-- SECTION 3: Seed Permissions Data (39 permissions)
-- =============================================================================

-- Insert all permissions with ON CONFLICT DO NOTHING for idempotency
INSERT INTO permissions (code, name, description, category, is_active) VALUES
  -- MEMBERS CATEGORY (11 permissions)
  ('members.view', 'View Members', 'View member list and basic member information', 'members', true),
  ('members.view_pending', 'View Pending Members', 'View members with pending approval status', 'members', true),
  ('members.view_approved', 'View Approved Members', 'View members with approved status', 'members', true),
  ('members.view_rejected', 'View Rejected Members', 'View members with rejected status', 'members', true),
  ('members.approve', 'Approve Members', 'Approve pending member applications', 'members', true),
  ('members.reject', 'Reject Members', 'Reject member applications with reason', 'members', true),
  ('members.edit', 'Edit Members', 'Edit member information and profiles', 'members', true),
  ('members.delete', 'Delete Members', 'Soft-delete member records', 'members', true),
  ('members.restore', 'Restore Deleted Members', 'Restore soft-deleted member records', 'members', true),
  ('members.export', 'Export Members', 'Export member data to CSV or other formats', 'members', true),
  ('members.bulk_action', 'Bulk Member Actions', 'Perform bulk actions on multiple members', 'members', true),

  -- LOCATIONS CATEGORY (7 permissions)
  ('locations.states.view', 'View States', 'View state master data', 'locations', true),
  ('locations.states.manage', 'Manage States', 'Add, edit, and delete states', 'locations', true),
  ('locations.districts.view', 'View Districts', 'View district master data', 'locations', true),
  ('locations.districts.manage', 'Manage Districts', 'Add, edit, and delete districts', 'locations', true),
  ('locations.cities.view', 'View Cities', 'View city master data', 'locations', true),
  ('locations.cities.manage', 'Manage Cities', 'Add, edit, and delete cities', 'locations', true),
  ('locations.cities.approve_pending', 'Approve Pending Cities', 'Approve user-submitted pending cities', 'locations', true),

  -- SETTINGS CATEGORY (8 permissions)
  ('settings.validation.view', 'View Validation Rules', 'View validation rules and patterns', 'settings', true),
  ('settings.validation.manage', 'Manage Validation Rules', 'Create and modify validation rules', 'settings', true),
  ('settings.forms.view', 'View Form Configuration', 'View form field configurations', 'settings', true),
  ('settings.forms.configure', 'Configure Forms', 'Modify form field visibility and requirements', 'settings', true),
  ('settings.directory.view', 'View Directory Settings', 'View directory field visibility settings', 'settings', true),
  ('settings.directory.configure', 'Configure Directory', 'Modify directory field visibility and display', 'settings', true),
  ('settings.payment.view', 'View Payment Settings', 'View payment gateway configuration', 'settings', true),
  ('settings.payment.manage', 'Manage Payment Settings', 'Configure payment gateways and fees', 'settings', true),

  -- ORGANIZATION CATEGORY (4 permissions)
  ('organization.profile.view', 'View Organization Profile', 'View LUB organization profile and details', 'organization', true),
  ('organization.profile.edit', 'Edit Organization Profile', 'Edit organization profile information', 'organization', true),
  ('organization.designations.view', 'View Designations', 'View designation/role master data', 'organization', true),
  ('organization.designations.manage', 'Manage Designations', 'Add, edit, and delete designations', 'organization', true),

  -- USERS CATEGORY (5 permissions)
  ('users.view', 'View Users', 'View admin user list and information', 'users', true),
  ('users.create', 'Create Users', 'Create new admin user accounts', 'users', true),
  ('users.edit', 'Edit Users', 'Edit admin user information', 'users', true),
  ('users.delete', 'Delete Users', 'Delete admin user accounts', 'users', true),
  ('users.roles.assign', 'Assign User Roles', 'Assign and modify user roles', 'users', true),

  -- AUDIT CATEGORY (2 permissions)
  ('audit.view', 'View Audit Logs', 'View member audit history and change logs', 'audit', true),
  ('audit.export', 'Export Audit Logs', 'Export audit logs for compliance', 'audit', true),

  -- DASHBOARD CATEGORY (1 permission)
  ('dashboard.view', 'View Dashboard', 'Access admin dashboard and basic statistics', 'dashboard', true),

  -- SYSTEM CATEGORY (1 permission)
  ('system.admin', 'System Administrator', 'Full system access - grants all permissions', 'system', true)
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- SECTION 4: Seed Role-Permission Mappings
-- =============================================================================

-- SUPER_ADMIN: All 39 permissions (granted_by is NULL = system-granted)
INSERT INTO role_permissions (role, permission_code, granted_by, is_revoked) VALUES
  -- All Members permissions
  ('super_admin', 'members.view', NULL, false),
  ('super_admin', 'members.view_pending', NULL, false),
  ('super_admin', 'members.view_approved', NULL, false),
  ('super_admin', 'members.view_rejected', NULL, false),
  ('super_admin', 'members.approve', NULL, false),
  ('super_admin', 'members.reject', NULL, false),
  ('super_admin', 'members.edit', NULL, false),
  ('super_admin', 'members.delete', NULL, false),
  ('super_admin', 'members.restore', NULL, false),
  ('super_admin', 'members.export', NULL, false),
  ('super_admin', 'members.bulk_action', NULL, false),
  -- All Locations permissions
  ('super_admin', 'locations.states.view', NULL, false),
  ('super_admin', 'locations.states.manage', NULL, false),
  ('super_admin', 'locations.districts.view', NULL, false),
  ('super_admin', 'locations.districts.manage', NULL, false),
  ('super_admin', 'locations.cities.view', NULL, false),
  ('super_admin', 'locations.cities.manage', NULL, false),
  ('super_admin', 'locations.cities.approve_pending', NULL, false),
  -- All Settings permissions
  ('super_admin', 'settings.validation.view', NULL, false),
  ('super_admin', 'settings.validation.manage', NULL, false),
  ('super_admin', 'settings.forms.view', NULL, false),
  ('super_admin', 'settings.forms.configure', NULL, false),
  ('super_admin', 'settings.directory.view', NULL, false),
  ('super_admin', 'settings.directory.configure', NULL, false),
  ('super_admin', 'settings.payment.view', NULL, false),
  ('super_admin', 'settings.payment.manage', NULL, false),
  -- All Organization permissions
  ('super_admin', 'organization.profile.view', NULL, false),
  ('super_admin', 'organization.profile.edit', NULL, false),
  ('super_admin', 'organization.designations.view', NULL, false),
  ('super_admin', 'organization.designations.manage', NULL, false),
  -- All Users permissions
  ('super_admin', 'users.view', NULL, false),
  ('super_admin', 'users.create', NULL, false),
  ('super_admin', 'users.edit', NULL, false),
  ('super_admin', 'users.delete', NULL, false),
  ('super_admin', 'users.roles.assign', NULL, false),
  -- All Audit permissions
  ('super_admin', 'audit.view', NULL, false),
  ('super_admin', 'audit.export', NULL, false),
  -- Dashboard permission
  ('super_admin', 'dashboard.view', NULL, false),
  -- System permission
  ('super_admin', 'system.admin', NULL, false);

-- ADMIN: 25 permissions (full member/location/org management, limited settings)
INSERT INTO role_permissions (role, permission_code, granted_by, is_revoked) VALUES
  -- Members management (all except restore)
  ('admin', 'members.view', NULL, false),
  ('admin', 'members.view_pending', NULL, false),
  ('admin', 'members.view_approved', NULL, false),
  ('admin', 'members.view_rejected', NULL, false),
  ('admin', 'members.approve', NULL, false),
  ('admin', 'members.reject', NULL, false),
  ('admin', 'members.edit', NULL, false),
  ('admin', 'members.delete', NULL, false),
  ('admin', 'members.export', NULL, false),
  ('admin', 'members.bulk_action', NULL, false),
  -- All Locations permissions
  ('admin', 'locations.states.view', NULL, false),
  ('admin', 'locations.states.manage', NULL, false),
  ('admin', 'locations.districts.view', NULL, false),
  ('admin', 'locations.districts.manage', NULL, false),
  ('admin', 'locations.cities.view', NULL, false),
  ('admin', 'locations.cities.manage', NULL, false),
  ('admin', 'locations.cities.approve_pending', NULL, false),
  -- All Organization permissions
  ('admin', 'organization.profile.view', NULL, false),
  ('admin', 'organization.profile.edit', NULL, false),
  ('admin', 'organization.designations.view', NULL, false),
  ('admin', 'organization.designations.manage', NULL, false),
  -- Limited Settings (directory configuration only)
  ('admin', 'settings.directory.view', NULL, false),
  ('admin', 'settings.directory.configure', NULL, false),
  -- User viewing only (cannot manage users)
  ('admin', 'users.view', NULL, false),
  -- Dashboard access
  ('admin', 'dashboard.view', NULL, false);

-- EDITOR: 10 permissions (view and edit, no delete)
INSERT INTO role_permissions (role, permission_code, granted_by, is_revoked) VALUES
  -- Members view and edit
  ('editor', 'members.view', NULL, false),
  ('editor', 'members.edit', NULL, false),
  -- Locations view only
  ('editor', 'locations.states.view', NULL, false),
  ('editor', 'locations.districts.view', NULL, false),
  ('editor', 'locations.cities.view', NULL, false),
  -- Organization view and limited edit
  ('editor', 'organization.profile.view', NULL, false),
  ('editor', 'organization.profile.edit', NULL, false),
  ('editor', 'organization.designations.view', NULL, false),
  -- Settings view only
  ('editor', 'settings.forms.view', NULL, false),
  -- Dashboard access
  ('editor', 'dashboard.view', NULL, false);

-- VIEWER: 8 permissions (read-only access)
INSERT INTO role_permissions (role, permission_code, granted_by, is_revoked) VALUES
  -- Members view only
  ('viewer', 'members.view', NULL, false),
  -- Locations view only
  ('viewer', 'locations.states.view', NULL, false),
  ('viewer', 'locations.districts.view', NULL, false),
  ('viewer', 'locations.cities.view', NULL, false),
  -- Organization view only
  ('viewer', 'organization.profile.view', NULL, false),
  ('viewer', 'organization.designations.view', NULL, false),
  -- Settings view only
  ('viewer', 'settings.validation.view', NULL, false),
  -- Dashboard access
  ('viewer', 'dashboard.view', NULL, false);

-- =============================================================================
-- SECTION 5: Helper Functions
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Function 1: has_permission
-- Check if a specific user has a specific permission
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION has_permission(
  p_user_id uuid,
  p_permission_code text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_permission boolean := false;
  v_user_role text;
BEGIN
  -- Return false if user_id is NULL
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  -- Get user's role from user_roles table
  SELECT role INTO v_user_role
  FROM user_roles
  WHERE user_id = p_user_id
  LIMIT 1;

  -- Return false if user has no role
  IF v_user_role IS NULL THEN
    RETURN false;
  END IF;

  -- Check if user's role has the requested permission (and it's not revoked)
  SELECT EXISTS (
    SELECT 1
    FROM role_permissions rp
    INNER JOIN permissions p ON p.code = rp.permission_code
    WHERE rp.role = v_user_role
      AND rp.permission_code = p_permission_code
      AND rp.is_revoked = false
      AND p.is_active = true
  ) INTO v_has_permission;

  -- Also check if user has system.admin permission (grants everything)
  IF NOT v_has_permission THEN
    SELECT EXISTS (
      SELECT 1
      FROM role_permissions rp
      INNER JOIN permissions p ON p.code = rp.permission_code
      WHERE rp.role = v_user_role
        AND rp.permission_code = 'system.admin'
        AND rp.is_revoked = false
        AND p.is_active = true
    ) INTO v_has_permission;
  END IF;

  RETURN v_has_permission;
END;
$$;

COMMENT ON FUNCTION has_permission(uuid, text) IS
  'Checks if a specific user has a specific permission. Returns true if user has the permission (or system.admin), false otherwise.';

-- -----------------------------------------------------------------------------
-- Function 2: get_user_permissions
-- Get all active permissions for a specific user
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_user_permissions(p_user_id uuid)
RETURNS TABLE (
  permission_code text,
  permission_name text,
  permission_description text,
  permission_category text,
  granted_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_role text;
  v_has_system_admin boolean;
BEGIN
  -- Return empty set if user_id is NULL
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Get user's role
  SELECT role INTO v_user_role
  FROM user_roles
  WHERE user_id = p_user_id
  LIMIT 1;

  -- Return empty set if user has no role
  IF v_user_role IS NULL THEN
    RETURN;
  END IF;

  -- Check if user has system.admin permission
  SELECT EXISTS (
    SELECT 1
    FROM role_permissions rp
    WHERE rp.role = v_user_role
      AND rp.permission_code = 'system.admin'
      AND rp.is_revoked = false
  ) INTO v_has_system_admin;

  -- If user has system.admin, return all active permissions
  IF v_has_system_admin THEN
    RETURN QUERY
    SELECT
      p.code,
      p.name,
      p.description,
      p.category,
      now() as granted_at
    FROM permissions p
    WHERE p.is_active = true
    ORDER BY p.category, p.code;
  ELSE
    -- Otherwise return only the permissions assigned to the user's role
    RETURN QUERY
    SELECT
      p.code,
      p.name,
      p.description,
      p.category,
      rp.granted_at
    FROM role_permissions rp
    INNER JOIN permissions p ON p.code = rp.permission_code
    WHERE rp.role = v_user_role
      AND rp.is_revoked = false
      AND p.is_active = true
    ORDER BY p.category, p.code;
  END IF;
END;
$$;

COMMENT ON FUNCTION get_user_permissions(uuid) IS
  'Returns all active permissions for a user. If user has system.admin, returns all active permissions in the system.';

-- -----------------------------------------------------------------------------
-- Function 3: current_user_has_permission
-- Check if current authenticated user has a specific permission
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION current_user_has_permission(p_permission_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Use current_user_id() function from custom auth system
  RETURN has_permission(current_user_id(), p_permission_code);
END;
$$;

COMMENT ON FUNCTION current_user_has_permission(text) IS
  'Checks if the current authenticated user has a specific permission. Uses current_user_id() from custom auth system.';

-- =============================================================================
-- SECTION 6: Verification and Summary
-- =============================================================================

DO $$
DECLARE
  v_permission_count integer;
  v_super_admin_count integer;
  v_admin_count integer;
  v_editor_count integer;
  v_viewer_count integer;
  v_category_record RECORD;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=============================================================================';
  RAISE NOTICE 'Permission System Migration - Phase 1B';
  RAISE NOTICE '=============================================================================';
  RAISE NOTICE '';

  -- Count permissions
  SELECT COUNT(*) INTO v_permission_count FROM permissions WHERE is_active = true;
  RAISE NOTICE 'Permissions created: % (Expected: 39)', v_permission_count;

  IF v_permission_count != 39 THEN
    RAISE WARNING 'Permission count mismatch! Expected 39, got %', v_permission_count;
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE 'Permissions by Category:';
  RAISE NOTICE '----------------------------------------';

  FOR v_category_record IN (
    SELECT category, COUNT(*) as count
    FROM permissions
    WHERE is_active = true
    GROUP BY category
    ORDER BY category
  ) LOOP
    RAISE NOTICE '  %-15s: % permissions', v_category_record.category, v_category_record.count;
  END LOOP;

  RAISE NOTICE '';
  RAISE NOTICE 'Role-Permission Mappings:';
  RAISE NOTICE '----------------------------------------';

  -- Count role mappings
  SELECT COUNT(*) INTO v_super_admin_count
  FROM role_permissions
  WHERE role = 'super_admin' AND is_revoked = false;

  SELECT COUNT(*) INTO v_admin_count
  FROM role_permissions
  WHERE role = 'admin' AND is_revoked = false;

  SELECT COUNT(*) INTO v_editor_count
  FROM role_permissions
  WHERE role = 'editor' AND is_revoked = false;

  SELECT COUNT(*) INTO v_viewer_count
  FROM role_permissions
  WHERE role = 'viewer' AND is_revoked = false;

  RAISE NOTICE '  super_admin: % permissions (Expected: 39)', v_super_admin_count;
  RAISE NOTICE '  admin:       % permissions (Expected: 25)', v_admin_count;
  RAISE NOTICE '  editor:      % permissions (Expected: 10)', v_editor_count;
  RAISE NOTICE '  viewer:      % permissions (Expected: 8)', v_viewer_count;

  -- Verify counts
  IF v_super_admin_count != 39 THEN
    RAISE WARNING 'super_admin permission count mismatch! Expected 39, got %', v_super_admin_count;
  END IF;

  IF v_admin_count != 25 THEN
    RAISE WARNING 'admin permission count mismatch! Expected 25, got %', v_admin_count;
  END IF;

  IF v_editor_count != 10 THEN
    RAISE WARNING 'editor permission count mismatch! Expected 10, got %', v_editor_count;
  END IF;

  IF v_viewer_count != 8 THEN
    RAISE WARNING 'viewer permission count mismatch! Expected 8, got %', v_viewer_count;
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE 'Helper Functions:';
  RAISE NOTICE '----------------------------------------';
  RAISE NOTICE '  ✓ has_permission(user_id, permission_code)';
  RAISE NOTICE '  ✓ get_user_permissions(user_id)';
  RAISE NOTICE '  ✓ current_user_has_permission(permission_code)';

  RAISE NOTICE '';
  RAISE NOTICE 'Migration Status: COMPLETE';
  RAISE NOTICE '=============================================================================';
  RAISE NOTICE '';
END $$;
