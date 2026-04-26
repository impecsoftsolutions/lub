/*
  # Roles Catalog, User Permission Overrides, and Manager Role
  Slice: CLAUDE-ROLES-PRIVILEGES-001

  ## Overview
  1. Extend role CHECK constraints to include 'manager'
  2. Create `roles` catalog table (informational metadata per role)
  3. Create `user_permission_overrides` table (per-user explicit grant/revoke)
  4. Seed `portal.admin_access` permission
  5. Seed roles catalog (super_admin, admin, manager, editor, viewer)
  6. Seed manager role permissions
  7. Seed portal.admin_access for admin + manager roles
  8. Update has_permission() with override precedence
  9. Update get_user_permissions() to honour overrides
  10. 14 session-wrapped RPCs for the admin UI

  ## Override precedence
  revoke override > grant override > role permission > deny
*/

-- =============================================================================
-- SECTION 1: Extend role CHECK constraints to include 'manager'
-- =============================================================================

DO $$
DECLARE
  v_constraint text;
BEGIN
  -- user_roles: find and drop the role check constraint
  SELECT con.conname INTO v_constraint
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'user_roles'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) LIKE '%''super_admin''%'
    AND pg_get_constraintdef(con.oid) LIKE '%role%'
  LIMIT 1;

  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.user_roles DROP CONSTRAINT %I', v_constraint);
  END IF;

  ALTER TABLE public.user_roles
    ADD CONSTRAINT user_roles_role_check
    CHECK (role IN ('super_admin', 'admin', 'manager', 'editor', 'viewer'));
END $$;

DO $$
DECLARE
  v_constraint text;
BEGIN
  -- role_permissions: find and drop the role check constraint
  SELECT con.conname INTO v_constraint
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'role_permissions'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) LIKE '%''super_admin''%'
    AND pg_get_constraintdef(con.oid) LIKE '%role%'
  LIMIT 1;

  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.role_permissions DROP CONSTRAINT %I', v_constraint);
  END IF;

  ALTER TABLE public.role_permissions
    ADD CONSTRAINT role_permissions_role_check
    CHECK (role IN ('super_admin', 'admin', 'manager', 'editor', 'viewer'));
END $$;

-- =============================================================================
-- SECTION 2: Create roles catalog table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.roles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text UNIQUE NOT NULL,
  display_name text NOT NULL,
  description  text,
  is_system   boolean DEFAULT true,
  is_active   boolean DEFAULT true,
  sort_order  int DEFAULT 0,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_roles_name ON public.roles(name);
CREATE INDEX IF NOT EXISTS idx_roles_sort ON public.roles(sort_order);

COMMENT ON TABLE public.roles IS 'Catalog of named roles. Informational metadata for the admin UI; actual enforcement uses user_roles.role (text column) and role_permissions.';

-- =============================================================================
-- SECTION 3: Create user_permission_overrides table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.user_permission_overrides (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  permission_code text NOT NULL REFERENCES public.permissions(code) ON DELETE CASCADE,
  override_type   text NOT NULL CHECK (override_type IN ('grant', 'revoke')),
  granted_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reason          text,
  created_at      timestamptz DEFAULT now(),
  CONSTRAINT unique_user_permission_override UNIQUE (user_id, permission_code)
);

CREATE INDEX IF NOT EXISTS idx_upo_user_id ON public.user_permission_overrides(user_id);
CREATE INDEX IF NOT EXISTS idx_upo_permission_code ON public.user_permission_overrides(permission_code);
CREATE INDEX IF NOT EXISTS idx_upo_override_type ON public.user_permission_overrides(override_type);

COMMENT ON TABLE public.user_permission_overrides IS 'Per-user explicit permission grants or revokes that override the role-based defaults. Precedence: revoke > grant > role permission > deny.';

-- =============================================================================
-- SECTION 4: Seed portal.admin_access permission
-- =============================================================================

INSERT INTO public.permissions (code, name, description, category, is_active)
VALUES (
  'portal.admin_access',
  'Portal Admin Access',
  'Grants access to the admin portal. Required for accounts without account_type=admin/both to enter the admin shell.',
  'portal',
  true
)
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- SECTION 5: Seed roles catalog
-- =============================================================================

INSERT INTO public.roles (name, display_name, description, is_system, sort_order) VALUES
  ('super_admin', 'Super Administrator', 'Full system access with all permissions. Cannot be modified.', true, 1),
  ('admin',       'Administrator',       'Full member/location/organisation management. Cannot modify system or user settings.', true, 2),
  ('manager',     'Manager',             'Operational management: members, locations, content. Cannot manage users or system configuration.', true, 3),
  ('editor',      'Editor',              'View and edit access. No delete or admin operations.', true, 4),
  ('viewer',      'Viewer',              'Read-only access to approved content.', true, 5)
ON CONFLICT (name) DO NOTHING;

-- =============================================================================
-- SECTION 6: Seed manager role permissions (standard permissions)
-- =============================================================================

-- Members: all except restore
INSERT INTO public.role_permissions (role, permission_code, granted_by, is_revoked)
SELECT 'manager', code, NULL, false
FROM public.permissions
WHERE code IN (
  'members.view', 'members.view_pending', 'members.view_approved',
  'members.view_rejected', 'members.approve', 'members.reject',
  'members.edit', 'members.delete', 'members.export', 'members.bulk_action'
)
ON CONFLICT DO NOTHING;

-- Locations: all
INSERT INTO public.role_permissions (role, permission_code, granted_by, is_revoked)
SELECT 'manager', code, NULL, false
FROM public.permissions
WHERE code IN (
  'locations.states.view', 'locations.states.manage',
  'locations.districts.view', 'locations.districts.manage',
  'locations.cities.view', 'locations.cities.manage',
  'locations.cities.approve_pending'
)
ON CONFLICT DO NOTHING;

-- Settings: read + directory configure, not payment/forms manage
INSERT INTO public.role_permissions (role, permission_code, granted_by, is_revoked)
SELECT 'manager', code, NULL, false
FROM public.permissions
WHERE code IN (
  'settings.validation.view', 'settings.forms.view',
  'settings.directory.view', 'settings.directory.configure',
  'settings.payment.view'
)
ON CONFLICT DO NOTHING;

-- Organisation: all
INSERT INTO public.role_permissions (role, permission_code, granted_by, is_revoked)
SELECT 'manager', code, NULL, false
FROM public.permissions
WHERE code IN (
  'organization.profile.view', 'organization.profile.edit',
  'organization.designations.view', 'organization.designations.manage'
)
ON CONFLICT DO NOTHING;

-- Users: view only
INSERT INTO public.role_permissions (role, permission_code, granted_by, is_revoked)
SELECT 'manager', code, NULL, false
FROM public.permissions
WHERE code = 'users.view'
ON CONFLICT DO NOTHING;

-- Dashboard
INSERT INTO public.role_permissions (role, permission_code, granted_by, is_revoked)
SELECT 'manager', code, NULL, false
FROM public.permissions
WHERE code = 'dashboard.view'
ON CONFLICT DO NOTHING;

-- Activities (conditional: only if activities permissions exist in this DB)
INSERT INTO public.role_permissions (role, permission_code, granted_by, is_revoked)
SELECT 'manager', code, NULL, false
FROM public.permissions
WHERE code IN (
  'activities.view', 'activities.create',
  'activities.edit_any', 'activities.edit_own',
  'activities.publish', 'activities.archive'
)
  AND is_active = true
ON CONFLICT DO NOTHING;

-- Portal admin access
INSERT INTO public.role_permissions (role, permission_code, granted_by, is_revoked)
VALUES ('manager', 'portal.admin_access', NULL, false)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- SECTION 7: Seed portal.admin_access for admin role
-- =============================================================================

INSERT INTO public.role_permissions (role, permission_code, granted_by, is_revoked)
VALUES ('admin', 'portal.admin_access', NULL, false)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- SECTION 8: Updated has_permission() with override precedence
-- =============================================================================

CREATE OR REPLACE FUNCTION public.has_permission(
  p_user_id       uuid,
  p_permission_code text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_override_type text;
  v_user_role     text;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  -- 1. Explicit per-user override takes highest precedence
  SELECT override_type INTO v_override_type
  FROM user_permission_overrides
  WHERE user_id = p_user_id
    AND permission_code = p_permission_code;

  IF v_override_type = 'revoke' THEN
    RETURN false;
  END IF;

  IF v_override_type = 'grant' THEN
    RETURN true;
  END IF;

  -- 2. Fall through to role-based check
  SELECT role INTO v_user_role
  FROM user_roles
  WHERE user_id = p_user_id
  LIMIT 1;

  IF v_user_role IS NULL THEN
    RETURN false;
  END IF;

  -- 3. system.admin wildcard grants everything
  IF EXISTS (
    SELECT 1
    FROM role_permissions rp
    INNER JOIN permissions p ON p.code = rp.permission_code
    WHERE rp.role = v_user_role
      AND rp.permission_code = 'system.admin'
      AND rp.is_revoked = false
      AND p.is_active = true
  ) THEN
    RETURN true;
  END IF;

  -- 4. Check specific role permission
  RETURN EXISTS (
    SELECT 1
    FROM role_permissions rp
    INNER JOIN permissions p ON p.code = rp.permission_code
    WHERE rp.role = v_user_role
      AND rp.permission_code = p_permission_code
      AND rp.is_revoked = false
      AND p.is_active = true
  );
END;
$$;

COMMENT ON FUNCTION public.has_permission(uuid, text) IS
  'Checks if a user has a permission. Precedence: per-user revoke override > per-user grant override > system.admin wildcard > role permission > deny.';

-- =============================================================================
-- SECTION 9: Updated get_user_permissions() to honour overrides
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_user_permissions(p_user_id uuid)
RETURNS TABLE (
  permission_code        text,
  permission_name        text,
  permission_description text,
  permission_category    text,
  granted_at             timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_role       text;
  v_has_system_admin boolean;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT role INTO v_user_role
  FROM user_roles
  WHERE user_id = p_user_id
  LIMIT 1;

  IF v_user_role IS NULL THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role = v_user_role
      AND rp.permission_code = 'system.admin'
      AND rp.is_revoked = false
  ) INTO v_has_system_admin;

  IF v_has_system_admin THEN
    -- All active permissions minus any explicit revoke overrides
    -- Plus any grant overrides for permissions not in base set (edge case)
    RETURN QUERY
    SELECT p.code, p.name, p.description, p.category, now()
    FROM permissions p
    WHERE p.is_active = true
      AND NOT EXISTS (
        SELECT 1 FROM user_permission_overrides upo
        WHERE upo.user_id = p_user_id
          AND upo.permission_code = p.code
          AND upo.override_type = 'revoke'
      )
    ORDER BY p.category, p.code;
  ELSE
    -- Role permissions minus revoke overrides, union with grant overrides
    RETURN QUERY
    SELECT p.code, p.name, p.description, p.category, rp.granted_at
    FROM role_permissions rp
    INNER JOIN permissions p ON p.code = rp.permission_code
    WHERE rp.role = v_user_role
      AND rp.is_revoked = false
      AND p.is_active = true
      AND NOT EXISTS (
        SELECT 1 FROM user_permission_overrides upo
        WHERE upo.user_id = p_user_id
          AND upo.permission_code = p.code
          AND upo.override_type = 'revoke'
      )
    UNION
    -- Explicit grant overrides not already covered by role
    SELECT p.code, p.name, p.description, p.category, upo.created_at
    FROM user_permission_overrides upo
    INNER JOIN permissions p ON p.code = upo.permission_code
    WHERE upo.user_id = p_user_id
      AND upo.override_type = 'grant'
      AND p.is_active = true
      AND NOT EXISTS (
        SELECT 1 FROM role_permissions rp2
        WHERE rp2.role = v_user_role
          AND rp2.permission_code = upo.permission_code
          AND rp2.is_revoked = false
      )
    ORDER BY permission_category, permission_code;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.get_user_permissions(uuid) IS
  'Returns effective permissions for a user, applying per-user overrides on top of role permissions.';

-- =============================================================================
-- SECTION 10: Session-wrapped RPCs for the Roles & Privileges admin UI
-- =============================================================================

-- ─── 1. list_roles_with_session ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.list_roles_with_session(
  p_session_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
  v_result        jsonb;
BEGIN
  v_actor_user_id := resolve_custom_session_user_id(p_session_token);
  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT has_permission(v_actor_user_id, 'users.view') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  SELECT jsonb_agg(row_to_json(r) ORDER BY r.sort_order)
  INTO v_result
  FROM (
    SELECT
      ro.name,
      ro.display_name,
      ro.description,
      ro.is_system,
      ro.sort_order,
      (
        SELECT COUNT(*) FROM role_permissions rp
        WHERE rp.role = ro.name AND rp.is_revoked = false
      ) AS permission_count,
      (
        SELECT COUNT(*) FROM user_roles ur
        WHERE ur.role = ro.name
      ) AS user_count
    FROM roles ro
    WHERE ro.is_active = true
    ORDER BY ro.sort_order
  ) r;

  RETURN jsonb_build_object('success', true, 'data', COALESCE(v_result, '[]'::jsonb));
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_roles_with_session(text) TO PUBLIC;

-- ─── 2. list_role_permissions_with_session ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.list_role_permissions_with_session(
  p_session_token text,
  p_role_name     text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
  v_result        jsonb;
BEGIN
  v_actor_user_id := resolve_custom_session_user_id(p_session_token);
  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT has_permission(v_actor_user_id, 'users.view') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  SELECT jsonb_agg(row_to_json(r) ORDER BY r.category, r.code)
  INTO v_result
  FROM (
    SELECT
      p.code,
      p.name,
      p.category,
      p.description,
      EXISTS (
        SELECT 1 FROM role_permissions rp
        WHERE rp.role = p_role_name
          AND rp.permission_code = p.code
          AND rp.is_revoked = false
      ) AS is_granted
    FROM permissions p
    WHERE p.is_active = true
    ORDER BY p.category, p.code
  ) r;

  RETURN jsonb_build_object('success', true, 'data', COALESCE(v_result, '[]'::jsonb));
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_role_permissions_with_session(text, text) TO PUBLIC;

-- ─── 3. list_permissions_catalog_with_session ────────────────────────────────

CREATE OR REPLACE FUNCTION public.list_permissions_catalog_with_session(
  p_session_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
  v_result        jsonb;
BEGIN
  v_actor_user_id := resolve_custom_session_user_id(p_session_token);
  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT has_permission(v_actor_user_id, 'users.view') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  SELECT jsonb_agg(row_to_json(r) ORDER BY r.category, r.code)
  INTO v_result
  FROM (
    SELECT code, name, description, category
    FROM permissions
    WHERE is_active = true
    ORDER BY category, code
  ) r;

  RETURN jsonb_build_object('success', true, 'data', COALESCE(v_result, '[]'::jsonb));
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_permissions_catalog_with_session(text) TO PUBLIC;

-- ─── 4. list_users_with_roles_for_admin_with_session ─────────────────────────

CREATE OR REPLACE FUNCTION public.list_users_with_roles_for_admin_with_session(
  p_session_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
  v_result        jsonb;
BEGIN
  v_actor_user_id := resolve_custom_session_user_id(p_session_token);
  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT has_permission(v_actor_user_id, 'users.view') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  SELECT jsonb_agg(row_to_json(r) ORDER BY r.email)
  INTO v_result
  FROM (
    SELECT
      u.id AS user_id,
      u.email,
      u.account_type,
      ur.role,
      ur.id AS role_record_id,
      (
        SELECT COUNT(*) FROM user_permission_overrides upo
        WHERE upo.user_id = u.id
      ) AS override_count
    FROM users u
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    WHERE u.account_type IN ('admin', 'both') OR ur.role IS NOT NULL
    ORDER BY u.email
  ) r;

  RETURN jsonb_build_object('success', true, 'data', COALESCE(v_result, '[]'::jsonb));
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_users_with_roles_for_admin_with_session(text) TO PUBLIC;

-- ─── 5. get_user_permission_overrides_with_session ───────────────────────────

CREATE OR REPLACE FUNCTION public.get_user_permission_overrides_with_session(
  p_session_token    text,
  p_target_user_id   uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
  v_result        jsonb;
BEGIN
  v_actor_user_id := resolve_custom_session_user_id(p_session_token);
  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT has_permission(v_actor_user_id, 'users.view') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  SELECT jsonb_agg(row_to_json(r) ORDER BY r.category, r.permission_code)
  INTO v_result
  FROM (
    SELECT
      upo.id,
      upo.permission_code,
      p.name  AS permission_name,
      p.category,
      upo.override_type,
      upo.reason,
      upo.created_at
    FROM user_permission_overrides upo
    INNER JOIN permissions p ON p.code = upo.permission_code
    WHERE upo.user_id = p_target_user_id
    ORDER BY p.category, upo.permission_code
  ) r;

  RETURN jsonb_build_object('success', true, 'data', COALESCE(v_result, '[]'::jsonb));
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_permission_overrides_with_session(text, uuid) TO PUBLIC;

-- ─── 6. get_user_effective_permissions_with_session ──────────────────────────

CREATE OR REPLACE FUNCTION public.get_user_effective_permissions_with_session(
  p_session_token    text,
  p_target_user_id   uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
  v_result        jsonb;
  v_target_role   text;
  v_has_sa        boolean;
BEGIN
  v_actor_user_id := resolve_custom_session_user_id(p_session_token);
  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT has_permission(v_actor_user_id, 'users.view') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  SELECT role INTO v_target_role FROM user_roles WHERE user_id = p_target_user_id LIMIT 1;
  IF v_target_role IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM role_permissions rp
      WHERE rp.role = v_target_role AND rp.permission_code = 'system.admin' AND rp.is_revoked = false
    ) INTO v_has_sa;
  ELSE
    v_has_sa := false;
  END IF;

  SELECT jsonb_agg(row_to_json(r) ORDER BY r.category, r.code)
  INTO v_result
  FROM (
    -- Role permissions (or all for system.admin), minus revoke overrides
    SELECT p.code, p.name, p.category, 'role' AS source
    FROM (
      SELECT DISTINCT perm.code, perm.name, perm.category
      FROM permissions perm
      WHERE perm.is_active = true
        AND (
          v_has_sa = true
          OR EXISTS (
            SELECT 1 FROM role_permissions rp
            WHERE rp.role = v_target_role
              AND rp.permission_code = perm.code
              AND rp.is_revoked = false
          )
        )
    ) p
    WHERE NOT EXISTS (
      SELECT 1 FROM user_permission_overrides upo
      WHERE upo.user_id = p_target_user_id
        AND upo.permission_code = p.code
        AND upo.override_type = 'revoke'
    )
    UNION
    -- Grant overrides not already in role base
    SELECT p2.code, p2.name, p2.category, 'grant' AS source
    FROM user_permission_overrides upo2
    INNER JOIN permissions p2 ON p2.code = upo2.permission_code
    WHERE upo2.user_id = p_target_user_id
      AND upo2.override_type = 'grant'
      AND p2.is_active = true
      AND NOT (
        v_has_sa = true
        OR EXISTS (
          SELECT 1 FROM role_permissions rp2
          WHERE rp2.role = v_target_role
            AND rp2.permission_code = upo2.permission_code
            AND rp2.is_revoked = false
        )
      )
  ) r;

  RETURN jsonb_build_object('success', true, 'data', COALESCE(v_result, '[]'::jsonb), 'role', v_target_role);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_effective_permissions_with_session(text, uuid) TO PUBLIC;

-- ─── 7. get_roles_metrics_with_session ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_roles_metrics_with_session(
  p_session_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id    uuid;
  v_total_roles      int;
  v_users_overrides  int;
  v_total_overrides  int;
  v_users_per_role   jsonb;
BEGIN
  v_actor_user_id := resolve_custom_session_user_id(p_session_token);
  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT has_permission(v_actor_user_id, 'users.view') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  SELECT COUNT(*) INTO v_total_roles FROM roles WHERE is_active = true;
  SELECT COUNT(DISTINCT user_id) INTO v_users_overrides FROM user_permission_overrides;
  SELECT COUNT(*) INTO v_total_overrides FROM user_permission_overrides;

  SELECT jsonb_object_agg(role, cnt)
  INTO v_users_per_role
  FROM (
    SELECT ur.role, COUNT(*) AS cnt
    FROM user_roles ur
    GROUP BY ur.role
  ) r;

  RETURN jsonb_build_object(
    'success',         true,
    'total_roles',     v_total_roles,
    'users_with_overrides', v_users_overrides,
    'total_overrides', v_total_overrides,
    'users_per_role',  COALESCE(v_users_per_role, '{}'::jsonb)
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_roles_metrics_with_session(text) TO PUBLIC;

-- ─── 8. grant_role_permission_with_session ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.grant_role_permission_with_session(
  p_session_token  text,
  p_role           text,
  p_permission_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
BEGIN
  v_actor_user_id := resolve_custom_session_user_id(p_session_token);
  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT has_permission(v_actor_user_id, 'users.roles.assign') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  IF p_role = 'super_admin' THEN
    RETURN jsonb_build_object('success', false, 'error', 'super_admin permissions cannot be modified');
  END IF;

  -- Clear revoked rows for this (role, permission) pair, then insert active
  DELETE FROM role_permissions
  WHERE role = p_role AND permission_code = p_permission_code AND is_revoked = true;

  INSERT INTO role_permissions (role, permission_code, granted_by, is_revoked)
  VALUES (p_role, p_permission_code, v_actor_user_id, false)
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN foreign_key_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission code does not exist');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.grant_role_permission_with_session(text, text, text) TO PUBLIC;

-- ─── 9. revoke_role_permission_with_session ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.revoke_role_permission_with_session(
  p_session_token   text,
  p_role            text,
  p_permission_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
BEGIN
  v_actor_user_id := resolve_custom_session_user_id(p_session_token);
  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT has_permission(v_actor_user_id, 'users.roles.assign') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  IF p_role = 'super_admin' THEN
    RETURN jsonb_build_object('success', false, 'error', 'super_admin permissions cannot be modified');
  END IF;

  UPDATE role_permissions
  SET is_revoked = true, revoked_at = now(), revoked_by = v_actor_user_id
  WHERE role = p_role AND permission_code = p_permission_code AND is_revoked = false;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission not currently granted to this role');
  END IF;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.revoke_role_permission_with_session(text, text, text) TO PUBLIC;

-- ─── 10. add_user_grant_override_with_session ────────────────────────────────

CREATE OR REPLACE FUNCTION public.add_user_grant_override_with_session(
  p_session_token    text,
  p_target_user_id   uuid,
  p_permission_code  text,
  p_reason           text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
BEGIN
  v_actor_user_id := resolve_custom_session_user_id(p_session_token);
  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT has_permission(v_actor_user_id, 'users.roles.assign') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  INSERT INTO user_permission_overrides (user_id, permission_code, override_type, granted_by, reason)
  VALUES (p_target_user_id, p_permission_code, 'grant', v_actor_user_id, p_reason)
  ON CONFLICT (user_id, permission_code)
  DO UPDATE SET override_type = 'grant', granted_by = v_actor_user_id, reason = p_reason, created_at = now();

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN foreign_key_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'User or permission does not exist');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_user_grant_override_with_session(text, uuid, text, text) TO PUBLIC;

-- ─── 11. add_user_revoke_override_with_session ───────────────────────────────

CREATE OR REPLACE FUNCTION public.add_user_revoke_override_with_session(
  p_session_token    text,
  p_target_user_id   uuid,
  p_permission_code  text,
  p_reason           text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
BEGIN
  v_actor_user_id := resolve_custom_session_user_id(p_session_token);
  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT has_permission(v_actor_user_id, 'users.roles.assign') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  INSERT INTO user_permission_overrides (user_id, permission_code, override_type, granted_by, reason)
  VALUES (p_target_user_id, p_permission_code, 'revoke', v_actor_user_id, p_reason)
  ON CONFLICT (user_id, permission_code)
  DO UPDATE SET override_type = 'revoke', granted_by = v_actor_user_id, reason = p_reason, created_at = now();

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN foreign_key_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'User or permission does not exist');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_user_revoke_override_with_session(text, uuid, text, text) TO PUBLIC;

-- ─── 12. remove_user_permission_override_with_session ────────────────────────

CREATE OR REPLACE FUNCTION public.remove_user_permission_override_with_session(
  p_session_token text,
  p_override_id   uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
BEGIN
  v_actor_user_id := resolve_custom_session_user_id(p_session_token);
  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT has_permission(v_actor_user_id, 'users.roles.assign') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  DELETE FROM user_permission_overrides WHERE id = p_override_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Override not found');
  END IF;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_user_permission_override_with_session(text, uuid) TO PUBLIC;

-- ─── 13. clear_user_permission_overrides_with_session ────────────────────────

CREATE OR REPLACE FUNCTION public.clear_user_permission_overrides_with_session(
  p_session_token    text,
  p_target_user_id   uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
  v_deleted_count int;
BEGIN
  v_actor_user_id := resolve_custom_session_user_id(p_session_token);
  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT has_permission(v_actor_user_id, 'users.roles.assign') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  DELETE FROM user_permission_overrides WHERE user_id = p_target_user_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'deleted_count', v_deleted_count);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.clear_user_permission_overrides_with_session(text, uuid) TO PUBLIC;

-- ─── 14. check_roles_management_access_with_session ──────────────────────────

CREATE OR REPLACE FUNCTION public.check_roles_management_access_with_session(
  p_session_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
  v_user_role     text;
BEGIN
  v_actor_user_id := resolve_custom_session_user_id(p_session_token);
  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  SELECT role INTO v_user_role FROM user_roles WHERE user_id = v_actor_user_id LIMIT 1;

  RETURN jsonb_build_object(
    'success',         true,
    'can_manage',      has_permission(v_actor_user_id, 'users.roles.assign'),
    'can_view',        has_permission(v_actor_user_id, 'users.view'),
    'is_super_admin',  v_user_role = 'super_admin'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_roles_management_access_with_session(text) TO PUBLIC;

-- =============================================================================
-- SECTION 11: Verification summary
-- =============================================================================

DO $$
DECLARE
  v_role_count    int;
  v_override_ct   int;
  v_manager_perms int;
BEGIN
  SELECT COUNT(*) INTO v_role_count FROM roles WHERE is_active = true;
  SELECT COUNT(*) INTO v_override_ct FROM user_permission_overrides;
  SELECT COUNT(*) INTO v_manager_perms FROM role_permissions WHERE role = 'manager' AND is_revoked = false;

  RAISE NOTICE '';
  RAISE NOTICE '=============================================================================';
  RAISE NOTICE 'Roles Catalog & Overrides Migration - CLAUDE-ROLES-PRIVILEGES-001';
  RAISE NOTICE '=============================================================================';
  RAISE NOTICE '  Roles catalog entries:      % (expected: 5)', v_role_count;
  RAISE NOTICE '  user_permission_overrides:  % (expected: 0 at install)', v_override_ct;
  RAISE NOTICE '  Manager permission count:   %', v_manager_perms;
  RAISE NOTICE '';
  RAISE NOTICE '  Tables:   roles, user_permission_overrides';
  RAISE NOTICE '  Updated:  has_permission(), get_user_permissions()';
  RAISE NOTICE '  RPCs (14): list_roles, list_role_permissions, list_permissions_catalog,';
  RAISE NOTICE '             list_users_with_roles_for_admin, get_user_permission_overrides,';
  RAISE NOTICE '             get_user_effective_permissions, get_roles_metrics,';
  RAISE NOTICE '             grant_role_permission, revoke_role_permission,';
  RAISE NOTICE '             add_user_grant_override, add_user_revoke_override,';
  RAISE NOTICE '             remove_user_permission_override, clear_user_permission_overrides,';
  RAISE NOTICE '             check_roles_management_access  (all _with_session)';
  RAISE NOTICE '=============================================================================';
  RAISE NOTICE '';
END $$;
