/*
  # Create get_public_committee_years RPC

  1. Purpose
    - Returns distinct committee years from member_lub_role_assignments
    - Used by Leadership page for dynamic Committee Year dropdown
    - Used by Admin page for Committee Year filter options
    - Public read-only, no authorization required

  2. Data Source
    - member_lub_role_assignments.committee_year
    - Filtered to only approved and active members
    - Excludes NULL or empty committee years

  3. Returns
    - List of distinct committee years as text
    - Sorted descending (newest first)
    - Example: ['2025', '2024', '2023']

  4. Security
    - SECURITY DEFINER allows execution
    - No sensitive data exposed (just year strings)
    - Granted to anon and authenticated users
*/

-- =============================================================================
-- Create Public Committee Years RPC
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_public_committee_years()
RETURNS TABLE (committee_year text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- ==========================================================================
  -- Return distinct committee years from active assignments
  -- ==========================================================================
  
  RETURN QUERY
  SELECT DISTINCT a.committee_year::text AS committee_year
  FROM member_lub_role_assignments a
  INNER JOIN member_registrations mr ON mr.id = a.member_id
  WHERE 
    -- Only non-empty committee years
    a.committee_year IS NOT NULL
    AND TRIM(a.committee_year) <> ''
    -- Only approved and active members
    AND mr.status = 'approved'
    AND mr.is_active = TRUE
  ORDER BY committee_year DESC;
END;
$$;

-- =============================================================================
-- Grant Permissions
-- =============================================================================

GRANT EXECUTE ON FUNCTION public.get_public_committee_years() TO anon, authenticated;

-- =============================================================================
-- Add Comment
-- =============================================================================

COMMENT ON FUNCTION public.get_public_committee_years() IS
  'Public read-only RPC: Returns distinct committee years from member role assignments. Filtered to approved and active members only. Used for dynamic year dropdowns in Leadership page and Admin filters. Returns years sorted descending (newest first).';

-- =============================================================================
-- Log Completion
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Created get_public_committee_years RPC';
  RAISE NOTICE 'Leadership page and Admin filters will now use dynamic year lists';
  RAISE NOTICE 'No hard-coded year ranges needed';
END $$;

-- =============================================================================
-- End
-- =============================================================================
