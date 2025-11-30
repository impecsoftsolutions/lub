/*
  # Create Form Field Configurations Table

  ## Overview
  This migration creates a table to store dynamic configuration for the member registration form fields.
  Administrators can control which fields are visible, required, and their display order.

  ## New Tables
  - `form_field_configurations`
    - `id` (uuid, primary key) - Unique identifier
    - `field_name` (text, unique, not null) - Database column name (e.g., 'full_name', 'company_name')
    - `section_name` (text, not null) - Form section grouping (e.g., 'Personal Information')
    - `field_label` (text, not null) - Display label for the field
    - `is_visible` (boolean, default true) - Whether field appears in form
    - `is_required` (boolean, default false) - Whether field is required when visible
    - `display_order` (integer, not null) - Order of field within its section
    - `is_system_field` (boolean, default false) - System fields that cannot be hidden/modified
    - `created_by` (uuid) - User who created the configuration
    - `updated_by` (uuid) - User who last updated the configuration
    - `created_at` (timestamptz) - Creation timestamp
    - `updated_at` (timestamptz) - Last update timestamp

  ## Security
  - Enable RLS on `form_field_configurations` table
  - Allow public read access (for Join form to fetch configuration)
  - Allow authenticated admin users to insert/update/delete configurations

  ## Indexes
  - Index on section_name for efficient section queries
  - Index on display_order for sorting
  - Unique index on field_name to prevent duplicates

  ## Audit Trail
  - Tracks created_by and updated_by user IDs
  - Automatically updates updated_at timestamp via trigger
*/

-- Create form_field_configurations table
CREATE TABLE IF NOT EXISTS form_field_configurations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_name text UNIQUE NOT NULL,
  section_name text NOT NULL,
  field_label text NOT NULL,
  is_visible boolean DEFAULT true,
  is_required boolean DEFAULT false,
  display_order integer NOT NULL,
  is_system_field boolean DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE form_field_configurations ENABLE ROW LEVEL SECURITY;

-- Policy for public read access (Join form needs to fetch configuration)
CREATE POLICY "Allow public read for form field configurations"
  ON form_field_configurations
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Policy for authenticated insert access (admin only via application logic)
CREATE POLICY "Allow authenticated insert for form field configurations"
  ON form_field_configurations
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Policy for authenticated update access (admin only via application logic)
CREATE POLICY "Allow authenticated update for form field configurations"
  ON form_field_configurations
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Policy for authenticated delete access (admin only via application logic)
CREATE POLICY "Allow authenticated delete for form field configurations"
  ON form_field_configurations
  FOR DELETE
  TO authenticated
  USING (true);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_form_field_configurations_section_name 
ON form_field_configurations(section_name);

CREATE INDEX IF NOT EXISTS idx_form_field_configurations_display_order 
ON form_field_configurations(display_order);

CREATE INDEX IF NOT EXISTS idx_form_field_configurations_is_visible 
ON form_field_configurations(is_visible);

-- Create trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_form_field_configurations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_form_field_configurations_updated_at
  BEFORE UPDATE ON form_field_configurations
  FOR EACH ROW
  EXECUTE FUNCTION update_form_field_configurations_updated_at();