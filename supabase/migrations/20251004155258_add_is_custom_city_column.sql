/*
  # Add is_custom_city Column to Member Registrations

  1. Changes
    - Add `is_custom_city` boolean column to `member_registrations` table
    - Set default value to false
    - Update existing records where `other_city_name` has a value to set `is_custom_city = true`
    - Set `city` to NULL for custom cities (where is_custom_city = true)
    - Add CHECK constraint to ensure if is_custom_city = true, other_city_name must not be null

  2. Data Migration
    - All existing records with other_city_name populated will have is_custom_city set to true
    - Their city field will be set to NULL to clearly indicate the city value is in other_city_name

  3. Constraints
    - Ensures data integrity by requiring other_city_name when is_custom_city is true
*/

-- Add the is_custom_city column with default false
ALTER TABLE member_registrations 
ADD COLUMN IF NOT EXISTS is_custom_city boolean DEFAULT false;

-- Update existing records where other_city_name has a value
-- Set is_custom_city = true and city = NULL for these records
UPDATE member_registrations
SET 
  is_custom_city = true,
  city = NULL
WHERE other_city_name IS NOT NULL 
  AND other_city_name != '';

-- Add CHECK constraint to ensure data integrity
-- If is_custom_city is true, other_city_name must not be null or empty
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'member_registrations_custom_city_check'
  ) THEN
    ALTER TABLE member_registrations
    ADD CONSTRAINT member_registrations_custom_city_check
    CHECK (
      (is_custom_city = false) OR 
      (is_custom_city = true AND other_city_name IS NOT NULL AND other_city_name != '')
    );
  END IF;
END $$;

-- Create index on is_custom_city for efficient querying
CREATE INDEX IF NOT EXISTS idx_member_registrations_is_custom_city 
ON member_registrations(is_custom_city);
