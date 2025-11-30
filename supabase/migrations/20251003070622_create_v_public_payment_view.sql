/*
  # Create v_public_payment view for state visibility

  ## Overview
  This view joins payment_settings with states_master to show only states that are:
  1. Active in states_master (is_active = true)
  2. Have payment settings configured in payment_settings

  This ensures state dropdowns only show states that meet both criteria.

  ## Fields
  - state_name: Name of the state
  - account_holder_name: Bank account holder name
  - bank_name: Name of the bank
  - branch: Bank branch name
  - account_number: Bank account number
  - ifsc_code: Bank IFSC code
  - male_fee: Membership fee for male members
  - female_fee: Membership fee for female members
  - validity_years: Membership validity period in years
  - qr_code_image_url: URL to QR code image for payments

  ## Security
  - View inherits RLS policies from underlying tables
  - Public read access enabled for anonymous users
*/

-- Drop the view if it exists
DROP VIEW IF EXISTS v_public_payment;

-- Create the view
CREATE VIEW v_public_payment AS
SELECT 
  ps.state AS state_name,
  ps.account_holder_name,
  ps.bank_name,
  ps.branch,
  ps.account_number,
  ps.ifsc_code,
  ps.male_fee,
  ps.female_fee,
  ps.validity_years,
  ps.qr_code_image_url
FROM payment_settings ps
INNER JOIN states_master sm ON ps.state = sm.state_name
WHERE sm.is_active = true;

-- Grant public read access to the view
GRANT SELECT ON v_public_payment TO anon, authenticated;