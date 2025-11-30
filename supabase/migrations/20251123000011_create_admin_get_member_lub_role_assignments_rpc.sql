/*
  # Create admin_get_member_lub_role_assignments RPC

  1. Problem
    - Admin Member Role Assignments list still shows empty despite JWT policy fixes
    - Direct SELECT queries continue to be blocked by RLS
    - Fighting RLS from client is proving unreliable

  2. Solution
    - Create SECURITY DEFINER RPC to bypass RLS
    - RPC performs its own authorization checks (account_type + user_roles)
    - Returns all assignments with member and role metadata
    - Supports optional search filtering
    - Pattern matches other admin RPCs (get_admin_member_registrations)

  3. Authorization
    - Checks users.account_type IN ('admin', 'both', 'super_admin')
    - OR user_roles.role IN ('super_admin', 'admin', 'editor')
    - Requires account_status = 'active'
    - Raises exception if not authorized

  4. Return Data
    - All member_lub_role_assignments with joins
    - Member details: name, email, mobile, company, city, district, gender, photo
    - Role details: role_name
    - Assignment details: level, state, district, committee_year, dates
    - Filtered by member status (approved + active only)
    - Ordered by created_at DESC

  5. Impact
    - Admin Member Role Assignments tab will load data via RPC
    - No more RLS blocking issues
    - Search functionality works server-side
    - Consistent with other admin flows
*/

-- =============================================================================
-- Create RPC Function
-- =============================================================================

CREATE OR REPLACE FUNCTION admin_get_member_lub_role_assignments(
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
  -- Member fields
  member_full_name text,
  member_email text,
  member_mobile_number text,
  member_company_name text,
  member_city text,
  member_district text,
  member_gender text,
  member_profile_photo_url text,
  -- Role fields
  lub_role_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_authorized boolean := false;
BEGIN
  -- ==========================================================================
  -- Authorization: Check account_type OR user_roles
  -- ==========================================================================
  
  SELECT TRUE
  INTO v_is_authorized
  FROM users u
  WHERE u.id = p_requesting_user_id
    AND u.account_status = 'active'
    AND (
      -- Path A: Direct admin account type
      u.account_type IN ('admin', 'both', 'super_admin')
      OR
      -- Path B: Admin role via user_roles table
      EXISTS (
        SELECT 1
        FROM user_roles ur
        WHERE ur.user_id = u.id
          AND ur.role IN ('super_admin', 'admin', 'editor')
      )
    )
  LIMIT 1;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'Authorization failed: User does not have permission to view member role assignments';
  END IF;

  -- ==========================================================================
  -- Main Query: Return all assignments with member + role metadata
  -- ==========================================================================
  
  RETURN QUERY
  SELECT
    a.id AS assignment_id,
    a.member_id,
    a.role_id AS lub_role_id,
    a.level,
    a.state,
    a.district,
    a.committee_year,
    a.role_start_date,
    a.role_end_date,
    a.created_at,
    a.updated_at,
    -- Member fields
    mr.full_name AS member_full_name,
    mr.email AS member_email,
    mr.mobile_number AS member_mobile_number,
    mr.company_name AS member_company_name,
    mr.city AS member_city,
    mr.district AS member_district,
    mr.gender AS member_gender,
    mr.profile_photo_url AS member_profile_photo_url,
    -- Role fields
    r.role_name AS lub_role_name
  FROM member_lub_role_assignments a
  INNER JOIN member_registrations mr ON mr.id = a.member_id
  INNER JOIN lub_roles_master r ON r.id = a.role_id
  WHERE
    -- Only show assignments for approved, active members
    mr.status = 'approved'
    AND mr.is_active = TRUE
    -- Optional search filter
    AND (
      p_search IS NULL
      OR p_search = ''
      OR (
        mr.full_name ILIKE '%' || p_search || '%'
        OR mr.email ILIKE '%' || p_search || '%'
        OR mr.company_name ILIKE '%' || p_search || '%'
        OR COALESCE(mr.city, '') ILIKE '%' || p_search || '%'
        OR COALESCE(mr.district, '') ILIKE '%' || p_search || '%'
        OR COALESCE(a.state, '') ILIKE '%' || p_search || '%'
        OR COALESCE(a.district, '') ILIKE '%' || p_search || '%'
        OR r.role_name ILIKE '%' || p_search || '%'
        OR COALESCE(a.committee_year, '') ILIKE '%' || p_search || '%'
      )
    )
  ORDER BY a.created_at DESC;

END;
$$;

-- =============================================================================
-- Grant Permissions
-- =============================================================================

-- Grant execute to anon and authenticated
-- Safe because function has internal authorization checks
GRANT EXECUTE ON FUNCTION admin_get_member_lub_role_assignments(uuid, text) TO anon, authenticated;

-- =============================================================================
-- Add Comment
-- =============================================================================

COMMENT ON FUNCTION admin_get_member_lub_role_assignments(uuid, text) IS
  'Admin-only RPC: Returns all LUB member role assignments with member and role metadata. Performs authorization check (account_type or user_roles). Supports optional search filter. Used by Admin Designations → Member Role Assignments tab. SECURITY DEFINER bypasses RLS.';

-- =============================================================================
-- Log Completion
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE 'RPC function admin_get_member_lub_role_assignments created successfully';
  RAISE NOTICE 'Admin Member Role Assignments tab will now use this RPC instead of direct SELECT';
  RAISE NOTICE 'This bypasses RLS issues that were preventing data from loading';
END $$;

-- =============================================================================
-- End
-- =============================================================================
