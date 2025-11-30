/*
  # Update get_public_leadership_assignments for Committee Year and Enhanced Member Info

  1. Purpose
    - Add committee_year filter parameter
    - Include member gender for Shri./Smt. prefix display
    - Include member company, city, district for enhanced display
    - Include profile_photo_url for member photos
    - Support optional role dates (continue to filter by p_as_of_date when dates exist)

  2. Returns
    - All assignment fields including committee_year
    - Member personal info: full_name, gender, mobile_number, email
    - Member company info: company_name, city, district
    - Member photo: profile_photo_url
    - Role info: role_id, role_name
    - Location info: level, state, district
    - Period info: role_start_date, role_end_date (both optional)

  3. Security
    - SECURITY DEFINER for public/anon access
    - Only returns safe, display-appropriate fields
    - Filters for active roles and non-deleted members
*/

-- =====================================================================
-- Update get_public_leadership_assignments with committee_year and gender
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
    -- Level filter (exact match required)
    a.level = p_level
    -- Geographic filters based on level:
    -- National: no state/district filter
    -- State: match state only
    AND (p_level = 'national' OR a.state = p_state)
    -- District/City: match both state and district
    AND (p_level NOT IN ('district', 'city') OR a.district = p_district)
    -- Committee year filter if provided
    AND (p_committee_year IS NULL OR a.committee_year = p_committee_year)
    -- Active period filter: assignment must be active on p_as_of_date
    -- Allow NULL dates for backwards compatibility with older records
    AND (a.role_start_date IS NULL OR a.role_start_date <= p_as_of_date)
    AND (a.role_end_date IS NULL OR a.role_end_date >= p_as_of_date)
    -- Only show active roles and non-deleted members
    AND r.is_active = true
    AND (mr.is_deleted IS NULL OR mr.is_deleted = false)
  ORDER BY
    COALESCE(r.display_order, 999999) NULLS LAST,  -- Use display_order if available
    r.role_name,                                     -- Then by role name
    mr.full_name;                                    -- Finally by member name
END;
$$;

-- Grant execute permissions to anon and authenticated
GRANT EXECUTE ON FUNCTION public.get_public_leadership_assignments(text, text, text, date, text) TO anon, authenticated;

-- Add function comment
COMMENT ON FUNCTION public.get_public_leadership_assignments(text, text, text, date, text) IS
  'Public read-only function for Leadership page. Returns leadership assignments filtered by level, region, committee year, and active date range. Includes member gender for Shri./Smt. prefix, company info, city, district, and profile photo. Safe for anon access with only display-appropriate fields. Used by public Leadership page to display committee members.';

-- =====================================================================
-- End
-- =====================================================================
