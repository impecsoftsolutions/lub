/*
  # Fix CHECK Constraints to Allow NULL Values - Phase 2

  ## Overview
  This migration modifies the CHECK constraints on the `member_registrations` table to allow NULL values
  for optional fields while maintaining data integrity for non-null values.

  ## Background
  - Phase 1 migration removed NOT NULL constraints from these fields
  - However, the original inline CHECK constraints still only allowed specific values ('yes', 'no', 'male', 'female')
  - When the form submits with empty optional fields, they become empty strings or NULL
  - The CHECK constraints reject NULL values, causing form submission failures

  ## Changes Made

  1. **Drop Existing Inline CHECK Constraints**
     - Remove CHECK constraints for: `gst_registered`, `esic_registered`, `epf_registered`, `gender`
     - These were created as inline constraints in the original table definition

  2. **Add New Named CHECK Constraints**
     - `member_registrations_gst_registered_check`: Allow NULL or 'yes'/'no'
     - `member_registrations_esic_registered_check`: Allow NULL or 'yes'/'no'
     - `member_registrations_epf_registered_check`: Allow NULL or 'yes'/'no'
     - `member_registrations_gender_check`: Allow NULL or 'male'/'female'

  3. **Fields NOT Modified**
     - `status`: Kept as-is since it has a DEFAULT value and should always be valid
     - `mobile_number`: Length check is still valid and needed

  ## Security
  - No changes to RLS policies
  - No changes to data
  - Only constraint modifications

  ## Notes
  - This allows the form to submit with NULL values for optional fields
  - Application-level validation ensures proper values when fields are filled
  - Database-level validation still enforces valid enum values when present
*/

-- Step 1: Drop existing inline CHECK constraints
-- PostgreSQL names inline constraints automatically, we need to find and drop them

DO $$
DECLARE
  constraint_record RECORD;
BEGIN
  -- Find and drop CHECK constraints for gst_registered
  FOR constraint_record IN 
    SELECT con.conname
    FROM pg_constraint con
    INNER JOIN pg_class rel ON rel.oid = con.conrelid
    INNER JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE rel.relname = 'member_registrations'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) LIKE '%gst_registered%'
  LOOP
    EXECUTE format('ALTER TABLE member_registrations DROP CONSTRAINT IF EXISTS %I', constraint_record.conname);
  END LOOP;

  -- Find and drop CHECK constraints for esic_registered
  FOR constraint_record IN 
    SELECT con.conname
    FROM pg_constraint con
    INNER JOIN pg_class rel ON rel.oid = con.conrelid
    INNER JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE rel.relname = 'member_registrations'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) LIKE '%esic_registered%'
  LOOP
    EXECUTE format('ALTER TABLE member_registrations DROP CONSTRAINT IF EXISTS %I', constraint_record.conname);
  END LOOP;

  -- Find and drop CHECK constraints for epf_registered
  FOR constraint_record IN 
    SELECT con.conname
    FROM pg_constraint con
    INNER JOIN pg_class rel ON rel.oid = con.conrelid
    INNER JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE rel.relname = 'member_registrations'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) LIKE '%epf_registered%'
  LOOP
    EXECUTE format('ALTER TABLE member_registrations DROP CONSTRAINT IF EXISTS %I', constraint_record.conname);
  END LOOP;

  -- Find and drop CHECK constraints for gender
  FOR constraint_record IN 
    SELECT con.conname
    FROM pg_constraint con
    INNER JOIN pg_class rel ON rel.oid = con.conrelid
    INNER JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE rel.relname = 'member_registrations'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) LIKE '%gender%'
      AND pg_get_constraintdef(con.oid) NOT LIKE '%length%'
  LOOP
    EXECUTE format('ALTER TABLE member_registrations DROP CONSTRAINT IF EXISTS %I', constraint_record.conname);
  END LOOP;
END $$;

-- Step 2: Add new named CHECK constraints that allow NULL values

-- GST Registered: Allow NULL or 'yes'/'no'
ALTER TABLE member_registrations 
ADD CONSTRAINT member_registrations_gst_registered_check 
CHECK (gst_registered IS NULL OR gst_registered IN ('yes', 'no'));

-- ESIC Registered: Allow NULL or 'yes'/'no'
ALTER TABLE member_registrations 
ADD CONSTRAINT member_registrations_esic_registered_check 
CHECK (esic_registered IS NULL OR esic_registered IN ('yes', 'no'));

-- EPF Registered: Allow NULL or 'yes'/'no'
ALTER TABLE member_registrations 
ADD CONSTRAINT member_registrations_epf_registered_check 
CHECK (epf_registered IS NULL OR epf_registered IN ('yes', 'no'));

-- Gender: Allow NULL or 'male'/'female'
ALTER TABLE member_registrations 
ADD CONSTRAINT member_registrations_gender_check 
CHECK (gender IS NULL OR gender IN ('male', 'female'));
