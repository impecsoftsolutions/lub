/*
  # Add INSERT and UPDATE policies for validation rules management

  1. Changes
    - Add INSERT policy for super admins to create new validation rules
    - Update existing UPDATE policy to allow category changes
    - Add case-insensitive unique constraint on rule_name using lowercase
    - Add trigger to auto-convert rule_name to lowercase on insert/update

  2. Security
    - Only super admins can INSERT new validation rules
    - Only super admins can UPDATE validation rules (including category changes)
    - Maintain existing read policies for authenticated users

  3. Data Integrity
    - Enforce lowercase rule names automatically
    - Prevent duplicate rule names (case-insensitive)
*/

-- Drop existing unique constraint if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'validation_rules_rule_name_key'
  ) THEN
    ALTER TABLE validation_rules DROP CONSTRAINT validation_rules_rule_name_key;
  END IF;
END $$;

-- Add case-insensitive unique constraint on rule_name
CREATE UNIQUE INDEX IF NOT EXISTS validation_rules_rule_name_lower_unique
ON validation_rules(LOWER(rule_name));

-- Create or replace function to auto-lowercase rule_name
CREATE OR REPLACE FUNCTION lowercase_validation_rule_name()
RETURNS TRIGGER AS $$
BEGIN
  NEW.rule_name = LOWER(NEW.rule_name);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS trigger_lowercase_validation_rule_name ON validation_rules;
CREATE TRIGGER trigger_lowercase_validation_rule_name
  BEFORE INSERT OR UPDATE ON validation_rules
  FOR EACH ROW
  EXECUTE FUNCTION lowercase_validation_rule_name();

-- Add INSERT policy for super admins
CREATE POLICY "Super admins can insert validation rules"
  ON validation_rules
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'super_admin'
    )
  );

-- Drop and recreate UPDATE policy to ensure it covers all fields including category
DROP POLICY IF EXISTS "Super admins can update validation rules" ON validation_rules;
CREATE POLICY "Super admins can update validation rules"
  ON validation_rules
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'super_admin'
    )
  );
