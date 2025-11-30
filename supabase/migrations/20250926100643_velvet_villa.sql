/*
  # Map existing designation values to company_designations

  1. Data Migration
    - Update existing `member_registrations` records
    - Map `designation` text values to `company_designation_id`
    - Only update where exact matches exist in `company_designations`

  2. Process
    - Use UPDATE with JOIN to match designation names
    - Case-insensitive matching with TRIM for better accuracy
    - Only update records where company_designation_id is NULL
*/

-- Update member_registrations with matching company_designation_id
UPDATE member_registrations 
SET company_designation_id = cd.id
FROM company_designations cd
WHERE member_registrations.company_designation_id IS NULL
  AND TRIM(LOWER(member_registrations.designation)) = TRIM(LOWER(cd.designation_name))
  AND cd.is_active = true;

-- Log the mapping results (optional, for debugging)
-- This will show how many records were successfully mapped
DO $$
DECLARE
  mapped_count integer;
  total_count integer;
BEGIN
  SELECT COUNT(*) INTO mapped_count 
  FROM member_registrations 
  WHERE company_designation_id IS NOT NULL;
  
  SELECT COUNT(*) INTO total_count 
  FROM member_registrations;
  
  RAISE NOTICE 'Designation mapping complete: % out of % records mapped', mapped_count, total_count;
END $$;