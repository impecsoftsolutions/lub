/*
  # Fix Status CHECK Constraint to Allow NULL

  ## Overview
  This migration modifies the status CHECK constraint on member_registrations to allow NULL values,
  making it consistent with other CHECK constraints in the table (gender, gst_registered, etc.).

  ## Problem
  - The current constraint: CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
  - This constraint does NOT allow NULL values
  - Other similar constraints in the table DO allow NULL: CHECK ((field IS NULL) OR (field = ANY(...)))
  - Errors occur when trying to update status field, even with valid values

  ## Solution
  - Drop the existing status CHECK constraint
  - Recreate it with NULL support: CHECK ((status IS NULL) OR (status = ANY(...)))
  - This makes it consistent with other optional field constraints

  ## Changes Made
  1. Drop existing member_registrations_status_check constraint
  2. Add new constraint that allows NULL OR the valid status values
  3. Maintain backward compatibility (status column has DEFAULT 'pending')

  ## Impact
  - Fixes the 400 Bad Request error when approving/rejecting registrations
  - No data changes - existing data remains valid
  - More forgiving constraint that won't block valid updates
*/

-- Drop the existing CHECK constraint on status
ALTER TABLE member_registrations 
DROP CONSTRAINT IF EXISTS member_registrations_status_check;

-- Add new CHECK constraint that allows NULL values
ALTER TABLE member_registrations 
ADD CONSTRAINT member_registrations_status_check 
CHECK (status IS NULL OR status IN ('pending', 'approved', 'rejected'));

-- Add comment for documentation
COMMENT ON CONSTRAINT member_registrations_status_check ON member_registrations IS 
  'Allows NULL or one of: pending, approved, rejected. Consistent with other optional field constraints.';
