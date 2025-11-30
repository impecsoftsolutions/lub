/*
  # Fix payment_settings RLS policy

  1. Security Updates
    - Enable RLS on payment_settings table
    - Drop any existing conflicting policies
    - Create new policy allowing authenticated users full access to payment_settings

  This fixes the "new row violates row-level security policy" error when trying to upsert payment settings.
*/

ALTER TABLE payment_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can upsert payment_settings" ON payment_settings;

CREATE POLICY "Authenticated can upsert payment_settings"
ON payment_settings
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);