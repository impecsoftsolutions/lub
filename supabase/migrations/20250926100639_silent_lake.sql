/*
  # Add company_designation_id to member_registrations

  1. Schema Changes
    - Add `company_designation_id` column to `member_registrations`
    - Create foreign key relationship to `company_designations.id`
    - Keep existing `designation` column for compatibility during migration

  2. Notes
    - Column is nullable initially to allow existing records
    - Foreign key ensures data integrity
    - Old `designation` column will be deprecated after migration
*/

-- Add company_designation_id column
ALTER TABLE member_registrations 
ADD COLUMN IF NOT EXISTS company_designation_id uuid;

-- Create foreign key constraint
ALTER TABLE member_registrations 
ADD CONSTRAINT fk_member_registrations_company_designation
FOREIGN KEY (company_designation_id) 
REFERENCES company_designations(id) 
ON UPDATE CASCADE 
ON DELETE RESTRICT;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_member_registrations_company_designation_id 
ON member_registrations(company_designation_id);