/*
  # Seed validation_rules table with pre-populated validation patterns

  1. Contact Validation Rules
    - Email format validation
    - Mobile number validation (10 digits, 6-9 start)

  2. Document Validation Rules
    - GST number format (15 characters alphanumeric)
    - PAN number format (10 characters alphanumeric)
    - Aadhaar number validation (12 digits)

  3. Address Validation Rules
    - PIN code validation (6 digits)

  All rules are active by default and include helpful error messages.
*/

-- Insert Contact Validation rules
INSERT INTO validation_rules (
  rule_name,
  rule_type,
  category,
  validation_pattern,
  error_message,
  description,
  is_active,
  display_order
) VALUES
(
  'email_format',
  'email',
  'Contact Validation',
  '^[^\s@]+@[^\s@]+\.[^\s@]+$',
  'Please enter a valid email address',
  'Validates email format (e.g., user@example.com)',
  true,
  1
),
(
  'mobile_number',
  'mobile',
  'Contact Validation',
  '^[6-9]\d{9}$',
  'Mobile number must be 10 digits and start with 6, 7, 8, or 9',
  'Validates Indian mobile number format (10 digits starting with 6-9)',
  true,
  2
);

-- Insert Document Validation rules
INSERT INTO validation_rules (
  rule_name,
  rule_type,
  category,
  validation_pattern,
  error_message,
  description,
  is_active,
  display_order
) VALUES
(
  'gst_number',
  'gst',
  'Document Validation',
  '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$',
  'Please enter a valid 15-character GST number',
  'Validates GST number format (e.g., 22AAAAA0000A1Z5)',
  true,
  3
),
(
  'pan_number',
  'pan',
  'Document Validation',
  '^[A-Z]{5}[0-9]{4}[A-Z]{1}$',
  'PAN must be 10 alphanumeric characters (e.g., ABCDE1234F)',
  'Validates PAN card format (5 letters, 4 numbers, 1 letter)',
  true,
  4
),
(
  'aadhaar_number',
  'aadhaar',
  'Document Validation',
  '^\d{12}$',
  'Aadhaar number must be exactly 12 digits',
  'Validates Aadhaar card number (12 digits)',
  true,
  5
);

-- Insert Address Validation rules
INSERT INTO validation_rules (
  rule_name,
  rule_type,
  category,
  validation_pattern,
  error_message,
  description,
  is_active,
  display_order
) VALUES
(
  'pin_code',
  'pin',
  'Address Validation',
  '^\d{6}$',
  'PIN code must be exactly 6 digits',
  'Validates Indian PIN code format (6 digits)',
  true,
  6
);
