/*
  # Add Validation Rule Mapping to Form Field Configurations

  ## Overview
  Connects validation rules to form fields, enabling admins to control which validation
  rule applies to each field through the Form Field Configuration interface.

  ## Changes
  1. Add validation_rule_id column to form_field_configurations table
     - nullable uuid foreign key to validation_rules table
     - allows "No Validation" option when null
     - cascades validation rule deletions to null (preserve field config)

  2. Create index on validation_rule_id for efficient queries

  3. Populate existing validation rule mappings for fields that currently use validation:
     - email -> email_format
     - mobile_number -> mobile_number
     - alternate_mobile -> mobile_number
     - pin_code -> pin_code
     - gst_number -> gst_number
     - pan_company -> pan_number
     - website -> website

  ## Security
  - RLS policies already exist on form_field_configurations
  - Foreign key ensures validation_rule_id references valid rules only
*/

-- Add validation_rule_id column to form_field_configurations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'form_field_configurations' AND column_name = 'validation_rule_id'
  ) THEN
    ALTER TABLE form_field_configurations 
    ADD COLUMN validation_rule_id uuid REFERENCES validation_rules(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create index for efficient validation rule lookups
CREATE INDEX IF NOT EXISTS idx_form_field_configurations_validation_rule_id 
ON form_field_configurations(validation_rule_id);

-- Populate existing validation rule mappings
-- Email field -> email_format validation rule
UPDATE form_field_configurations
SET validation_rule_id = (
  SELECT id FROM validation_rules WHERE rule_name = 'email_format' LIMIT 1
)
WHERE field_name = 'email' AND validation_rule_id IS NULL;

-- Mobile number field -> mobile_number validation rule
UPDATE form_field_configurations
SET validation_rule_id = (
  SELECT id FROM validation_rules WHERE rule_name = 'mobile_number' LIMIT 1
)
WHERE field_name = 'mobile_number' AND validation_rule_id IS NULL;

-- Alternate mobile field -> mobile_number validation rule
UPDATE form_field_configurations
SET validation_rule_id = (
  SELECT id FROM validation_rules WHERE rule_name = 'mobile_number' LIMIT 1
)
WHERE field_name = 'alternate_mobile' AND validation_rule_id IS NULL;

-- PIN code field -> pin_code validation rule
UPDATE form_field_configurations
SET validation_rule_id = (
  SELECT id FROM validation_rules WHERE rule_name = 'pin_code' LIMIT 1
)
WHERE field_name = 'pin_code' AND validation_rule_id IS NULL;

-- GST number field -> gst_number validation rule
UPDATE form_field_configurations
SET validation_rule_id = (
  SELECT id FROM validation_rules WHERE rule_name = 'gst_number' LIMIT 1
)
WHERE field_name = 'gst_number' AND validation_rule_id IS NULL;

-- PAN company field -> pan_number validation rule
UPDATE form_field_configurations
SET validation_rule_id = (
  SELECT id FROM validation_rules WHERE rule_name = 'pan_number' LIMIT 1
)
WHERE field_name = 'pan_company' AND validation_rule_id IS NULL;

-- Website field -> website validation rule
UPDATE form_field_configurations
SET validation_rule_id = (
  SELECT id FROM validation_rules WHERE rule_name = 'website' LIMIT 1
)
WHERE field_name = 'website' AND validation_rule_id IS NULL;