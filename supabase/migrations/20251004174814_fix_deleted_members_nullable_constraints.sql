/*
  # Fix Nullable Constraints in Deleted Members Table

  1. Problem
    - The deleted_members table has many NOT NULL constraints that don't match member_registrations
    - When soft deleting members with null values in these fields, the operation fails
    - This prevents proper archival of member records

  2. Changes
    - Alter all fields that are nullable in member_registrations to also be nullable in deleted_members
    - This ensures the soft delete operation can copy all data without constraint violations

  3. Fields Being Modified
    - Personal info: full_name, gender, date_of_birth, email, mobile_number
    - Company info: company_name, company_address
    - Location: city, district, state, pin_code
    - Business info: industry, activity_type, constitution, annual_turnover, number_of_employees, products_services
    - Registration info: gst_registered, pan_company, esic_registered, epf_registered
    - Payment info: amount_paid, payment_date, payment_mode

  4. Purpose
    - Allows soft delete to work for all members regardless of which fields have null values
    - Maintains data integrity by preserving the exact state of member records when deleted
*/

-- Drop NOT NULL constraints for fields that are nullable in member_registrations
ALTER TABLE deleted_members 
  ALTER COLUMN full_name DROP NOT NULL,
  ALTER COLUMN gender DROP NOT NULL,
  ALTER COLUMN date_of_birth DROP NOT NULL,
  ALTER COLUMN email DROP NOT NULL,
  ALTER COLUMN mobile_number DROP NOT NULL,
  ALTER COLUMN company_name DROP NOT NULL,
  ALTER COLUMN company_address DROP NOT NULL,
  ALTER COLUMN city DROP NOT NULL,
  ALTER COLUMN district DROP NOT NULL,
  ALTER COLUMN state DROP NOT NULL,
  ALTER COLUMN pin_code DROP NOT NULL,
  ALTER COLUMN industry DROP NOT NULL,
  ALTER COLUMN activity_type DROP NOT NULL,
  ALTER COLUMN constitution DROP NOT NULL,
  ALTER COLUMN annual_turnover DROP NOT NULL,
  ALTER COLUMN number_of_employees DROP NOT NULL,
  ALTER COLUMN products_services DROP NOT NULL,
  ALTER COLUMN gst_registered DROP NOT NULL,
  ALTER COLUMN pan_company DROP NOT NULL,
  ALTER COLUMN esic_registered DROP NOT NULL,
  ALTER COLUMN epf_registered DROP NOT NULL,
  ALTER COLUMN amount_paid DROP NOT NULL,
  ALTER COLUMN payment_date DROP NOT NULL,
  ALTER COLUMN payment_mode DROP NOT NULL;

-- Add comment to document the change
COMMENT ON TABLE deleted_members IS 'Stores soft-deleted member records. All field constraints match member_registrations table to allow accurate archival.';
