/*
  # Update RLS policies for payment_settings table

  1. Security Updates
    - Enable RLS on payment_settings table
    - Allow public read access for payment information display
    - Allow authenticated users to insert and update settings
    - Drop existing policies to avoid conflicts

  2. Policy Details
    - `payment_settings_public_read`: Allows anonymous and authenticated users to read payment settings
    - `payment_settings_auth_insert`: Allows authenticated users to insert new payment settings
    - `payment_settings_auth_update`: Allows authenticated users to update existing payment settings
*/

-- Table name: payment_settings
-- Primary key: id (uuid)
-- Single global row setup

-- First, enable RLS if not already done
ALTER TABLE public.payment_settings ENABLE ROW LEVEL SECURITY;

-- Allow everyone (public + logged in) to SELECT
DROP POLICY IF EXISTS "payment_settings_public_read" ON public.payment_settings;
CREATE POLICY "payment_settings_public_read"
  ON public.payment_settings
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Allow authenticated users to INSERT
DROP POLICY IF EXISTS "payment_settings_auth_insert" ON public.payment_settings;
CREATE POLICY "payment_settings_auth_insert"
  ON public.payment_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow authenticated users to UPDATE
DROP POLICY IF EXISTS "payment_settings_auth_update" ON public.payment_settings;
CREATE POLICY "payment_settings_auth_update"
  ON public.payment_settings
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);