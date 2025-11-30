/*
  # Seed Initial Form Field Configurations

  ## Overview
  This migration populates the form_field_configurations table with all fields from the Join form.
  Fields are organized by sections matching the form structure.

  ## Field Organization
  1. **Personal Information** - Basic personal details (full_name, gender, date_of_birth, email, mobile_number)
  2. **Company Information** - Company details (company_name, company_designation_id)
  3. **Location Information** - Address fields (state, district, city, pin_code, company_address)
  4. **Business Information** - Business details (industry, activity_type, constitution, annual_turnover, number_of_employees, products_services, brand_names, website)
  5. **Registration Information** - Legal registrations (gst_registered, gst_number, pan_company, esic_registered, epf_registered)
  6. **Document Uploads** - File uploads (gst_certificate_url, udyam_certificate_url, payment_proof_url)
  7. **Payment Information** - Payment details (amount_paid, payment_date, payment_mode, transaction_id, bank_reference)
  8. **Additional Information** - Extra contact details (alternate_contact_name, alternate_mobile, referred_by)

  ## System Fields
  Fields marked as system fields (is_system_field = true) are critical and should have restrictions:
  - id, created_at, updated_at, status - Cannot be modified through UI

  ## Initial Configuration
  - All fields start as visible (is_visible = true)
  - Only critical fields start as required based on current validation rules
  - Display order matches current form layout
*/

-- Insert Personal Information section fields
INSERT INTO form_field_configurations (field_name, section_name, field_label, is_visible, is_required, display_order, is_system_field) VALUES
  ('full_name', 'Personal Information', 'Full Name', true, true, 1, false),
  ('gender', 'Personal Information', 'Gender', true, true, 2, false),
  ('date_of_birth', 'Personal Information', 'Date of Birth', true, true, 3, false),
  ('email', 'Personal Information', 'Email Address', true, true, 4, false),
  ('mobile_number', 'Personal Information', 'Mobile Number', true, true, 5, false)
ON CONFLICT (field_name) DO NOTHING;

-- Insert Company Information section fields
INSERT INTO form_field_configurations (field_name, section_name, field_label, is_visible, is_required, display_order, is_system_field) VALUES
  ('company_name', 'Company Information', 'Company Name', true, false, 1, false),
  ('company_designation_id', 'Company Information', 'Designation', true, false, 2, false)
ON CONFLICT (field_name) DO NOTHING;

-- Insert Location Information section fields
INSERT INTO form_field_configurations (field_name, section_name, field_label, is_visible, is_required, display_order, is_system_field) VALUES
  ('state', 'Location Information', 'State', true, false, 1, false),
  ('district', 'Location Information', 'District', true, false, 2, false),
  ('city', 'Location Information', 'City/Town/Village', true, false, 3, false),
  ('pin_code', 'Location Information', 'PIN Code', true, false, 4, false),
  ('company_address', 'Location Information', 'Company Address', true, false, 5, false)
ON CONFLICT (field_name) DO NOTHING;

-- Insert Business Information section fields
INSERT INTO form_field_configurations (field_name, section_name, field_label, is_visible, is_required, display_order, is_system_field) VALUES
  ('industry', 'Business Information', 'Industry', true, false, 1, false),
  ('activity_type', 'Business Information', 'Activity Type', true, false, 2, false),
  ('constitution', 'Business Information', 'Industry Constitution', true, false, 3, false),
  ('annual_turnover', 'Business Information', 'Annual Turnover', true, false, 4, false),
  ('number_of_employees', 'Business Information', 'Number of Employees', true, false, 5, false),
  ('products_services', 'Business Information', 'Products & Services', true, false, 6, false),
  ('brand_names', 'Business Information', 'Brand Names', true, false, 7, false),
  ('website', 'Business Information', 'Website', true, false, 8, false)
ON CONFLICT (field_name) DO NOTHING;

-- Insert Registration Information section fields
INSERT INTO form_field_configurations (field_name, section_name, field_label, is_visible, is_required, display_order, is_system_field) VALUES
  ('gst_registered', 'Registration Information', 'GST Registered', true, false, 1, false),
  ('gst_number', 'Registration Information', 'GST Number', true, false, 2, false),
  ('pan_company', 'Registration Information', 'PAN (Company)', true, false, 3, false),
  ('esic_registered', 'Registration Information', 'ESIC Registered', true, false, 4, false),
  ('epf_registered', 'Registration Information', 'EPF Registered', true, false, 5, false)
ON CONFLICT (field_name) DO NOTHING;

-- Insert Document Uploads section fields
INSERT INTO form_field_configurations (field_name, section_name, field_label, is_visible, is_required, display_order, is_system_field) VALUES
  ('gst_certificate_url', 'Document Uploads', 'GST Certificate', true, false, 1, false),
  ('udyam_certificate_url', 'Document Uploads', 'UDYAM Certificate', true, false, 2, false),
  ('payment_proof_url', 'Document Uploads', 'Payment Proof', true, false, 3, false)
ON CONFLICT (field_name) DO NOTHING;

-- Insert Payment Information section fields
INSERT INTO form_field_configurations (field_name, section_name, field_label, is_visible, is_required, display_order, is_system_field) VALUES
  ('amount_paid', 'Payment Information', 'Amount Paid', true, false, 1, false),
  ('payment_date', 'Payment Information', 'Payment Date', true, true, 2, false),
  ('payment_mode', 'Payment Information', 'Payment Mode', true, false, 3, false),
  ('transaction_id', 'Payment Information', 'Transaction ID / Reference', true, false, 4, false),
  ('bank_reference', 'Payment Information', 'Bank Reference', true, false, 5, false)
ON CONFLICT (field_name) DO NOTHING;

-- Insert Additional Information section fields
INSERT INTO form_field_configurations (field_name, section_name, field_label, is_visible, is_required, display_order, is_system_field) VALUES
  ('alternate_contact_name', 'Additional Information', 'Alternate Contact Name', true, false, 1, false),
  ('alternate_mobile', 'Additional Information', 'Alternate Mobile', true, false, 2, false),
  ('referred_by', 'Additional Information', 'Referred By', true, false, 3, false)
ON CONFLICT (field_name) DO NOTHING;

-- Insert system fields (not shown in form configuration UI)
INSERT INTO form_field_configurations (field_name, section_name, field_label, is_visible, is_required, display_order, is_system_field) VALUES
  ('id', 'System', 'ID', true, true, 1, true),
  ('status', 'System', 'Status', true, true, 2, true),
  ('created_at', 'System', 'Created At', true, true, 3, true),
  ('updated_at', 'System', 'Updated At', true, true, 4, true)
ON CONFLICT (field_name) DO NOTHING;