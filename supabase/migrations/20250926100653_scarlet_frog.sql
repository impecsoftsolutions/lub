/*
  # Seed lub_roles_master table

  1. Data Seeding
    - Insert default LUB organizational roles
    - Ensure no duplicates with ON CONFLICT DO NOTHING
    - All roles are active by default

  Default LUB roles:
  - President, General Secretary, Treasurer, Vice President
  - Joint General Secretary, Secretary, Executive Committee Member
*/

INSERT INTO lub_roles_master (role_name, is_active) VALUES
  ('President', true),
  ('General Secretary', true),
  ('Treasurer', true),
  ('Vice President', true),
  ('Joint General Secretary', true),
  ('Secretary', true),
  ('Executive Committee Member', true)
ON CONFLICT (role_name) DO NOTHING;