/*
  # Add display_order column to lub_roles_master table

  1. Schema Changes
    - Add `display_order` column to `lub_roles_master` table
    - Column is an integer that tracks the custom display order
    - Default value is set based on current row count to maintain existing order
    - Create index on display_order for efficient sorting

  2. Data Migration
    - Set initial display_order values for existing records based on alphabetical order
    - This ensures all existing records have a valid display_order value

  3. Notes
    - The display_order allows admins to manually reorder roles via drag-and-drop
    - Lower numbers appear first in the list
    - When new roles are added, they get the next available order number
*/

-- Add display_order column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lub_roles_master' AND column_name = 'display_order'
  ) THEN
    ALTER TABLE lub_roles_master ADD COLUMN display_order integer;
  END IF;
END $$;

-- Set initial display_order values for existing records (alphabetically)
WITH ordered_roles AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY role_name ASC) as rn
  FROM lub_roles_master
  WHERE display_order IS NULL
)
UPDATE lub_roles_master
SET display_order = ordered_roles.rn
FROM ordered_roles
WHERE lub_roles_master.id = ordered_roles.id;

-- Create index on display_order for efficient sorting
CREATE INDEX IF NOT EXISTS idx_lub_roles_display_order ON lub_roles_master(display_order);