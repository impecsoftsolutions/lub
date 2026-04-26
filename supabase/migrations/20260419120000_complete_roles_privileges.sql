/*
  # Complete Roles & Privileges - custom roles, FK enforcement, lifecycle, safety
  Slice: CLAUDE-ROLES-PRIVILEGES-COMPLETE-001

  ## Overview
  1. Drop CHECK constraints on user_roles.role and role_permissions.role
  2. Add text FK from both columns -> roles.name (ON UPDATE CASCADE, ON DELETE RESTRICT)
  3. Add roles.is_paused, roles.created_by columns
  4. Seed portal.admin_access for editor + viewer roles
  5. Update has_permission() and get_user_permissions() to skip paused roles
  6. Normalise legacy wrappers (add_user_role, update_user_role, remove_user_role)
     to all use the single 'users.roles.assign' permission
  7. New RPCs (all _with_session, all 'users.roles.assign'):
       - create_role
       - update_role
       - clone_role
       - pause_role / unpause_role
       - delete_role
       - assign_user_role        (assign to user with no current role)
       - change_user_role        (change an existing role record)
       - remove_user_role_safe   (remove with last-super-admin + self-lock guards)
       - search_users_for_role_assignment   (smart search by email/mobile/name)
  8. Server-side safety guards:
       - super_admin role cannot be modified, paused, deleted
       - Cannot delete a role that still has users assigned
       - Cannot remove the last super_admin assignment
       - Cannot remove your own super_admin role (self-lock)
       - Custom roles get NO implicit portal.admin_access on creation
*/

-- =============================================================================
-- SECTION 1: Drop CHECK constraints on user_roles.role and role_permissions.role
-- =============================================================================

DO $$
DECLARE
  v_constraint text;
BEGIN
  -- user_roles
  FOR v_constraint IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'user_roles'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%role%'
      AND pg_get_constraintdef(con.oid) ILIKE '%CHECK%'
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.user_roles DROP CONSTRAINT %I', v_constraint);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;

  -- role_permissions
  FOR v_constraint IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'role_permissions'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%role%IN%'
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.role_permissions DROP CONSTRAINT %I', v_constraint);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $$;

-- =============================================================================
-- SECTION 2: Add roles.is_paused and roles.created_by columns
-- =============================================================================

ALTER TABLE public.roles
  ADD COLUMN IF NOT EXISTS is_paused boolean NOT NULL DEFAULT false;

ALTER TABLE public.roles
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_roles_is_paused ON public.roles(is_paused);

COMMENT ON COLUMN public.roles.is_paused IS
  'When true, users assigned to this role contribute zero effective permissions until unpaused. Cannot be true for super_admin.';
COMMENT ON COLUMN public.roles.created_by IS
  'User who created a custom role. NULL for system-seeded roles.';

-- =============================================================================
-- SECTION 3: Add FK from user_roles.role and role_permissions.role -> roles.name
-- =============================================================================

-- Backfill safety: any rows in user_roles with role names not in roles catalog
-- would block FK creation. We surface a notice rather than silently dropping data.
DO $$
DECLARE
  v_orphan_users    int;
  v_orphan_perms    int;
BEGIN
  SELECT COUNT(*) INTO v_orphan_users
  FROM public.user_roles ur
  WHERE ur.role IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.roles r WHERE r.name = ur.role);

  SELECT COUNT(*) INTO v_orphan_perms
  FROM public.role_permissions rp
  WHERE NOT EXISTS (SELECT 1 FROM public.roles r WHERE r.name = rp.role);

  IF v_orphan_users > 0 THEN
    RAISE NOTICE 'WARNING: % user_roles rows reference role names not in roles catalog. FK will fail.', v_orphan_users;
  END IF;
  IF v_orphan_perms > 0 THEN
    RAISE NOTICE 'WARNING: % role_permissions rows reference role names not in roles catalog. FK will fail.', v_orphan_perms;
  END IF;
END $$;

-- Add FK on user_roles.role
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_roles_role_fkey'
  ) THEN
    ALTER TABLE public.user_roles
      ADD CONSTRAINT user_roles_role_fkey
      FOREIGN KEY (role) REFERENCES public.roles(name)
      ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

-- Add FK on role_permissions.role
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'role_permissions_role_fkey'
  ) THEN
    ALTER TABLE public.role_permissions
      ADD CONSTRAINT role_permissions_role_fkey
      FOREIGN KEY (role) REFERENCES public.roles(name)
      ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

-- =============================================================================
-- SECTION 4: Seed portal.admin_access for editor + viewer
-- =============================================================================

INSERT INTO public.role_permissions (role, permission_code, granted_by, is_revoked)
VALUES
  ('editor', 'portal.admin_access', NULL, false),
  ('viewer', 'portal.admin_access', NULL, false)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- SECTION 5: Updated has_permission() honouring paused roles
-- =============================================================================

CREATE OR REPLACE FUNCTION public.has_permission(
  p_user_id         uuid,
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
  v_role_paused   boolean;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  -- 1. Per-user override has highest precedence (revoke > grant)
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

  -- 2. Resolve user's role and pause state
  SELECT ur.role, COALESCE(r.is_paused, false)
    INTO v_user_role, v_role_paused
  FROM user_roles ur
  LEFT JOIN roles r ON r.name = ur.role
  WHERE ur.user_id = p_user_id
  LIMIT 1;

  IF v_user_role IS NULL THEN
    RETURN false;
  END IF;

  -- Paused role contributes zero permissions (overrides above already handled)
  IF v_role_paused THEN
    RETURN false;
  END IF;

  -- 3. system.admin wildcard grants everything (active role only)
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
  'Checks if a user has a permission. Precedence: per-user revoke > per-user grant > paused role (deny) > system.admin wildcard > role permission > deny.';

-- =============================================================================
-- SECTION 6: Updated get_user_permissions() honouring paused roles
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
  v_user_role        text;
  v_has_system_admin boolean;
  v_role_paused      boolean;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT ur.role, COALESCE(r.is_paused, false)
    INTO v_user_role, v_role_paused
  FROM user_roles ur
  LEFT JOIN roles r ON r.name = ur.role
  WHERE ur.user_id = p_user_id
  LIMIT 1;

  IF v_user_role IS NULL THEN
    RETURN;
  END IF;

  -- Paused role: only grant overrides survive, role permissions suppressed
  IF v_role_paused THEN
    RETURN QUERY
    SELECT p.code, p.name, p.description, p.category, upo.created_at
    FROM user_permission_overrides upo
    INNER JOIN permissions p ON p.code = upo.permission_code
    WHERE upo.user_id = p_user_id
      AND upo.override_type = 'grant'
      AND p.is_active = true
    ORDER BY p.category, p.code;
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role = v_user_role
      AND rp.permission_code = 'system.admin'
      AND rp.is_revoked = false
  ) INTO v_has_system_admin;

  IF v_has_system_admin THEN
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
  'Returns effective permissions for a user. Paused roles contribute zero role permissions; only grant overrides survive a paused role.';

-- =============================================================================
-- SECTION 7: Normalise legacy user-role mutation wrappers to users.roles.assign
-- =============================================================================

-- add_user_role_with_session: was users.create -> users.roles.assign
CREATE OR REPLACE FUNCTION public.add_user_role_with_session(
  p_session_token text,
  p_user_id uuid,
  p_role text,
  p_is_member_linked boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
BEGIN
  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);

  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT public.has_permission(v_actor_user_id, 'users.roles.assign') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User ID is required');
  END IF;

  IF p_role IS NULL OR trim(p_role) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Role is required');
  END IF;

  -- Validate role exists in roles catalog (FK will also enforce, but this returns a clean error)
  IF NOT EXISTS (SELECT 1 FROM public.roles WHERE name = trim(p_role)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Role does not exist in roles catalog');
  END IF;

  INSERT INTO public.user_roles (
    user_id,
    role,
    is_member_linked,
    updated_at
  )
  VALUES (
    p_user_id,
    trim(p_role),
    COALESCE(p_is_member_linked, false),
    now()
  );

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'Role already assigned for this scope');
  WHEN foreign_key_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'Role does not exist in roles catalog');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_user_role_with_session(text, uuid, text, boolean) TO PUBLIC;

-- update_user_role_with_session: already used users.roles.assign, refresh body to validate role catalog
CREATE OR REPLACE FUNCTION public.update_user_role_with_session(
  p_session_token text,
  p_role_id uuid,
  p_updates jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
  v_new_role      text;
BEGIN
  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);

  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT public.has_permission(v_actor_user_id, 'users.roles.assign') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  IF p_role_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Role ID is required');
  END IF;

  IF p_updates IS NULL OR p_updates = '{}'::jsonb THEN
    RETURN jsonb_build_object('success', false, 'error', 'Updates payload is required');
  END IF;

  -- Validate target role exists if provided
  v_new_role := NULLIF(trim(p_updates->>'role'), '');
  IF v_new_role IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.roles WHERE name = v_new_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Role does not exist in roles catalog');
  END IF;

  UPDATE public.user_roles
  SET
    role = COALESCE(v_new_role, role),
    state = CASE
      WHEN p_updates ? 'state' THEN NULLIF(trim(p_updates->>'state'), '')
      ELSE state
    END,
    district = CASE
      WHEN p_updates ? 'district' THEN NULLIF(trim(p_updates->>'district'), '')
      ELSE district
    END,
    is_member_linked = CASE
      WHEN p_updates ? 'is_member_linked' THEN (p_updates->>'is_member_linked')::boolean
      ELSE is_member_linked
    END,
    updated_at = now()
  WHERE id = p_role_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User role not found');
  END IF;

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'Role already assigned for this scope');
  WHEN foreign_key_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'Role does not exist in roles catalog');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_user_role_with_session(text, uuid, jsonb) TO PUBLIC;

-- remove_user_role_with_session: was users.delete -> users.roles.assign
-- NOTE: this remains a thin remover used by legacy paths. The new safe remover
-- (remove_user_role_safe_with_session) below adds last-super-admin + self-lock guards.
CREATE OR REPLACE FUNCTION public.remove_user_role_with_session(
  p_session_token text,
  p_role_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
  v_target_user_id uuid;
  v_target_role    text;
  v_super_admin_count int;
BEGIN
  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);

  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT public.has_permission(v_actor_user_id, 'users.roles.assign') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  IF p_role_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Role ID is required');
  END IF;

  SELECT user_id, role
    INTO v_target_user_id, v_target_role
  FROM public.user_roles
  WHERE id = p_role_id;

  IF v_target_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User role not found');
  END IF;

  -- Self-lock guard: actor cannot remove their own super_admin role
  IF v_target_user_id = v_actor_user_id AND v_target_role = 'super_admin' THEN
    RETURN jsonb_build_object('success', false, 'error', 'You cannot remove your own super_admin role');
  END IF;

  -- Last-super-admin guard
  IF v_target_role = 'super_admin' THEN
    SELECT COUNT(*) INTO v_super_admin_count FROM public.user_roles WHERE role = 'super_admin';
    IF v_super_admin_count <= 1 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Cannot remove the last super_admin');
    END IF;
  END IF;

  DELETE FROM public.user_roles WHERE id = p_role_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User role not found');
  END IF;

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_user_role_with_session(text, uuid) TO PUBLIC;

-- =============================================================================
-- SECTION 8: Custom role lifecycle RPCs
-- =============================================================================

-- ─── create_role_with_session ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_role_with_session(
  p_session_token text,
  p_name          text,
  p_display_name  text,
  p_description   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
  v_normalized    text;
  v_max_sort      int;
BEGIN
  v_actor_user_id := resolve_custom_session_user_id(p_session_token);
  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT has_permission(v_actor_user_id, 'users.roles.assign') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  IF p_name IS NULL OR trim(p_name) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Role name is required');
  END IF;
  IF p_display_name IS NULL OR trim(p_display_name) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Display name is required');
  END IF;

  -- Normalise machine name: lowercase, strip whitespace, replace spaces with underscores
  v_normalized := lower(regexp_replace(trim(p_name), '\s+', '_', 'g'));

  IF v_normalized !~ '^[a-z][a-z0-9_]*$' THEN
    RETURN jsonb_build_object('success', false,
      'error', 'Role name must start with a letter and contain only lowercase letters, digits, and underscores');
  END IF;

  -- Reserved system role names cannot be reused
  IF v_normalized IN ('super_admin', 'admin', 'manager', 'editor', 'viewer') THEN
    RETURN jsonb_build_object('success', false, 'error', 'This name is reserved for a system role');
  END IF;

  IF EXISTS (SELECT 1 FROM roles WHERE name = v_normalized) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Role with this name already exists');
  END IF;

  SELECT COALESCE(MAX(sort_order), 0) INTO v_max_sort FROM roles;

  INSERT INTO roles (name, display_name, description, is_system, is_active, is_paused, sort_order, created_by)
  VALUES (v_normalized, trim(p_display_name), NULLIF(trim(p_description), ''), false, true, false, v_max_sort + 1, v_actor_user_id);

  RETURN jsonb_build_object('success', true, 'name', v_normalized);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'Role with this name already exists');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_role_with_session(text, text, text, text) TO PUBLIC;

-- ─── update_role_with_session ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_role_with_session(
  p_session_token text,
  p_role_name     text,
  p_display_name  text DEFAULT NULL,
  p_description   text DEFAULT NULL
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

  IF p_role_name IS NULL OR trim(p_role_name) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Role name is required');
  END IF;

  IF p_role_name = 'super_admin' THEN
    RETURN jsonb_build_object('success', false, 'error', 'super_admin cannot be modified');
  END IF;

  UPDATE roles
  SET
    display_name = COALESCE(NULLIF(trim(p_display_name), ''), display_name),
    description  = CASE
      WHEN p_description IS NULL THEN description
      ELSE NULLIF(trim(p_description), '')
    END,
    updated_at   = now()
  WHERE name = p_role_name;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Role not found');
  END IF;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_role_with_session(text, text, text, text) TO PUBLIC;

-- ─── clone_role_with_session ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.clone_role_with_session(
  p_session_token text,
  p_source_role   text,
  p_new_name      text,
  p_new_display   text,
  p_new_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
  v_normalized    text;
  v_max_sort      int;
  v_copied        int;
BEGIN
  v_actor_user_id := resolve_custom_session_user_id(p_session_token);
  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT has_permission(v_actor_user_id, 'users.roles.assign') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  IF p_source_role IS NULL OR p_new_name IS NULL OR p_new_display IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Source role, new name, and display name are required');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM roles WHERE name = p_source_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Source role does not exist');
  END IF;

  v_normalized := lower(regexp_replace(trim(p_new_name), '\s+', '_', 'g'));

  IF v_normalized !~ '^[a-z][a-z0-9_]*$' THEN
    RETURN jsonb_build_object('success', false,
      'error', 'Role name must start with a letter and contain only lowercase letters, digits, and underscores');
  END IF;

  IF v_normalized IN ('super_admin', 'admin', 'manager', 'editor', 'viewer') THEN
    RETURN jsonb_build_object('success', false, 'error', 'This name is reserved for a system role');
  END IF;

  IF EXISTS (SELECT 1 FROM roles WHERE name = v_normalized) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Role with this name already exists');
  END IF;

  SELECT COALESCE(MAX(sort_order), 0) INTO v_max_sort FROM roles;

  INSERT INTO roles (name, display_name, description, is_system, is_active, is_paused, sort_order, created_by)
  VALUES (v_normalized, trim(p_new_display), NULLIF(trim(p_new_description), ''), false, true, false, v_max_sort + 1, v_actor_user_id);

  -- Copy the source role's active permissions to the new role
  INSERT INTO role_permissions (role, permission_code, granted_by, is_revoked)
  SELECT v_normalized, rp.permission_code, v_actor_user_id, false
  FROM role_permissions rp
  WHERE rp.role = p_source_role
    AND rp.is_revoked = false
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_copied = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'name', v_normalized, 'permissions_copied', v_copied);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'Role with this name already exists');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.clone_role_with_session(text, text, text, text, text) TO PUBLIC;

-- ─── pause_role_with_session ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pause_role_with_session(
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
BEGIN
  v_actor_user_id := resolve_custom_session_user_id(p_session_token);
  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT has_permission(v_actor_user_id, 'users.roles.assign') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  IF p_role_name = 'super_admin' THEN
    RETURN jsonb_build_object('success', false, 'error', 'super_admin cannot be paused');
  END IF;

  UPDATE roles
  SET is_paused = true, updated_at = now()
  WHERE name = p_role_name;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Role not found');
  END IF;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.pause_role_with_session(text, text) TO PUBLIC;

-- ─── unpause_role_with_session ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.unpause_role_with_session(
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
BEGIN
  v_actor_user_id := resolve_custom_session_user_id(p_session_token);
  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT has_permission(v_actor_user_id, 'users.roles.assign') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  UPDATE roles
  SET is_paused = false, updated_at = now()
  WHERE name = p_role_name;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Role not found');
  END IF;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.unpause_role_with_session(text, text) TO PUBLIC;

-- ─── delete_role_with_session ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_role_with_session(
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
  v_is_system     boolean;
  v_assigned      int;
BEGIN
  v_actor_user_id := resolve_custom_session_user_id(p_session_token);
  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT has_permission(v_actor_user_id, 'users.roles.assign') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  IF p_role_name = 'super_admin' THEN
    RETURN jsonb_build_object('success', false, 'error', 'super_admin cannot be deleted');
  END IF;

  SELECT is_system INTO v_is_system FROM roles WHERE name = p_role_name;

  IF v_is_system IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Role not found');
  END IF;

  IF v_is_system THEN
    RETURN jsonb_build_object('success', false, 'error', 'System roles cannot be deleted');
  END IF;

  SELECT COUNT(*) INTO v_assigned FROM user_roles WHERE role = p_role_name;
  IF v_assigned > 0 THEN
    RETURN jsonb_build_object('success', false,
      'error', format('Cannot delete: %s user(s) are still assigned to this role. Reassign them first.', v_assigned));
  END IF;

  -- Cleanly remove permissions associated with this role first (FK ON DELETE RESTRICT on user_roles otherwise blocks)
  DELETE FROM role_permissions WHERE role = p_role_name;
  DELETE FROM roles WHERE name = p_role_name;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_role_with_session(text, text) TO PUBLIC;

-- =============================================================================
-- SECTION 9: User-role assignment lifecycle RPCs (assign / change / remove)
-- =============================================================================

-- ─── assign_user_role_with_session ───────────────────────────────────────────
-- Assigns a role to a user that has no current role row.
CREATE OR REPLACE FUNCTION public.assign_user_role_with_session(
  p_session_token  text,
  p_target_user_id uuid,
  p_role_name      text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
  v_existing_id   uuid;
BEGIN
  v_actor_user_id := resolve_custom_session_user_id(p_session_token);
  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT has_permission(v_actor_user_id, 'users.roles.assign') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  IF p_target_user_id IS NULL OR p_role_name IS NULL OR trim(p_role_name) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target user and role are required');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_target_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target user not found');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM roles WHERE name = p_role_name) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Role does not exist');
  END IF;

  SELECT id INTO v_existing_id FROM user_roles WHERE user_id = p_target_user_id LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false,
      'error', 'User already has a role. Use change_user_role to replace it.');
  END IF;

  INSERT INTO user_roles (user_id, role, is_member_linked, updated_at)
  VALUES (p_target_user_id, p_role_name, false, now());

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'Role already assigned for this user');
  WHEN foreign_key_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'Role or user does not exist');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_user_role_with_session(text, uuid, text) TO PUBLIC;

-- ─── change_user_role_with_session ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.change_user_role_with_session(
  p_session_token  text,
  p_role_record_id uuid,
  p_new_role_name  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id    uuid;
  v_target_user_id   uuid;
  v_current_role     text;
  v_super_admin_count int;
BEGIN
  v_actor_user_id := resolve_custom_session_user_id(p_session_token);
  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT has_permission(v_actor_user_id, 'users.roles.assign') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  IF p_role_record_id IS NULL OR p_new_role_name IS NULL OR trim(p_new_role_name) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Role record and new role are required');
  END IF;

  SELECT user_id, role INTO v_target_user_id, v_current_role
  FROM user_roles WHERE id = p_role_record_id;

  IF v_target_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User role not found');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM roles WHERE name = p_new_role_name) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target role does not exist');
  END IF;

  IF v_current_role = p_new_role_name THEN
    RETURN jsonb_build_object('success', true, 'note', 'No change');
  END IF;

  -- Self-lock guard: actor cannot demote themselves out of super_admin
  IF v_target_user_id = v_actor_user_id AND v_current_role = 'super_admin' THEN
    RETURN jsonb_build_object('success', false, 'error', 'You cannot change your own super_admin role');
  END IF;

  -- Last-super-admin guard: cannot demote the last super_admin
  IF v_current_role = 'super_admin' THEN
    SELECT COUNT(*) INTO v_super_admin_count FROM user_roles WHERE role = 'super_admin';
    IF v_super_admin_count <= 1 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Cannot change role: this is the last super_admin');
    END IF;
  END IF;

  UPDATE user_roles
  SET role = p_new_role_name, updated_at = now()
  WHERE id = p_role_record_id;

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'Role already assigned for this scope');
  WHEN foreign_key_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'Role does not exist in roles catalog');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.change_user_role_with_session(text, uuid, text) TO PUBLIC;

-- ─── remove_user_role_safe_with_session ──────────────────────────────────────
-- Same as remove_user_role_with_session but a stable named entry point that
-- the new Roles & Privileges page uses. Both funnel through the same guards.
CREATE OR REPLACE FUNCTION public.remove_user_role_safe_with_session(
  p_session_token  text,
  p_role_record_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id    uuid;
  v_target_user_id   uuid;
  v_target_role      text;
  v_super_admin_count int;
BEGIN
  v_actor_user_id := resolve_custom_session_user_id(p_session_token);
  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT has_permission(v_actor_user_id, 'users.roles.assign') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  SELECT user_id, role INTO v_target_user_id, v_target_role
  FROM user_roles WHERE id = p_role_record_id;

  IF v_target_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User role not found');
  END IF;

  IF v_target_user_id = v_actor_user_id AND v_target_role = 'super_admin' THEN
    RETURN jsonb_build_object('success', false, 'error', 'You cannot remove your own super_admin role');
  END IF;

  IF v_target_role = 'super_admin' THEN
    SELECT COUNT(*) INTO v_super_admin_count FROM user_roles WHERE role = 'super_admin';
    IF v_super_admin_count <= 1 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Cannot remove the last super_admin');
    END IF;
  END IF;

  DELETE FROM user_roles WHERE id = p_role_record_id;
  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_user_role_safe_with_session(text, uuid) TO PUBLIC;

-- =============================================================================
-- SECTION 10: search_users_for_role_assignment_with_session (smart search)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.search_users_for_role_assignment_with_session(
  p_session_token text,
  p_query         text,
  p_limit         int DEFAULT 25
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
  v_q             text;
  v_pattern       text;
  v_limit         int;
  v_result        jsonb;
BEGIN
  v_actor_user_id := resolve_custom_session_user_id(p_session_token);
  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT has_permission(v_actor_user_id, 'users.view') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  v_q := COALESCE(trim(p_query), '');
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100);

  IF v_q = '' THEN
    -- Return recent admin-typed users with no role assigned, plus any users with active assignments
    SELECT jsonb_agg(row_to_json(r) ORDER BY r.email) INTO v_result
    FROM (
      SELECT
        u.id AS user_id,
        u.email,
        u.mobile_number,
        u.account_type,
        ur.role        AS current_role,
        ur.id          AS role_record_id,
        mr.full_name,
        mr.company_name
      FROM users u
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      LEFT JOIN LATERAL (
        SELECT mr1.full_name, mr1.company_name
        FROM member_registrations mr1
        WHERE mr1.email = u.email
        ORDER BY mr1.created_at DESC
        LIMIT 1
      ) mr ON true
      WHERE u.account_type IN ('admin', 'both') OR ur.role IS NOT NULL
      ORDER BY u.email
      LIMIT v_limit
    ) r;
  ELSE
    v_pattern := '%' || lower(v_q) || '%';
    SELECT jsonb_agg(row_to_json(r) ORDER BY r.email) INTO v_result
    FROM (
      SELECT
        u.id AS user_id,
        u.email,
        u.mobile_number,
        u.account_type,
        ur.role        AS current_role,
        ur.id          AS role_record_id,
        mr.full_name,
        mr.company_name
      FROM users u
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      LEFT JOIN LATERAL (
        SELECT mr1.full_name, mr1.company_name
        FROM member_registrations mr1
        WHERE mr1.email = u.email
        ORDER BY mr1.created_at DESC
        LIMIT 1
      ) mr ON true
      WHERE
        lower(COALESCE(u.email, ''))         LIKE v_pattern
        OR lower(COALESCE(u.mobile_number, '')) LIKE v_pattern
        OR lower(COALESCE(mr.full_name, ''))    LIKE v_pattern
        OR lower(COALESCE(mr.company_name, '')) LIKE v_pattern
      ORDER BY u.email
      LIMIT v_limit
    ) r;
  END IF;

  RETURN jsonb_build_object('success', true, 'data', COALESCE(v_result, '[]'::jsonb));
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_users_for_role_assignment_with_session(text, text, int) TO PUBLIC;

-- =============================================================================
-- SECTION 11: Refresh list_roles_with_session to expose pause + custom flags
-- =============================================================================

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
      ro.is_paused,
      ro.sort_order,
      ro.created_by,
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

-- =============================================================================
-- SECTION 12: Verification summary
-- =============================================================================

DO $$
DECLARE
  v_role_count        int;
  v_paused_col        boolean;
  v_created_by_col    boolean;
  v_editor_admin      int;
  v_viewer_admin      int;
BEGIN
  SELECT COUNT(*) INTO v_role_count FROM roles WHERE is_active = true;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'roles' AND column_name = 'is_paused'
  ) INTO v_paused_col;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'roles' AND column_name = 'created_by'
  ) INTO v_created_by_col;

  SELECT COUNT(*) INTO v_editor_admin
  FROM role_permissions WHERE role = 'editor' AND permission_code = 'portal.admin_access' AND is_revoked = false;
  SELECT COUNT(*) INTO v_viewer_admin
  FROM role_permissions WHERE role = 'viewer' AND permission_code = 'portal.admin_access' AND is_revoked = false;

  RAISE NOTICE '';
  RAISE NOTICE '=============================================================================';
  RAISE NOTICE 'Roles & Privileges Completion Migration - CLAUDE-ROLES-PRIVILEGES-COMPLETE-001';
  RAISE NOTICE '=============================================================================';
  RAISE NOTICE '  Roles catalog active rows:          %', v_role_count;
  RAISE NOTICE '  roles.is_paused column present:     %', v_paused_col;
  RAISE NOTICE '  roles.created_by column present:    %', v_created_by_col;
  RAISE NOTICE '  editor has portal.admin_access:     % (expected: 1)', v_editor_admin;
  RAISE NOTICE '  viewer has portal.admin_access:     % (expected: 1)', v_viewer_admin;
  RAISE NOTICE '';
  RAISE NOTICE '  Schema:   FK user_roles.role -> roles.name, FK role_permissions.role -> roles.name';
  RAISE NOTICE '  Updated:  has_permission(), get_user_permissions() (paused-aware)';
  RAISE NOTICE '  Updated:  add/update/remove_user_role wrappers normalised to users.roles.assign';
  RAISE NOTICE '  New RPCs: create_role, update_role, clone_role, pause_role, unpause_role,';
  RAISE NOTICE '            delete_role, assign_user_role, change_user_role,';
  RAISE NOTICE '            remove_user_role_safe, search_users_for_role_assignment';
  RAISE NOTICE '            (all _with_session)';
  RAISE NOTICE '=============================================================================';
  RAISE NOTICE '';
END $$;
