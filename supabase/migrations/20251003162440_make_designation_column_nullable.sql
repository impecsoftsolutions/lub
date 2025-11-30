/*
  # Make designation column nullable

  ## Overview
  This migration makes the legacy `designation` text column in the `member_registrations` table nullable.
  The application has migrated to using `company_designation_id` (UUID) with joins to the `company_designations` table.
  
  ## Background
  - The old `designation` text column was created with a NOT NULL constraint
  - The new `company_designation_id` UUID column is now used throughout the application
  - All queries use joins to `company_designations` table to get the designation name
  - The old text column is no longer referenced anywhere in the application code
  
  ## Changes
  1. Remove NOT NULL constraint from the `designation` column
  2. This allows new registrations to be submitted without populating the deprecated column
  
  ## Security
  - No changes to RLS policies
  - No data modification or deletion
  
  ## Notes
  - This column is deprecated and can be removed in a future migration once the system is stable
  - All existing data in this column is preserved
  - New records will have NULL in this column, which is acceptable since it's not used
*/

-- Remove NOT NULL constraint from the designation column
ALTER TABLE member_registrations 
ALTER COLUMN designation DROP NOT NULL;