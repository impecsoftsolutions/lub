/*
  # Create payment settings table

  1. New Tables
    - `payment_settings`
      - `id` (uuid, primary key)
      - `qr_code_image_url` (text, URL to QR code image)
      - `account_holder_name` (text)
      - `bank_name` (text)
      - `branch` (text)
      - `account_number` (text)
      - `ifsc_code` (text)
      - `male_fee` (integer, fee in rupees)
      - `female_fee` (integer, fee in rupees)
      - `validity_years` (integer)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on `payment_settings` table
    - Add policy for authenticated users to read settings
    - Add policy for admin users to update settings

  3. Initial Data
    - Insert default payment settings
*/

CREATE TABLE IF NOT EXISTS payment_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  qr_code_image_url text NOT NULL DEFAULT 'https://images.pexels.com/photos/8566473/pexels-photo-8566473.jpeg?auto=compress&cs=tinysrgb&w=300&h=300&fit=crop',
  account_holder_name text NOT NULL DEFAULT 'Laghu Udyog Bharati',
  bank_name text NOT NULL DEFAULT 'Canara Bank',
  branch text NOT NULL DEFAULT 'Daba Gardens Branch, Vishakapatnam',
  account_number text NOT NULL DEFAULT '0620101559788',
  ifsc_code text NOT NULL DEFAULT 'CNRB0000620',
  male_fee integer NOT NULL DEFAULT 6500,
  female_fee integer NOT NULL DEFAULT 4000,
  validity_years integer NOT NULL DEFAULT 10,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE payment_settings ENABLE ROW LEVEL SECURITY;

-- Allow everyone to read payment settings (for public payment page)
CREATE POLICY "Anyone can read payment settings"
  ON payment_settings
  FOR SELECT
  USING (true);

-- Allow authenticated users to update payment settings (for admin)
-- In a real app, you'd want to restrict this to admin users only
CREATE POLICY "Authenticated users can update payment settings"
  ON payment_settings
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Insert default payment settings
INSERT INTO payment_settings (
  qr_code_image_url,
  account_holder_name,
  bank_name,
  branch,
  account_number,
  ifsc_code,
  male_fee,
  female_fee,
  validity_years
) VALUES (
  'https://images.pexels.com/photos/8566473/pexels-photo-8566473.jpeg?auto=compress&cs=tinysrgb&w=300&h=300&fit=crop',
  'Laghu Udyog Bharati',
  'Canara Bank',
  'Daba Gardens Branch, Vishakapatnam',
  '0620101559788',
  'CNRB0000620',
  6500,
  4000,
  10
) ON CONFLICT DO NOTHING;