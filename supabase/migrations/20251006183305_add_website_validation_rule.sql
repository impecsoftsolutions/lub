/*
  # Add Website URL Validation Rule

  1. Changes
    - Add new validation rule for website URLs
    - Rule name: 'website'
    - Rule type: 'url'
    - Category: 'Contact Validation'
    - Display order: 7 (after existing 6 rules)
  
  2. Validation Pattern
    - Accepts: www.example.com, example.com, http://example.com, https://example.com
    - Supports: paths (/about), query parameters (?id=123), ports (:8080)
    - ASCII domains only (no international domain names)
    - Flexible protocol requirement (optional http:// or https://)
  
  3. Pattern Explanation
    - ^(https?:\/\/)? - Optional protocol (http:// or https://)
    - (www\.)? - Optional www subdomain
    - [a-z0-9]([a-z0-9-]*[a-z0-9])? - Domain start (letter/number, optional hyphens, letter/number)
    - (\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+ - Domain extensions (at least one .com, .org, etc)
    - (:[0-9]{1,5})? - Optional port number
    - ([\/\w.\-~:?#\[\]@!$&'()*+,;=]*)* - Optional path, query params, fragments
    - \/? - Optional trailing slash
    - $ - End of string
  
  4. Notes
    - Error message: "Please enter a valid website URL"
    - Active by default
    - Stored as-entered in database (no automatic protocol addition)
*/

-- Insert website validation rule
INSERT INTO validation_rules (
  rule_name,
  rule_type,
  category,
  validation_pattern,
  error_message,
  description,
  is_active,
  display_order
) VALUES (
  'website',
  'url',
  'Contact Validation',
  '^(https?:\/\/)?(www\.)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:[0-9]{1,5})?([\/\w.\-~:?#\[\]@!$&''()*+,;=]*)*\/?$',
  'Please enter a valid website URL',
  'Validates website URL format (supports www.example.com, example.com, http://example.com, https://example.com, with optional paths and query parameters)',
  true,
  7
)
ON CONFLICT (rule_name) DO UPDATE SET
  rule_type = EXCLUDED.rule_type,
  category = EXCLUDED.category,
  validation_pattern = EXCLUDED.validation_pattern,
  error_message = EXCLUDED.error_message,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active,
  display_order = EXCLUDED.display_order,
  updated_at = now();
