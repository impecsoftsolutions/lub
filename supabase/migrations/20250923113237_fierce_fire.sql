/*
  # Add organization logo to payment settings

  1. Changes
    - Add `organization_logo_url` column to payment_settings table
    - Set default logo URL to a placeholder or existing logo
    - Update existing records with default logo

  2. Security
    - No additional RLS changes needed as payment_settings already has proper policies
*/

DO $$
BEGIN
  -- Add organization_logo_url column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_settings' AND column_name = 'organization_logo_url'
  ) THEN
    ALTER TABLE payment_settings 
    ADD COLUMN organization_logo_url text DEFAULT 'https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?auto=compress&cs=tinysrgb&w=200&h=200&fit=crop';
  END IF;
END $$;