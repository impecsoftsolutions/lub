/*
  # Insert default LUB roles

  1. New Data
    - Insert 7 standard LUB roles into `lub_roles_master` table:
      - President
      - General Secretary  
      - Treasurer
      - Vice President
      - Joint General Secretary
      - Secretary
      - Executive Committee Member
    
  2. Safety
    - Uses ON CONFLICT DO NOTHING to prevent duplicates
    - Safe to run multiple times
    - All roles set as active by default
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