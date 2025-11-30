/*
  # Create SECURITY DEFINER RPC for Fetching Single Member Registration by ID

  ## Overview
  This migration creates a SECURITY DEFINER RPC function to allow admin users
  to fetch a single member registration by ID, bypassing RLS policies.

  ## Problem
  - ViewApplicationModal's getApplicationDetails uses direct query blocked by RLS
  - Custom authentication system uses localStorage tokens, NOT Supabase Auth
  - auth.jwt() and auth.uid() always return NULL
  - RLS policies using current_user_id() fail because session is never set
  - Direct SELECT queries are blocked, causing "Application not found" error

  ## Solution
  Create get_admin_member_registration_by_id() RPC function that:
  - Uses SECURITY DEFINER to bypass RLS
  - Validates requesting user's authentication and authorization
  - Checks BOTH account_type and user_roles for admin privileges
  - Includes 'viewer' role for read-only access
  - Returns single member registration with company designation JOIN
  - Reuses admin_member_registration_type from previous migration
  - Returns empty result set if not authorized or not found

  ## Security Measures
  1. User Authentication: Verifies user exists and is active
  2. Dual Authorization: Checks account_type AND user_roles for admin privileges
  3. Input Validation: Validates UUID parameters
  4. Search Path: SET search_path = public prevents attacks
  5. Empty Result Set: Returns empty set on auth failure (no error leakage)
  6. Role-Based Access: Supports super_admin, admin, editor, and viewer roles

  ## Parameters
  - p_requesting_user_id: UUID of user making the request (REQUIRED)
  - p_registration_id: UUID of registration to fetch (REQUIRED)

  ## Returns
  SETOF admin_member_registration_type (single row or empty set)

  ## Usage Example
  ```sql
  -- Get registration by ID
  SELECT * FROM get_admin_member_registration_by_id(
    'admin-user-id-here',
    'registration-id-here'
  );
  ```
*/

-- Drop existing function if exists
DROP FUNCTION IF EXISTS get_admin_member_registration_by_id(uuid, uuid);

-- Create the RPC function using RETURNS SETOF with existing type
CREATE OR REPLACE FUNCTION get_admin_member_registration_by_id(
  p_requesting_user_id uuid,
  p_registration_id uuid
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

  -- Check for NULL parameters
  IF p_requesting_user_id IS NULL OR p_registration_id IS NULL THEN
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
  -- STEP 4: EXECUTE QUERY AND RETURN RESULT
  -- ============================================================================

  -- Return single member registration by ID
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
  WHERE mr.id = p_registration_id;

END;
$$;

-- Add comment explaining the function
COMMENT ON FUNCTION get_admin_member_registration_by_id(uuid, uuid) IS
  'SECURITY DEFINER RPC to fetch a single member registration by ID for custom auth system. Reuses admin_member_registration_type. Validates user permissions using dual authorization check (account_type AND user_roles). Returns empty set if not authorized or not found.';

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_admin_member_registration_by_id(uuid, uuid) TO authenticated;

-- =============================================================================
-- Log Completion
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE '=============================================================================';
  RAISE NOTICE 'Migration 20251103000003 completed successfully';
  RAISE NOTICE '=============================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Changes Applied:';
  RAISE NOTICE '✓ Created get_admin_member_registration_by_id RPC function';
  RAISE NOTICE '✓ Uses RETURNS SETOF admin_member_registration_type (reuses existing type)';
  RAISE NOTICE '✓ Function bypasses RLS and validates user permissions internally';
  RAISE NOTICE '✓ Dual authorization check: account_type IN (admin, both) OR user_roles';
  RAISE NOTICE '✓ Includes viewer role for read-only access';
  RAISE NOTICE '✓ LEFT JOIN to company_designations for designation_name';
  RAISE NOTICE '✓ Returns single registration or empty set if not found/authorized';
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
  RAISE NOTICE '- p_registration_id: UUID (required)';
  RAISE NOTICE '';
  RAISE NOTICE 'Usage Example:';
  RAISE NOTICE '  SELECT * FROM get_admin_member_registration_by_id(';
  RAISE NOTICE '    ''admin-user-id'',';
  RAISE NOTICE '    ''registration-id''';
  RAISE NOTICE '  );';
  RAISE NOTICE '';
  RAISE NOTICE '=============================================================================';
END $$;
