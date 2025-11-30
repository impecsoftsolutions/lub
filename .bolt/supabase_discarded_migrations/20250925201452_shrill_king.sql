/*
  # Seed Designations Master

  1. Initial Data
    - Seeds masters.company_designations with standard business designations
    - All designations are set as active by default
    - Ordered alphabetically for consistency

  2. Data Integrity
    - Uses INSERT ... ON CONFLICT DO NOTHING to prevent duplicates
    - Maintains existing data if already present
*/

-- Seed the masters.company_designations table with initial designations
INSERT INTO masters.company_designations (designation, is_active) VALUES
  ('Chairman', true),
  ('Chief Executive Officer', true),
  ('Chief Financial Officer', true),
  ('Chief Operating Officer', true),
  ('Director', true),
  ('General Manager', true),
  ('Joint Managing Director', true),
  ('Manager', true),
  ('Managing Director', true),
  ('Managing Partner', true),
  ('Operations', true),
  ('Partner', true),
  ('President', true),
  ('Proprietor', true),
  ('Vice President', true)
ON CONFLICT (designation) DO NOTHING;