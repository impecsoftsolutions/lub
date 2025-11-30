/*
  # Insert Default Company Designations

  1. New Data
    - Insert common company designations into `company_designations` table
    - Uses ON CONFLICT DO NOTHING to prevent duplicates
    - All designations are set as active by default

  2. Designations Added
    - Proprietor
    - Partner
    - Managing Partner
    - Managing Director
    - Director
    - Joint Managing Director
    - Operations
    - President
    - Vice President
    - Chief Executive Officer
    - Chief Financial Officer
    - Chief Operating Officer
    - General Manager
    - Manager
    - Chairman
*/

-- Insert default company designations
INSERT INTO company_designations (designation_name, is_active) VALUES
  ('Proprietor', true),
  ('Partner', true),
  ('Managing Partner', true),
  ('Managing Director', true),
  ('Director', true),
  ('Joint Managing Director', true),
  ('Operations', true),
  ('President', true),
  ('Vice President', true),
  ('Chief Executive Officer', true),
  ('Chief Financial Officer', true),
  ('Chief Operating Officer', true),
  ('General Manager', true),
  ('Manager', true),
  ('Chairman', true)
ON CONFLICT (designation_name) DO NOTHING;