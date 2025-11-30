/*
  # Create get_public_leadership_assignments RPC Function

  1. Purpose
    - Provide read-only public API for Leadership page
    - Return leadership assignments for a given level and region
    - Filter by active date range (role_start_date to role_end_date)
    - Safe for public/anon access with only display-appropriate fields

  2. Parameters
    - p_level (text, required): 'national', 'state', 'district', or 'city'
    - p_state (text, optional): State name (required for state/district/city levels)
    - p_district (text, optional): District name (required for district/city levels)
    - p_as_of_date (date, optional): Date to check if assignment is active (defaults to current_date)

  3. Returns
    - assignment_id: UUID of the assignment
    - member_id: UUID of the member
    - member_full_name: Member's full name
    - member_email: Member's email
    - member_mobile_number: Member's mobile number
    - lub_role_id: UUID of the LUB role
    - lub_role_name: Name of the LUB role
    - level: Organizational level
    - state: State name (if applicable)
    - district: District name (if applicable)
    - role_start_date: Start date of role period
    - role_end_date: End date of role period

  4. Security
    - SECURITY DEFINER to bypass RLS for read-only access
    - Only returns safe, display-appropriate fields
    - Filters for active assignments within date range
    - Granted to anon and authenticated for public access

  5. Usage
    Frontend will:
    - Call this RPC with level and region filters
    - Calculate committee period heading from MIN(role_start_date) and MAX(role_end_date)
    - Display members grouped by role
*/

-- =====================================================================
-- get_public_leadership_assignments: Public read-only leadership API
-- SECURITY DEFINER for public access, returns only display fields
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_public_leadership_assignments(
  p_level text,
  p_state text DEFAULT NULL,
  p_district text DEFAULT NULL,
  p_as_of_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  assignment_id uuid,
  member_id uuid,
  member_full_name text,
  member_email text,
  member_mobile_number text,
  lub_role_id uuid,
  lub_role_name text,
  level text,
  state text,
  district text,
  role_start_date date,
  role_end_date date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- -------- Basic parameter validation ----------
  IF p_level IS NULL OR p_level NOT IN ('national','state','district','city') THEN
    RAISE EXCEPTION 'Invalid level. Must be one of national/state/district/city';
  END IF;

  -- -------- Geographic validation ----------
  -- For state level, state is required
  IF p_level = 'state' AND p_state IS NULL THEN
    RAISE EXCEPTION 'State is required when level = state';
  END IF;

  -- For district/city levels, both state and district are required
  IF p_level IN ('district', 'city') AND (p_state IS NULL OR p_district IS NULL) THEN
    RAISE EXCEPTION 'State and district are required when level = district or city';
  END IF;

  -- -------- Return active assignments ----------
  -- Only return assignments that are active on p_as_of_date
  -- Ordered by role display_order (if available) then role_name, then member name
  RETURN QUERY
  SELECT
    a.id AS assignment_id,
    a.member_id,
    mr.full_name AS member_full_name,
    mr.email AS member_email,
    mr.mobile_number AS member_mobile_number,
    a.role_id AS lub_role_id,
    r.role_name AS lub_role_name,
    a.level,
    a.state,
    a.district,
    a.role_start_date,
    a.role_end_date
  FROM member_lub_role_assignments a
  INNER JOIN member_registrations mr ON mr.id = a.member_id
  INNER JOIN lub_roles_master r ON r.id = a.role_id
  WHERE 
    -- Level filter (exact match required)
    a.level = p_level
    -- Geographic filters based on level:
    -- National: no state/district filter
    -- State: match state only
    AND (p_level = 'national' OR a.state = p_state)
    -- District/City: match both state and district
    AND (p_level NOT IN ('district', 'city') OR a.district = p_district)
    -- Active period filter: assignment must be active on p_as_of_date
    -- Allow NULL dates for backwards compatibility with older records
    AND (a.role_start_date IS NULL OR a.role_start_date <= p_as_of_date)
    AND (a.role_end_date IS NULL OR a.role_end_date >= p_as_of_date)
    -- Only show active roles and non-deleted members
    AND r.is_active = true
    AND (mr.is_deleted IS NULL OR mr.is_deleted = false)
  ORDER BY
    COALESCE(r.display_order, 999999),  -- Use display_order if available, else sort to end
    r.role_name,                         -- Then by role name
    mr.full_name;                        -- Finally by member name
END;
$$;

-- Grant execute permissions to anon and authenticated
GRANT EXECUTE ON FUNCTION public.get_public_leadership_assignments(text, text, text, date) TO anon, authenticated;

-- Add function comment
COMMENT ON FUNCTION public.get_public_leadership_assignments(text, text, text, date) IS
  'Public read-only function for Leadership page. Returns leadership assignments for a given level and region, filtered by active date range. Safe for anon access with only display-appropriate fields. Frontend calculates committee period from MIN/MAX of role dates. Used by public Leadership page to display State/District/City committees.';

-- =====================================================================
-- End
-- =====================================================================
