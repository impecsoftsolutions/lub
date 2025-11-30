/*
  # Fix get_public_leadership_assignments - District Level Filtering

  1. Bug Identified
    - District-level assignments exist in database but don't show on Leadership page
    - Example: Guntur district assignments (Kanadam Narendranath, Mullupuru Rajendra)
    - WHERE clause logic incorrect for district level filtering
    - Missing case-insensitive, trimmed string comparisons

  2. Issues in Current Logic (lines 107-108)
    - Used: AND (p_level = 'national' OR a.state = p_state)
    - Used: AND (p_level NOT IN ('district', 'city') OR a.district = p_district)
    - Problems:
      a) No case-insensitive comparison (LOWER/TRIM)
      b) Complex boolean logic makes it hard to debug
      c) Doesn't clearly separate level-specific filters

  3. Fixes Applied
    - Simplified level-specific filtering with explicit CASE
    - Added LOWER(TRIM()) for state and district comparisons
    - Made logic clear and maintainable:
      - national: only checks level
      - state: checks level + state match (case-insensitive)
      - district: checks level + state + district match (case-insensitive)
      - city: checks level + state + district match (case-insensitive)
    - Kept all other filters intact (committee_year, dates, active status)

  4. Testing
    - Verify with: SELECT * FROM get_public_leadership_assignments(
        'district', 'Andhra Pradesh', 'Guntur', CURRENT_DATE, '2025'
      );
    - Should return at least 2 rows for Guntur district assignments
*/

-- =============================================================================
-- Recreate get_public_leadership_assignments with Fixed Filtering
-- =============================================================================

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
  -- ==========================================================================
  -- Parameter Validation
  -- ==========================================================================
  
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

  -- ==========================================================================
  -- Return Active Assignments
  -- 
  -- Level-Specific Filtering Rules:
  --   - national: a.level = 'national' (state/district ignored)
  --   - state:    a.level = 'state' AND a.state matches p_state (case-insensitive)
  --   - district: a.level = 'district' AND a.state + a.district match (case-insensitive)
  --   - city:     a.level = 'city' AND a.state + a.district match (case-insensitive)
  --
  -- Common Filters:
  --   - committee_year matches p_committee_year (if provided)
  --   - role_start_date <= p_as_of_date (or NULL)
  --   - role_end_date >= p_as_of_date (or NULL)
  --   - role is_active = true
  --   - member status = 'approved' AND is_active = true
  -- ==========================================================================
  
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
    -- ==================================================================
    -- Level-Specific Filters (explicit CASE logic for clarity)
    -- ==================================================================
    (
      CASE 
        -- National: only check level
        WHEN p_level = 'national' THEN
          a.level = 'national'
        
        -- State: check level + state match (case-insensitive, trimmed)
        WHEN p_level = 'state' THEN
          a.level = 'state'
          AND LOWER(TRIM(COALESCE(a.state, ''))) = LOWER(TRIM(COALESCE(p_state, '')))
        
        -- District: check level + state + district match (case-insensitive, trimmed)
        WHEN p_level = 'district' THEN
          a.level = 'district'
          AND LOWER(TRIM(COALESCE(a.state, ''))) = LOWER(TRIM(COALESCE(p_state, '')))
          AND LOWER(TRIM(COALESCE(a.district, ''))) = LOWER(TRIM(COALESCE(p_district, '')))
        
        -- City: check level + state + district match (case-insensitive, trimmed)
        WHEN p_level = 'city' THEN
          a.level = 'city'
          AND LOWER(TRIM(COALESCE(a.state, ''))) = LOWER(TRIM(COALESCE(p_state, '')))
          AND LOWER(TRIM(COALESCE(a.district, ''))) = LOWER(TRIM(COALESCE(p_district, '')))
        
        ELSE FALSE
      END
    )
    
    -- ==================================================================
    -- Common Filters (applied to all levels)
    -- ==================================================================
    
    -- Committee year filter (optional)
    AND (p_committee_year IS NULL OR a.committee_year = p_committee_year)
    
    -- Active period filter (NULL dates mean no start/end restriction)
    AND (a.role_start_date IS NULL OR a.role_start_date <= p_as_of_date)
    AND (a.role_end_date IS NULL OR a.role_end_date >= p_as_of_date)
    
    -- Only active roles
    AND r.is_active = true
    
    -- Only approved and active members
    AND mr.status = 'approved'
    AND mr.is_active = true
    
  ORDER BY
    COALESCE(r.display_order, 999999) NULLS LAST,
    r.role_name,
    mr.full_name;
END;
$$;

-- =============================================================================
-- Grant Permissions
-- =============================================================================

GRANT EXECUTE ON FUNCTION public.get_public_leadership_assignments(text, text, text, date, text) TO anon, authenticated;

-- =============================================================================
-- Add Comment
-- =============================================================================

COMMENT ON FUNCTION public.get_public_leadership_assignments(text, text, text, date, text) IS
  'Public read-only function for Leadership page. Returns filtered leadership assignments with member details. Fixed district-level filtering with case-insensitive state/district matching. Supports national/state/district/city levels with proper geographic validation.';

-- =============================================================================
-- Log Completion
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Fixed get_public_leadership_assignments district-level filtering';
  RAISE NOTICE 'Added case-insensitive LOWER(TRIM()) comparisons for state and district';
  RAISE NOTICE 'Simplified level-specific logic with explicit CASE for clarity';
  RAISE NOTICE 'District assignments in Guntur should now appear on Leadership page';
END $$;

-- =============================================================================
-- End
-- =============================================================================
