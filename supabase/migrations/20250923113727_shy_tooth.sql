/*
  # Create organization profile table

  1. New Tables
    - `organization_profile`
      - `id` (uuid, primary key, singleton)
      - `organization_name` (text)
      - `organization_logo_url` (text)
      - `contact_number` (text)
      - `email_address` (text)
      - `address` (text)
      - `social_media_handles` (jsonb)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on `organization_profile` table
    - Add policy for public read access
    - Add policy for authenticated users to update

  3. Data Migration
    - Migrate existing logo URL from payment_settings if exists
    - Remove organization_logo_url column from payment_settings
*/

-- Create organization_profile table
CREATE TABLE IF NOT EXISTS organization_profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_name text DEFAULT 'Laghu Udyog Bharati' NOT NULL,
  organization_logo_url text DEFAULT 'https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?auto=compress&cs=tinysrgb&w=200&h=200&fit=crop',
  contact_number text DEFAULT '+91 9848043392',
  email_address text DEFAULT 'contact@lub.org.in',
  address text DEFAULT 'Daba Gardens, Visakhapatnam, Andhra Pradesh, India',
  social_media_handles jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE organization_profile ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Anyone can read organization profile"
  ON organization_profile
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Authenticated users can update organization profile"
  ON organization_profile
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Insert default organization profile (singleton pattern)
INSERT INTO organization_profile (id, organization_name, organization_logo_url, contact_number, email_address, address, social_media_handles)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Laghu Udyog Bharati',
  'https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?auto=compress&cs=tinysrgb&w=200&h=200&fit=crop',
  '+91 9848043392',
  'contact@lub.org.in',
  'Daba Gardens, Visakhapatnam, Andhra Pradesh, India',
  '[]'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- Migrate existing logo URL from payment_settings if it exists
DO $$
BEGIN
  -- Check if organization_logo_url exists in payment_settings and migrate it
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payment_settings' 
    AND column_name = 'organization_logo_url'
  ) THEN
    -- Update organization_profile with logo from payment_settings
    UPDATE organization_profile 
    SET organization_logo_url = (
      SELECT organization_logo_url 
      FROM payment_settings 
      WHERE id = '00000000-0000-0000-0000-000000000001'
      LIMIT 1
    )
    WHERE id = '00000000-0000-0000-0000-000000000001'
    AND EXISTS (
      SELECT 1 FROM payment_settings 
      WHERE id = '00000000-0000-0000-0000-000000000001' 
      AND organization_logo_url IS NOT NULL
    );
    
    -- Remove organization_logo_url column from payment_settings
    ALTER TABLE payment_settings DROP COLUMN IF EXISTS organization_logo_url;
  END IF;
END $$;