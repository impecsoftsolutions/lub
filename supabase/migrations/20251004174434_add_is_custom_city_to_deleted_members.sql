/*
  # Add is_custom_city column to deleted_members table

  1. Changes
    - Add `is_custom_city` column to `deleted_members` table
      - Type: boolean
      - Default: false
      - Not null
    - Add `other_city_name` column to `deleted_members` table
      - Type: text (varchar 64)
      - Nullable (only populated when is_custom_city is true)

  2. Purpose
    - Ensures deleted_members table has the same structure as member_registrations
    - Allows soft delete operation to copy all fields including custom city data
    - Maintains data integrity when deleting members with custom cities

  3. Notes
    - This aligns with the custom city feature added to member_registrations
    - The is_custom_city flag indicates whether the member used a custom city name
    - When is_custom_city is true, other_city_name contains the custom value
*/

-- Add is_custom_city column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deleted_members' AND column_name = 'is_custom_city'
  ) THEN
    ALTER TABLE deleted_members ADD COLUMN is_custom_city boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- Add other_city_name column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deleted_members' AND column_name = 'other_city_name'
  ) THEN
    ALTER TABLE deleted_members ADD COLUMN other_city_name varchar(64);
  END IF;
END $$;

-- Add comment to document the columns
COMMENT ON COLUMN deleted_members.is_custom_city IS 'Indicates if the member used a custom city name (true) or selected from predefined cities (false)';
COMMENT ON COLUMN deleted_members.other_city_name IS 'Stores the custom city/town/village name when is_custom_city is true';
