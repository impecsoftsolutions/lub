/*
  # Create validation_rules table for centralized validation management

  1. New Tables
    - `validation_rules`
      - `id` (uuid, primary key)
      - `rule_name` (text, unique) - Unique identifier for the rule
      - `rule_type` (text) - Type of validation (e.g., 'email', 'mobile', 'pin_code')
      - `category` (text) - Category grouping (Contact, Document, Address)
      - `validation_pattern` (text) - Regex pattern for validation
      - `error_message` (text) - Custom error message to display
      - `description` (text) - Human-readable description of the rule
      - `is_active` (boolean) - Whether the rule is currently active
      - `display_order` (integer) - Order for display in admin interface
      - `created_at` (timestamptz) - Creation timestamp
      - `updated_at` (timestamptz) - Last update timestamp

  2. Security
    - Enable RLS on `validation_rules` table
    - Super admins can SELECT, UPDATE validation rules
    - Authenticated users can SELECT active validation rules (read-only)
    - No one can INSERT or DELETE rules (pre-populated only)

  3. Indexes
    - Index on rule_name for fast lookups
    - Index on rule_type for filtering
    - Index on is_active for filtering active rules
    - Index on category for grouped queries
*/

-- Create validation_rules table
CREATE TABLE IF NOT EXISTS validation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name text NOT NULL UNIQUE,
  rule_type text NOT NULL,
  category text NOT NULL,
  validation_pattern text NOT NULL,
  error_message text NOT NULL,
  description text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_validation_rules_rule_name ON validation_rules(rule_name);
CREATE INDEX IF NOT EXISTS idx_validation_rules_rule_type ON validation_rules(rule_type);
CREATE INDEX IF NOT EXISTS idx_validation_rules_is_active ON validation_rules(is_active);
CREATE INDEX IF NOT EXISTS idx_validation_rules_category ON validation_rules(category);

-- Enable Row Level Security
ALTER TABLE validation_rules ENABLE ROW LEVEL SECURITY;

-- Policy: Authenticated users can read active validation rules
CREATE POLICY "Authenticated users can read active validation rules"
  ON validation_rules
  FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Policy: Super admins can read all validation rules
CREATE POLICY "Super admins can read all validation rules"
  ON validation_rules
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'super_admin'
    )
  );

-- Policy: Super admins can update validation rules
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

-- Create function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_validation_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update updated_at
DROP TRIGGER IF EXISTS trigger_update_validation_rules_updated_at ON validation_rules;
CREATE TRIGGER trigger_update_validation_rules_updated_at
  BEFORE UPDATE ON validation_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_validation_rules_updated_at();
