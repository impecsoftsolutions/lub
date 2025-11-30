/*
  # Fix get_public_leadership_assignments RPC - Use Existing Columns

  1. Issue
    - RPC fails with "column a.role_start_date does not exist"
    - References non-existent columns on member_registrations
    - Needs to use correct column names from actual schema

  2. Fixes Applied
    - Use correct member_registrations columns:
      - full_name, gender, email, mobile_number
      - company_name, city, district
      - is_active, status (NOT is_deleted)
      - profile_photo_url
    - Reference role_start_date, role_end_date, committee_year from assignments table
    - Proper filtering for active, approved members

  3. No Signature Change
    - Same parameters and return structure TypeScript expects
    - Same validation logic
    - Safe for anon access
*/

-- =====================================================================
-- Recreate get_public_leadership_assignments with correct columns
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_public_leadership_assignments(
  p_level text,
  p_state text DEFAULT NULL,
  p_district text DEFAULT NULL,
  p_as_of_date date DEFAULT CURRENT_DATE,
  p_committee_year text DEFAULT NULL
)
RETURNS TABLE (
  assignment_id uuid,
  member_id uuid,
  member_full_name text,
  member_email text,
  member_mobile_number text,
  member_company_name text,
  member_city text,
  member_district text,
  member_gender text,
  member_profile_photo_url text,
  lub_role_id uuid,
  lub_role_name text,
  level text,
  state text,
  district text,
  committee_year text,
  role_start_date date,
  role_end_date date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- -------- Parameter validation ----------
  IF p_level IS NULL OR p_level NOT IN ('national','state','district','city') THEN
    RAISE EXCEPTION 'Invalid level. Must be one of national/state/district/city';
  END IF;

  -- Geographic validation
  IF p_level = 'state' AND p_state IS NULL THEN
    RAISE EXCEPTION 'State is required when level = state';
  END IF;

  IF p_level IN ('district', 'city') AND (p_state IS NULL OR p_district IS NULL) THEN
    RAISE EXCEPTION 'State and district are required when level = district or city';
  END IF;

  -- Validate committee_year format if provided
  IF p_committee_year IS NOT NULL AND p_committee_year !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'Committee year must be a 4-digit year (e.g., 2025)';
  END IF;

  -- -------- Return active assignments ----------
  RETURN QUERY
  SELECT
    a.id AS assignment_id,
    a.member_id,
    mr.full_name AS member_full_name,
    mr.email AS member_email,
    mr.mobile_number AS member_mobile_number,
    mr.company_name AS member_company_name,
    mr.city AS member_city,
    mr.district AS member_district,
    mr.gender AS member_gender,
    mr.profile_photo_url AS member_profile_photo_url,
    a.role_id AS lub_role_id,
    r.role_name AS lub_role_name,
    a.level,
    a.state,
    a.district,
    a.committee_year,
    a.role_start_date,
    a.role_end_date
  FROM member_lub_role_assignments a
  INNER JOIN member_registrations mr ON mr.id = a.member_id
  INNER JOIN lub_roles_master r ON r.id = a.role_id
  WHERE 
    -- Level filter
    a.level = p_level
    -- Geographic filters
    AND (p_level = 'national' OR a.state = p_state)
    AND (p_level NOT IN ('district', 'city') OR a.district = p_district)
    -- Committee year filter
    AND (p_committee_year IS NULL OR a.committee_year = p_committee_year)
    -- Active period filter (allow NULL dates)
    AND (a.role_start_date IS NULL OR a.role_start_date <= p_as_of_date)
    AND (a.role_end_date IS NULL OR a.role_end_date >= p_as_of_date)
    -- Only active roles and approved/active members
    AND r.is_active = true
    AND mr.status = 'approved'
    AND mr.is_active = true
  ORDER BY
    COALESCE(r.display_order, 999999) NULLS LAST,
    r.role_name,
    mr.full_name;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_public_leadership_assignments(text, text, text, date, text) TO anon, authenticated;

-- Add function comment
COMMENT ON FUNCTION public.get_public_leadership_assignments(text, text, text, date, text) IS
  'Public read-only function for Leadership page. Fixed to use correct column names from member_registrations (is_active, status, full_name, gender, company_name, city, district, profile_photo_url) and member_lub_role_assignments (role_start_date, role_end_date, committee_year). Returns filtered leadership assignments with member details for display.';

-- =====================================================================
-- End
-- =====================================================================
