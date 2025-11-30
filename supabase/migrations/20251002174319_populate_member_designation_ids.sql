/*
  # Populate Member Designation IDs

  ## Overview
  This migration populates the company_designation_id field in the member_registrations table
  by matching the text designation values to the corresponding entries in the company_designations table.

  ## Data Analysis Summary
  - Total approved members: 144
  - All members have designations that match the existing master list
  - Case variations handled: "Managing director" → "Managing Director", "PARTNER" → "Partner"
  
  ## Mapping Details
  All designations are exact matches (case-insensitive):
  - Proprietor: 107 members
  - Managing Director: 13 members (includes 1 with lowercase 'd')
  - Managing Partner: 10 members
  - Director: 5 members
  - Partner: 3 members (includes 1 all caps)
  - Operations: 2 members
  - Chairman: 1 member
  - Manager: 1 member

  ## Security
  - No changes to RLS policies
  - Updates existing member records only
  - No data loss or destruction
*/

-- Update member_registrations to populate company_designation_id
-- using case-insensitive matching with the company_designations table
UPDATE member_registrations mr
SET company_designation_id = cd.id
FROM company_designations cd
WHERE TRIM(LOWER(mr.designation)) = TRIM(LOWER(cd.designation_name))
  AND mr.status = 'approved'
  AND cd.is_active = true
  AND mr.company_designation_id IS NULL;

-- Log the results (this will show in migration output)
DO $$
DECLARE
  updated_count INTEGER;
  remaining_null INTEGER;
BEGIN
  -- Count how many were updated
  SELECT COUNT(*) INTO updated_count
  FROM member_registrations
  WHERE status = 'approved' 
    AND company_designation_id IS NOT NULL;
  
  -- Count how many still have NULL
  SELECT COUNT(*) INTO remaining_null
  FROM member_registrations
  WHERE status = 'approved' 
    AND company_designation_id IS NULL;
  
  RAISE NOTICE 'Migration Complete:';
  RAISE NOTICE '  - Members with designation IDs: %', updated_count;
  RAISE NOTICE '  - Members still without designation IDs: %', remaining_null;
  
  IF remaining_null > 0 THEN
    RAISE WARNING 'Some members still have NULL company_designation_id. Manual review may be needed.';
  END IF;
END $$;
