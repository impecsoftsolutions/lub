/*
  # Create Directory Field Visibility Settings Table

  1. New Tables
    - `directory_field_visibility`
      - `id` (uuid, primary key)
      - `field_name` (text, unique) - The name of the member field (e.g., 'phone_number', 'email')
      - `field_label` (text) - Human-readable label for the field (e.g., 'Phone Number', 'Email Address')
      - `show_to_public` (boolean) - Whether public visitors can see this field in expanded details
      - `show_to_members` (boolean) - Whether logged-in members can see this field in expanded details
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `directory_field_visibility` table
    - Add policy for anyone (including public) to read visibility settings
    - Add policy for authenticated users to update settings (admin-only in application logic)

  3. Initial Data
    - Insert default visibility settings for all member fields
    - Most fields are hidden by default for security
    - Only basic fields like name, company, and products/services are visible by default
*/

-- Create the directory_field_visibility table
CREATE TABLE IF NOT EXISTS directory_field_visibility (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_name text UNIQUE NOT NULL,
  field_label text NOT NULL,
  show_to_public boolean NOT NULL DEFAULT false,
  show_to_members boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE directory_field_visibility ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read visibility settings (needed for public directory to check what to show)
CREATE POLICY "Anyone can read field visibility settings"
  ON directory_field_visibility
  FOR SELECT
  USING (true);

-- Policy: Authenticated users can update visibility settings
CREATE POLICY "Authenticated users can update field visibility"
  ON directory_field_visibility
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Policy: Authenticated users can insert visibility settings
CREATE POLICY "Authenticated users can insert field visibility"
  ON directory_field_visibility
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Insert default visibility settings for all member fields
INSERT INTO directory_field_visibility (field_name, field_label, show_to_public, show_to_members) VALUES
  ('phone_number', 'Phone Number', false, false),
  ('email', 'Email Address', false, false),
  ('full_address', 'Full Company Address', false, false),
  ('city', 'City/Town', true, true),
  ('district', 'District', true, true),
  ('state', 'State', true, true),
  ('gst_number', 'GST Number', false, false),
  ('udyam_number', 'UDYAM Number', false, false),
  ('designation', 'Designation/Position', true, true),
  ('website', 'Website URL', false, true),
  ('products_services', 'Products & Services', true, true),
  ('member_since', 'Member Since', true, true)
ON CONFLICT (field_name) DO NOTHING;