/*
  # Add company_designation_id column to member_registrations

  1. Changes
    - Add `company_designation_id` column to `member_registrations` table
    - Column is of type uuid and references `company_designations.id`
    - Column is nullable to allow existing records to remain valid
    - Foreign key constraint ensures data integrity

  2. Notes
    - Existing `designation` column is preserved
    - New column allows for structured designation management
    - Nullable to support gradual migration from text to structured designations
*/

-- Add the company_designation_id column to member_registrations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'member_registrations' AND column_name = 'company_designation_id'
  ) THEN
    ALTER TABLE member_registrations 
    ADD COLUMN company_designation_id uuid;
  END IF;
END $$;

-- Add foreign key constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_member_registrations_company_designation'
  ) THEN
    ALTER TABLE member_registrations
    ADD CONSTRAINT fk_member_registrations_company_designation
    FOREIGN KEY (company_designation_id) REFERENCES company_designations(id)
    ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
END $$;