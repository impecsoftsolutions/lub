/*
  # Add Public Access to Validation Rules Table

  ## Overview
  This migration adds a Row Level Security (RLS) policy to allow anonymous (non-authenticated) 
  users to read active validation rules. This is required for the registration form (Join page) 
  to perform client-side validation for users who are not logged in.

  ## Problem Statement
  The validation_rules table was created with RLS enabled but only had policies allowing 
  authenticated users to read active rules. Anonymous users filling out the registration form 
  could not access validation rules, causing client-side validation to fail with 
  "Loaded 0 active validation rules from database" error.

  ## Changes

  1. **New RLS Policy for Anonymous Access**
     - Policy name: "Allow public read access to active validation rules"
     - Allows: SELECT operations
     - Target roles: anon (anonymous users) and authenticated users
     - Condition: is_active = true (only active rules are exposed)

  ## Security Considerations
  
  - This policy is SAFE because validation_rules contain only:
    - Regex patterns for validation (e.g., email format, mobile number format)
    - Error messages to display to users
    - No sensitive user data or secrets
  
  - The policy is restrictive:
    - Only SELECT operations are allowed (read-only)
    - Only active rules (is_active = true) are exposed
    - Write operations (INSERT, UPDATE, DELETE) remain restricted to super admins
  
  - This follows the same pattern as other public tables:
    - company_designations (public read access)
    - member_registrations (public read for approved members)
    - payment_settings (public read access)

  ## Impact

  - Anonymous users can now load validation rules for client-side form validation
  - Improves user experience with immediate validation feedback
  - Backend validation remains the authoritative source of truth
  - No security risks as validation patterns are not sensitive data

  ## Rollback

  To rollback this change:
  ```sql
  DROP POLICY IF EXISTS "Allow public read access to active validation rules" ON validation_rules;
  ```
*/

-- Create policy to allow anonymous and authenticated users to read active validation rules
CREATE POLICY "Allow public read access to active validation rules"
  ON validation_rules
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- Note: Existing policies for super admin UPDATE operations remain unchanged
-- This only adds SELECT access for anonymous users to active rules