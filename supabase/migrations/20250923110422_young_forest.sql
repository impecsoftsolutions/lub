/*
  # Update member profile URL structure and add unique constraints

  1. Changes
    - Remove old slug column and add new URL structure support
    - Add unique constraints for email and mobile number
    - Update existing data to ensure no duplicates

  2. Security
    - Unique constraints prevent duplicate registrations
    - ID-based lookups ensure data integrity
*/

-- First, let's check for and handle any existing duplicates
-- Remove duplicate emails (keep the first one)
DELETE FROM member_registrations 
WHERE id NOT IN (
  SELECT DISTINCT ON (email) id 
  FROM member_registrations 
  ORDER BY email, created_at ASC
);

-- Remove duplicate mobile numbers (keep the first one)
DELETE FROM member_registrations 
WHERE id NOT IN (
  SELECT DISTINCT ON (mobile_number) id 
  FROM member_registrations 
  ORDER BY mobile_number, created_at ASC
);

-- Drop the old slug column if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'member_registrations' AND column_name = 'slug'
  ) THEN
    ALTER TABLE member_registrations DROP COLUMN slug;
  END IF;
END $$;

-- Add unique constraints
ALTER TABLE member_registrations 
ADD CONSTRAINT unique_email UNIQUE (email);

ALTER TABLE member_registrations 
ADD CONSTRAINT unique_mobile UNIQUE (mobile_number);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_member_registrations_email ON member_registrations (email);
CREATE INDEX IF NOT EXISTS idx_member_registrations_mobile ON member_registrations (mobile_number);