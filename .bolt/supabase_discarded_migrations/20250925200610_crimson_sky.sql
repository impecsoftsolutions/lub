/*
  # Add foreign key constraint for designation_id

  1. Foreign Key Constraint
    - Add foreign key constraint between member_registrations.designation_id and masters.company_designations.id
    - Use IF NOT EXISTS to prevent errors if constraint already exists
    - Set ON DELETE RESTRICT to prevent deletion of referenced designations

  Note: The designation_id column already exists in member_registrations table
*/

-- Add foreign key constraint to link designation_id with masters.company_designations
ALTER TABLE public.member_registrations
ADD CONSTRAINT IF NOT EXISTS fk_designation_id
FOREIGN KEY (designation_id)
REFERENCES masters.company_designations(id)
ON DELETE RESTRICT;