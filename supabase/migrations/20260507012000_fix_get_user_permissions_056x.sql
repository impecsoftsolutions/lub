/*
  # COD-ADMIN-ACCESS-PERMISSION-FUNCTION-HOTFIX-056X

  Fix: public.get_user_permissions(uuid) was raising
    "invalid UNION/INTERSECT/EXCEPT ORDER BY clause"

  Root cause:
    The non-system-admin branch ends with
        ... UNION ...
        ORDER BY permission_category, permission_code;
    inside RETURN QUERY. Postgres only resolves ORDER BY against the
    SELECT-list column names of the queries inside the UNION, not against
    the function's OUT parameter names. The inner SELECTs project p.code,
    p.name, p.description, p.category, ... — i.e. the output column names
    of the UNION are `code`, `name`, `description`, `category`, not
    `permission_code` / `permission_category`. The ORDER BY therefore
    fails to resolve and the function aborts.

  When the RPC throws, the JS PermissionContext sees an error and ends up
  with an empty permissions list, which collapses both Header link
  visibility (056) AND sidebar/module filtering. Both downstream UX gaps
  reported in the 056 runtime probes were caused by this single failure.

  Fix:
    Re-`CREATE OR REPLACE` the function with the same semantics, but wrap
    each UNION in a subquery so ORDER BY can reference resolved column
    names. Semantics preserved exactly: paused-role behavior, system.admin
    everything-except-revokes, role permissions ∪ explicit grants
    excluding revokes, override precedence (revoke > grant > role).

  No DDL on tables. No type changes. NOTIFY pgrst at the end so PostgREST
  picks up the new function body without a redeploy.
*/

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

  -- Paused role: only explicit grant overrides survive.
  IF v_role_paused THEN
    RETURN QUERY
    SELECT
      p.code        AS permission_code,
      p.name        AS permission_name,
      p.description AS permission_description,
      p.category    AS permission_category,
      upo.created_at AS granted_at
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
    SELECT
      p.code        AS permission_code,
      p.name        AS permission_name,
      p.description AS permission_description,
      p.category    AS permission_category,
      now()         AS granted_at
    FROM permissions p
    WHERE p.is_active = true
      AND NOT EXISTS (
        SELECT 1 FROM user_permission_overrides upo
        WHERE upo.user_id = p_user_id
          AND upo.permission_code = p.code
          AND upo.override_type = 'revoke'
      )
    ORDER BY p.category, p.code;
    RETURN;
  END IF;

  -- Standard branch: role permissions ∪ explicit grants, excluding
  -- explicit revokes. Wrap UNION in a subquery so ORDER BY resolves
  -- cleanly against the named columns.
  RETURN QUERY
  SELECT
    combined.permission_code,
    combined.permission_name,
    combined.permission_description,
    combined.permission_category,
    combined.granted_at
  FROM (
    SELECT
      p.code         AS permission_code,
      p.name         AS permission_name,
      p.description  AS permission_description,
      p.category     AS permission_category,
      rp.granted_at  AS granted_at
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

    SELECT
      p.code         AS permission_code,
      p.name         AS permission_name,
      p.description  AS permission_description,
      p.category     AS permission_category,
      upo.created_at AS granted_at
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
  ) AS combined
  ORDER BY combined.permission_category, combined.permission_code;
END;
$$;

COMMENT ON FUNCTION public.get_user_permissions(uuid) IS
  'Returns effective permissions for a user. Paused roles contribute zero role permissions; only grant overrides survive a paused role. ORDER BY in the standard branch is wrapped in a subquery so it resolves cleanly (056X hotfix).';

-- Tell PostgREST about the new body even though the signature is unchanged,
-- to be safe across cache states.
NOTIFY pgrst, 'reload schema';
