/*
  # Create state leaders table for dynamic welcome messages

  1. New Tables
    - `state_leaders`
      - `id` (uuid, primary key)
      - `state` (text, not null)
      - `president_name` (text, not null)
      - `president_mobile` (text)
      - `general_secretary_name` (text)
      - `general_secretary_mobile` (text)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on `state_leaders` table
    - Add policy for public read access (needed for welcome emails)
    - Add policy for authenticated users to manage state leaders

  3. Sample Data
    - Insert default data for Andhra Pradesh and Telangana
*/

CREATE TABLE IF NOT EXISTS state_leaders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state text NOT NULL,
  president_name text NOT NULL,
  president_mobile text,
  general_secretary_name text,
  general_secretary_mobile text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE state_leaders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read state leaders"
  ON state_leaders
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Authenticated users can manage state leaders"
  ON state_leaders
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Insert sample data for Andhra Pradesh and Telangana
INSERT INTO state_leaders (state, president_name, president_mobile, general_secretary_name, general_secretary_mobile) VALUES
('Andhra Pradesh', 'Tulasi Yogish Chandra', '9848043392', 'Secretary Name', '9876543210'),
('Telangana', 'Anil Reddy', '9876543210', 'Telangana Secretary', '9123456789')
ON CONFLICT DO NOTHING;