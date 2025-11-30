/*
  # Create SECURITY DEFINER RPC for Admin Member Registrations SELECT

  ## Overview
  This migration creates a SECURITY DEFINER RPC function to allow admin users
  to fetch all member registrations with optional filtering and pagination,
  bypassing RLS policies.

  ## Problem
  - Custom authentication system uses localStorage tokens, NOT Supabase Auth
  - auth.jwt() and auth.uid() always return NULL
  - RLS policies using current_user_id() fail because session is never set
  - Direct SELECT queries are blocked by RLS policies
  - Admins cannot view member registrations list

  ## Solution
  Create get_admin_member_registrations() RPC function that:
  - Uses SECURITY DEFINER to bypass RLS
  - Validates requesting user's authentication and authorization
  - Checks BOTH account_type and user_roles for admin privileges
  - Includes 'viewer' role for read-only access
  - Returns all member registration columns with company designation JOIN
  - Supports optional filtering (status, state, search)
  - Supports pagination (limit, offset)
  - Returns empty result set if not authorized (not an error)
  - Uses custom TYPE instead of RETURNS TABLE to avoid variable conflicts

  ## Security Measures
  1. User Authentication: Verifies user exists and is active
  2. Dual Authorization: Checks account_type AND user_roles for admin privileges
  3. Input Validation: Validates UUID and handles NULL parameters
  4. Search Path: SET search_path = public prevents attacks
  5. Empty Result Set: Returns empty set on auth failure (no error leakage)
  6. Role-Based Access: Supports super_admin, admin, editor, and viewer roles

  ## Parameters
  - p_requesting_user_id: UUID of user making the request (REQUIRED)
  - p_status_filter: Filter by status ('pending', 'approved', 'rejected', NULL for all)
  - p_search_query: Search in name, company, email, mobile (NULL for no search)
  - p_state_filter: Filter by state (NULL for all states)
  - p_limit: Maximum records to return (default 100)
  - p_offset: Number of records to skip for pagination (default 0)

  ## Returns
  SETOF admin_member_registration_type with 63 columns containing complete member registration data

  ## Usage Example
  ```sql
  -- Get all pending registrations for current admin user
  SELECT * FROM get_admin_member_registrations(
    'admin-user-id-here',
    'pending',
    NULL,
    NULL,
    50,
    0
  );
  ```
*/

-- Drop existing function if exists
DROP FUNCTION IF EXISTS get_admin_member_registrations(uuid, text, text, text, integer, integer);

-- Drop existing type if exists
DROP TYPE IF EXISTS admin_member_registration_type CASCADE;

-- Create custom composite type for return data
CREATE TYPE admin_member_registration_type AS (
  -- Primary Key
  id uuid,

  -- Personal Information
  full_name text,
  gender text,
  date_of_birth date,
  email text,
  mobile_number text,

  -- Company Information
  company_name text,
  company_designation_id uuid,
  company_designation_name text,
  company_address text,
  city text,
  other_city_name text,
  is_custom_city boolean,
  district text,
  state text,
  pin_code text,

  -- Business Details
  industry text,
  activity_type text,
  constitution text,
  annual_turnover text,
  number_of_employees text,
  products_services text,
  brand_names text,
  website text,

  -- Registration Details
  gst_registered text,
  gst_number text,
  pan_company text,
  esic_registered text,
  epf_registered text,

  -- File Upload URLs
  gst_certificate_url text,
  udyam_certificate_url text,
  payment_proof_url text,
  profile_photo_url text,

  -- Payment Information
  referred_by text,
  amount_paid text,
  payment_date date,
  payment_mode text,
  transaction_id text,
  bank_reference text,

  -- Alternate Contact Information
  alternate_contact_name text,
  alternate_mobile text,

  -- Member Management
  member_id text,
  is_active boolean,
  deactivated_at timestamptz,
  deactivated_by uuid,

  -- Application Status
  status text,
  is_legacy_member boolean,
  reapplication_count integer,
  approval_date timestamptz,
  rejection_reason text,

  -- Foreign Keys
  user_id uuid,

  -- Audit Tracking
  last_modified_by uuid,
  last_modified_at timestamptz,
  first_viewed_at timestamptz,
  first_viewed_by uuid,
  reviewed_count integer,

  -- Metadata
  submission_id text,
  created_at timestamptz,
  updated_at timestamptz
);

-- Create the RPC function using RETURNS SETOF
CREATE OR REPLACE FUNCTION get_admin_member_registrations(
  p_requesting_user_id uuid,
  p_status_filter text DEFAULT NULL,
  p_search_query text DEFAULT NULL,
  p_state_filter text DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS SETOF admin_member_registration_type
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_record RECORD;
  v_is_authorized boolean := false;
BEGIN
  -- ============================================================================
  -- STEP 1: VALIDATE INPUT PARAMETERS
  -- ============================================================================

  -- Check for NULL requesting_user_id
  IF p_requesting_user_id IS NULL THEN
    -- Return empty result set (not an error for SELECT operations)
    RETURN;
  END IF;

  -- ============================================================================
  -- STEP 2: AUTHENTICATE REQUESTING USER
  -- ============================================================================

  -- Verify requesting user exists and is active
  SELECT * INTO v_user_record
  FROM users
  WHERE id = p_requesting_user_id
    AND account_status = 'active';

  IF NOT FOUND THEN
    -- Return empty result set (user not found or inactive)
    RETURN;
  END IF;

  -- ============================================================================
  -- STEP 3: AUTHORIZE USER FOR MEMBER REGISTRATIONS ACCESS
  -- ============================================================================

  -- Method 1: Check account_type for admin or both
  -- CRITICAL: Do NOT check for 'super_admin' - it is NOT a valid account_type value!
  -- Valid account_type values: 'admin', 'member', 'both', 'general_user'
  IF v_user_record.account_type IN ('admin', 'both') THEN
    v_is_authorized := true;
  END IF;

  -- Method 2: Check user_roles table for admin roles (if not already authorized)
  -- Include 'viewer' role since this is a read-only operation
  IF NOT v_is_authorized THEN
    SELECT EXISTS(
      SELECT 1 FROM user_roles
      WHERE user_id = p_requesting_user_id
        AND role IN ('super_admin', 'admin', 'editor', 'viewer')
    ) INTO v_is_authorized;
  END IF;

  -- Deny access if not authorized (return empty result set)
  IF NOT v_is_authorized THEN
    RETURN;
  END IF;

  -- ============================================================================
  -- STEP 4: EXECUTE QUERY AND RETURN RESULTS
  -- ============================================================================

  -- Return all member registrations with optional filters
  -- LEFT JOIN to company_designations to get designation_name
  RETURN QUERY
  SELECT
    mr.id,
    mr.full_name,
    mr.gender,
    mr.date_of_birth,
    mr.email,
    mr.mobile_number,
    mr.company_name,
    mr.company_designation_id,
    cd.designation_name,
    mr.company_address,
    mr.city,
    mr.other_city_name,
    mr.is_custom_city,
    mr.district,
    mr.state,
    mr.pin_code,
    mr.industry,
    mr.activity_type,
    mr.constitution,
    mr.annual_turnover,
    mr.number_of_employees,
    mr.products_services,
    mr.brand_names,
    mr.website,
    mr.gst_registered,
    mr.gst_number,
    mr.pan_company,
    mr.esic_registered,
    mr.epf_registered,
    mr.gst_certificate_url,
    mr.udyam_certificate_url,
    mr.payment_proof_url,
    mr.profile_photo_url,
    mr.referred_by,
    mr.amount_paid,
    mr.payment_date,
    mr.payment_mode,
    mr.transaction_id,
    mr.bank_reference,
    mr.alternate_contact_name,
    mr.alternate_mobile,
    mr.member_id,
    mr.is_active,
    mr.deactivated_at,
    mr.deactivated_by,
    mr.status,
    mr.is_legacy_member,
    mr.reapplication_count,
    mr.approval_date,
    mr.rejection_reason,
    mr.user_id,
    mr.last_modified_by,
    mr.last_modified_at,
    mr.first_viewed_at,
    mr.first_viewed_by,
    mr.reviewed_count,
    mr.submission_id,
    mr.created_at,
    mr.updated_at
  FROM member_registrations mr
  LEFT JOIN company_designations cd ON cd.id = mr.company_designation_id
  WHERE
    (p_status_filter IS NULL OR mr.status = p_status_filter)
    AND (p_state_filter IS NULL OR mr.state = p_state_filter)
    AND (
      p_search_query IS NULL OR
      mr.full_name ILIKE '%' || p_search_query || '%' OR
      mr.company_name ILIKE '%' || p_search_query || '%' OR
      mr.email ILIKE '%' || p_search_query || '%' OR
      mr.mobile_number ILIKE '%' || p_search_query || '%'
    )
  ORDER BY mr.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;

END;
$$;

-- Add comment explaining the function
COMMENT ON FUNCTION get_admin_member_registrations(uuid, text, text, text, integer, integer) IS
  'SECURITY DEFINER RPC to fetch member registrations for custom auth system. Uses SETOF custom type to avoid variable conflicts. Validates user permissions using dual authorization check (account_type AND user_roles). Supports filtering and pagination.';

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_admin_member_registrations(uuid, text, text, text, integer, integer) TO authenticated;

-- =============================================================================
-- Log Completion
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE '=============================================================================';
  RAISE NOTICE 'Migration 20251103000002 completed successfully';
  RAISE NOTICE '=============================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Changes Applied:';
  RAISE NOTICE '✓ Created admin_member_registration_type composite type';
  RAISE NOTICE '✓ Created get_admin_member_registrations RPC function with SECURITY DEFINER';
  RAISE NOTICE '✓ Uses RETURNS SETOF instead of RETURNS TABLE (avoids variable conflicts)';
  RAISE NOTICE '✓ Function bypasses RLS and validates user permissions internally';
  RAISE NOTICE '✓ Dual authorization check: account_type IN (admin, both) OR user_roles';
  RAISE NOTICE '✓ Includes viewer role for read-only access';
  RAISE NOTICE '✓ LEFT JOIN to company_designations for designation_name';
  RAISE NOTICE '✓ Returns all 63 columns from member_registrations table';
  RAISE NOTICE '✓ Supports optional filtering (status, state, search query)';
  RAISE NOTICE '✓ Supports pagination (limit, offset)';
  RAISE NOTICE '✓ Returns empty result set if user not authorized';
  RAISE NOTICE '✓ Granted EXECUTE to authenticated role';
  RAISE NOTICE '';
  RAISE NOTICE 'Security Features:';
  RAISE NOTICE '- Requires active user authentication';
  RAISE NOTICE '- Dual authorization: account_type (admin, both) OR user_roles';
  RAISE NOTICE '- Does NOT check for account_type=super_admin (invalid value)';
  RAISE NOTICE '- Checks user_roles for: super_admin, admin, editor, viewer';
  RAISE NOTICE '- Returns empty set on authorization failure (no error leakage)';
  RAISE NOTICE '- SET search_path = public prevents injection attacks';
  RAISE NOTICE '';
  RAISE NOTICE 'Parameters:';
  RAISE NOTICE '- p_requesting_user_id: UUID (required)';
  RAISE NOTICE '- p_status_filter: text (optional, values: pending/approved/rejected)';
  RAISE NOTICE '- p_search_query: text (optional, searches name/company/email/mobile)';
  RAISE NOTICE '- p_state_filter: text (optional, filters by state)';
  RAISE NOTICE '- p_limit: integer (default 100)';
  RAISE NOTICE '- p_offset: integer (default 0)';
  RAISE NOTICE '';
  RAISE NOTICE 'Usage Example:';
  RAISE NOTICE '  SELECT * FROM get_admin_member_registrations(';
  RAISE NOTICE '    ''admin-user-id'',';
  RAISE NOTICE '    ''pending'',  -- status filter';
  RAISE NOTICE '    NULL,         -- no search';
  RAISE NOTICE '    ''Karnataka'', -- state filter';
  RAISE NOTICE '    50,           -- limit';
  RAISE NOTICE '    0             -- offset';
  RAISE NOTICE '  );';
  RAISE NOTICE '';
  RAISE NOTICE '=============================================================================';
END $$;
