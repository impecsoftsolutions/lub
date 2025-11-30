/*
  # Update payment_settings table for state-specific management

  1. Schema Changes
    - Add `state` column as primary key
    - Remove old `id` column and constraints
    - Add unique constraint on state
    - Update existing data to have a default state

  2. Security
    - Update RLS policies for state-based access
    - Maintain public read access
    - Authenticated users can manage all states

  3. Data Migration
    - Preserve existing payment settings data
    - Set default state for existing records
*/

-- Step 1: Add state column and update existing data
ALTER TABLE payment_settings ADD COLUMN IF NOT EXISTS state text;

-- Update existing records to have a default state (if any exist)
UPDATE payment_settings SET state = 'Andhra Pradesh' WHERE state IS NULL;

-- Step 2: Drop old constraints and recreate with state as primary key
ALTER TABLE payment_settings DROP CONSTRAINT IF EXISTS payment_settings_pkey;
DROP INDEX IF EXISTS payment_settings_pkey;

-- Make state the primary key
ALTER TABLE payment_settings ADD CONSTRAINT payment_settings_pkey PRIMARY KEY (state);

-- Drop the old id column since we're using state as primary key
ALTER TABLE payment_settings DROP COLUMN IF EXISTS id;

-- Step 3: Ensure state column is not null
ALTER TABLE payment_settings ALTER COLUMN state SET NOT NULL;

-- Step 4: Update RLS policies
DROP POLICY IF EXISTS "Public can read payment settings" ON payment_settings;
DROP POLICY IF EXISTS "Authenticated users can modify payment settings" ON payment_settings;

-- Enable RLS
ALTER TABLE payment_settings ENABLE ROW LEVEL SECURITY;

-- Add updated policies
CREATE POLICY "Public can read payment settings"
ON payment_settings
FOR SELECT
TO public
USING (true);

CREATE POLICY "Authenticated users can manage payment settings"
ON payment_settings
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Step 5: Update the timestamp trigger function to work with new schema
CREATE OR REPLACE FUNCTION update_payment_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_payment_settings_trigger ON payment_settings;

CREATE TRIGGER update_payment_settings_trigger
BEFORE UPDATE ON payment_settings
FOR EACH ROW
EXECUTE FUNCTION update_payment_settings_timestamp();