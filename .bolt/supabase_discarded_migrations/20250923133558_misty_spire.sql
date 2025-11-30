/*
  # Revert payment settings table name

  1. Changes
    - Rename `state_payment_settings` back to `payment_settings`
    - Update constraint names back to original
    - Recreate RLS policies with original table name

  2. Security
    - Maintain existing RLS policies
    - Preserve all access controls
*/

-- Rename table back to original name
ALTER TABLE state_payment_settings RENAME TO payment_settings;

-- Update constraint name back to original
ALTER TABLE payment_settings RENAME CONSTRAINT state_payment_settings_pkey TO payment_settings_pkey;

-- Drop existing policies
DROP POLICY IF EXISTS "Anyone can read payment settings" ON payment_settings;
DROP POLICY IF EXISTS "Authenticated users can update payment settings" ON payment_settings;

-- Recreate policies with original names
CREATE POLICY "Anyone can read payment settings"
  ON payment_settings
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Authenticated users can update payment settings"
  ON payment_settings
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);