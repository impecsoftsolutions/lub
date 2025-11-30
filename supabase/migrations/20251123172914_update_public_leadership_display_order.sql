/*
  # Update get_public_leadership_assignments sorting

  1. Purpose
    - Ensure public leadership page shows roles in display_order hierarchy
    - Maintain all existing filtering logic for levels and geography

  2. Changes
    - Updated ORDER BY to use r.display_order as primary sort
    - Keeps all existing level/state/district filtering with CASE logic
    - Keeps all existing validation and security

  3. Sort Order
    - r.display_order ASC (primary - role hierarchy)
    - r.role_name ASC (secondary - alphabetical within same order)
    - mr.full_name ASC (tertiary - member name)
    - a.created_at DESC (quaternary - newest first)
*/

-- =============================================================================
-- Recreate get_public_leadership_assignments with display_order sorting
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

  IF p_level = 'state' AND p_state IS NULL THEN
    RAISE EXCEPTION 'State is required when level = state';
  END IF;

  IF p_level IN ('district', 'city') AND (p_state IS NULL OR p_district IS NULL) THEN
    RAISE EXCEPTION 'State and district are required when level = district or city';
  END IF;

  IF p_committee_year IS NOT NULL AND p_committee_year !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'Committee year must be a 4-digit year (e.g., 2025)';
  END IF;

  -- ==========================================================================
  -- Return Active Assignments
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
    (
      CASE 
        WHEN p_level = 'national' THEN
          a.level = 'national'
        
        WHEN p_level = 'state' THEN
          a.level = 'state'
          AND LOWER(TRIM(COALESCE(a.state, ''))) = LOWER(TRIM(COALESCE(p_state, '')))
        
        WHEN p_level = 'district' THEN
          a.level = 'district'
          AND LOWER(TRIM(COALESCE(a.state, ''))) = LOWER(TRIM(COALESCE(p_state, '')))
          AND LOWER(TRIM(COALESCE(a.district, ''))) = LOWER(TRIM(COALESCE(p_district, '')))
        
        WHEN p_level = 'city' THEN
          a.level = 'city'
          AND LOWER(TRIM(COALESCE(a.state, ''))) = LOWER(TRIM(COALESCE(p_state, '')))
          AND LOWER(TRIM(COALESCE(a.district, ''))) = LOWER(TRIM(COALESCE(p_district, '')))
        
        ELSE FALSE
      END
    )
    AND (p_committee_year IS NULL OR a.committee_year = p_committee_year)
    AND (a.role_start_date IS NULL OR a.role_start_date <= p_as_of_date)
    AND (a.role_end_date IS NULL OR a.role_end_date >= p_as_of_date)
    AND r.is_active = true
    AND mr.status = 'approved'
    AND mr.is_active = true
  ORDER BY
    COALESCE(r.display_order, 999999) ASC,
    r.role_name ASC,
    mr.full_name ASC,
    a.created_at DESC;
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
  'Public read-only function for Leadership page. Returns filtered leadership assignments sorted by role display_order, then role name, then member name. Supports national/state/district/city levels with proper geographic validation.';

-- =============================================================================
-- Log Completion
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Updated get_public_leadership_assignments to sort by display_order';
  RAISE NOTICE 'Leadership page will now show roles in proper hierarchy order';
END $$;
