/*
  # Update mobile number validation pattern

  1. Changes
    - Updates mobile_number validation rule pattern from ^[6-9]\d{9}$ to ^[1-9]\d{9}$
    - Updates error message to reflect that mobile can start with 1-9
    - Updates description for clarity

  This allows mobile numbers starting with 1-9 instead of restricting to 6-9 only.
*/

UPDATE validation_rules
SET 
  validation_pattern = '^[1-9]\d{9}$',
  error_message = 'Mobile number must be 10 digits and cannot start with 0',
  description = 'Validates mobile number format (10 digits starting with 1-9)',
  updated_at = now()
WHERE rule_name = 'mobile_number';
