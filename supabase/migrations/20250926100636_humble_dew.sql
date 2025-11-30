/*
  # Seed company_designations table

  1. Data Seeding
    - Insert default company designations
    - Ensure no duplicates with ON CONFLICT DO NOTHING
    - All designations are active by default

  Default designations:
  - Proprietor, Partner, Managing Partner, Managing Director, Director
  - Joint Managing Director, Operations, President, Vice President
  - Chief Executive Officer, Chief Financial Officer, Chief Operating Officer
  - General Manager, Manager, Chairman
*/

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