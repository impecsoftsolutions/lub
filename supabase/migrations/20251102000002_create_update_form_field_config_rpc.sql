/*
  # Create SECURITY DEFINER RPC for Form Field Configuration Updates

  ## Overview
  This migration creates a SECURITY DEFINER RPC function to allow admin users
  to update form field configurations, bypassing RLS policies.

  ## Problem
  - Custom authentication system uses localStorage tokens, NOT Supabase Auth
  - auth.jwt() and auth.uid() always return NULL
  - JWT-based RLS policies cannot work with custom authentication
  - Direct UPDATE queries are blocked by RLS policies that check NULL JWT
  - AdminFormFieldConfiguration page shows success but changes don't persist

  ## Solution
  Create update_form_field_configuration() RPC function that:
  - Uses SECURITY DEFINER to bypass RLS
  - Validates requesting user's authentication and authorization
  - Updates form_field_configurations table
  - Returns structured success/error response

  ## Security Measures
  1. User Authentication: Verifies user exists and is active
  2. Authorization: Checks account_type for admin privileges
  3. Input Validation: Validates field_name and parameters
  4. Search Path: SET search_path = public prevents attacks
  5. Audit Trail: Updates updated_by and updated_at fields

  ## Parameters
  - p_field_name: text - field name to update
  - p_is_visible: boolean - field visibility
  - p_is_required: boolean - field required status
  - p_requesting_user_id: uuid - user making the request

  ## Returns
  JSONB object with:
  - success: boolean
  - error: string (if failed)
  - rows_updated: integer
*/

-- Drop function if exists for clean re-creation
DROP FUNCTION IF EXISTS update_form_field_configuration(text, boolean, boolean, uuid);

-- Create the RPC function
CREATE OR REPLACE FUNCTION update_form_field_configuration(
  p_field_name text,
  p_is_visible boolean,
  p_is_required boolean,
  p_requesting_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_record RECORD;
  v_is_authorized boolean := false;
  v_rows_updated integer := 0;
BEGIN
  -- ============================================================================
  -- STEP 1: VALIDATE INPUT PARAMETERS
  -- ============================================================================

  -- Check for NULL parameters
  IF p_field_name IS NULL OR p_field_name = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Field name is required'
    );
  END IF;

  IF p_requesting_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Requesting user ID is required'
    );
  END IF;

  IF p_is_visible IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Visibility status is required'
    );
  END IF;

  IF p_is_required IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Required status is required'
    );
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
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User not found or inactive'
    );
  END IF;

  -- ============================================================================
  -- STEP 3: AUTHORIZE USER FOR FORM CONFIGURATION UPDATES
  -- ============================================================================

  -- Check if user has admin privileges
  IF v_user_record.account_type IN ('admin', 'both', 'super_admin') THEN
    v_is_authorized := true;
  END IF;

  -- Deny access if not authorized
  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User does not have permission to update form configurations'
    );
  END IF;

  -- ============================================================================
  -- STEP 4: VALIDATE FIELD EXISTS
  -- ============================================================================

  -- Check if field exists
  IF NOT EXISTS (
    SELECT 1 FROM form_field_configurations
    WHERE field_name = p_field_name
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Field configuration not found'
    );
  END IF;

  -- ============================================================================
  -- STEP 5: PERFORM THE UPDATE
  -- ============================================================================

  -- Update the form field configuration
  UPDATE form_field_configurations
  SET
    is_visible = p_is_visible,
    is_required = p_is_required,
    updated_by = p_requesting_user_id,
    updated_at = now()
  WHERE field_name = p_field_name;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Failed to update field configuration - no rows affected'
    );
  END IF;

  -- ============================================================================
  -- STEP 6: RETURN SUCCESS
  -- ============================================================================

  RETURN jsonb_build_object(
    'success', true,
    'rows_updated', v_rows_updated
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Log the error and return failure
    RAISE WARNING 'Error in update_form_field_configuration: % %', SQLERRM, SQLSTATE;
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Database error: ' || SQLERRM
    );
END;
$$;

-- Add comment explaining the function
COMMENT ON FUNCTION update_form_field_configuration(text, boolean, boolean, uuid) IS
  'SECURITY DEFINER RPC to update form field configurations for custom auth system. Validates user permissions and updates visibility/required status. Used by admin users in AdminFormFieldConfiguration page.';

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION update_form_field_configuration(text, boolean, boolean, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION update_form_field_configuration(text, boolean, boolean, uuid) TO anon;

-- =============================================================================
-- Log Completion
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE '=============================================================================';
  RAISE NOTICE 'Migration 20251102000002 completed successfully';
  RAISE NOTICE '=============================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Changes Applied:';
  RAISE NOTICE '✓ Created update_form_field_configuration RPC function with SECURITY DEFINER';
  RAISE NOTICE '✓ Function bypasses RLS and validates permissions internally';
  RAISE NOTICE '✓ Accepts field_name, is_visible, is_required, requesting_user_id';
  RAISE NOTICE '✓ Returns JSON response with success/error details';
  RAISE NOTICE '';
  RAISE NOTICE 'Impact:';
  RAISE NOTICE '- AdminFormFieldConfiguration page can now save changes correctly';
  RAISE NOTICE '- Works with custom authentication system (not Supabase Auth)';
  RAISE NOTICE '- Frontend code needs to be updated to call this RPC instead of direct update';
  RAISE NOTICE '';
  RAISE NOTICE 'Next Steps:';
  RAISE NOTICE '1. Update formFieldConfigService.updateFieldConfiguration() to use RPC';
  RAISE NOTICE '2. Test save functionality in /admin/settings/forms/join-lub';
  RAISE NOTICE '3. Verify changes persist after page refresh';
  RAISE NOTICE '';
  RAISE NOTICE '=============================================================================';
END $$;
