/*
  # Add company_designation_id column to member_registrations

  1. New Column
    - `company_designation_id` (uuid, nullable)
      - References company_designations.id
      - Allows linking members to structured designations
      - Nullable to preserve existing records

  2. Foreign Key Constraint
    - ON UPDATE CASCADE: Updates if referenced designation ID changes
    - ON DELETE SET NULL: Preserves member record if designation is deleted

  3. Backward Compatibility
    - Existing `designation` text column remains unchanged
    - Allows gradual migration from text to structured references
*/

-- Add the company_designation_id column to member_registrations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'member_registrations' 
    AND column_name = 'company_designation_id'
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
    AND table_name = 'member_registrations'
  ) THEN
    ALTER TABLE member_registrations
    ADD CONSTRAINT fk_member_registrations_company_designation
    FOREIGN KEY (company_designation_id) 
    REFERENCES company_designations(id)
    ON UPDATE CASCADE
    ON DELETE SET NULL;
  END IF;
END $$;