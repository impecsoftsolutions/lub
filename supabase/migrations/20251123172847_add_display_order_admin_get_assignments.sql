-- Drop the old function so we can change the OUT parameters (return table structure)
DROP FUNCTION IF EXISTS public.admin_get_member_lub_role_assignments(uuid, text);

-- Recreate the function with lub_role_display_order in the return type
CREATE FUNCTION public.admin_get_member_lub_role_assignments(
  p_requesting_user_id uuid,
  p_search text DEFAULT NULL
)
RETURNS TABLE (
  assignment_id uuid,
  member_id uuid,
  lub_role_id uuid,
  level text,
  state text,
  district text,
  committee_year text,
  role_start_date date,
  role_end_date date,
  created_at timestamptz,
  updated_at timestamptz,
  member_full_name text,
  member_email text,
  member_mobile_number text,
  member_company_name text,
  member_city text,
  member_district text,
  member_gender text,
  member_profile_photo_url text,
  lub_role_name text,
  lub_role_display_order integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_authorized boolean := false;
BEGIN
  -- Authorization check: same pattern as other admin RPCs
  SELECT
    EXISTS (
      SELECT 1
      FROM users u
      WHERE u.id = p_requesting_user_id
        AND u.account_status = 'active'
        AND (
          u.account_type IN ('admin', 'both', 'super_admin')
          OR EXISTS (
            SELECT 1
            FROM user_roles ur
            WHERE ur.user_id = u.id
              AND ur.role IN ('super_admin', 'admin', 'editor')
          )
        )
    )
  INTO v_is_authorized;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'authorization: not authorized to view member LUB role assignments';
  END IF;

  RETURN QUERY
  SELECT
    a.id                         AS assignment_id,
    a.member_id                  AS member_id,
    a.role_id                    AS lub_role_id,
    a.level                      AS level,
    a.state                      AS state,
    a.district                   AS district,
    a.committee_year            AS committee_year,
    a.role_start_date            AS role_start_date,
    a.role_end_date              AS role_end_date,
    a.created_at                 AS created_at,
    a.updated_at                 AS updated_at,
    mr.full_name                 AS member_full_name,
    mr.email                     AS member_email,
    mr.mobile_number             AS member_mobile_number,
    mr.company_name              AS member_company_name,
    mr.city                      AS member_city,
    mr.district                  AS member_district,
    mr.gender                    AS member_gender,
    mr.profile_photo_url         AS member_profile_photo_url,
    r.role_name                  AS lub_role_name,
    r.display_order              AS lub_role_display_order
  FROM member_lub_role_assignments a
  JOIN member_registrations mr
    ON mr.id = a.member_id
  JOIN lub_roles_master r
    ON r.id = a.role_id
  WHERE
    mr.status = 'approved'
    AND mr.is_active = TRUE
    AND (
      p_search IS NULL
      OR p_search = ''
      OR mr.full_name ILIKE '%' || p_search || '%'
      OR mr.email ILIKE '%' || p_search || '%'
      OR r.role_name ILIKE '%' || p_search || '%'
    )
  ORDER BY
    r.display_order ASC,
    r.role_name ASC,
    mr.full_name ASC,
    a.created_at DESC;
END;
$$;

COMMENT ON FUNCTION public.admin_get_member_lub_role_assignments(uuid, text)
IS 'Admin-only RPC to list all member LUB role assignments with role display order for hierarchy-based sorting.';
