/*
  # Create member registrations table

  1. New Tables
    - `member_registrations`
      - Complete registration form data storage
      - Personal information (name, gender, DOB, email, mobile)
      - Company information (name, designation, address, location)
      - Business details (industry, activity type, constitution, turnover, employees)
      - Registration details (GST, PAN, ESIC, EPF status and numbers)
      - File uploads (GST certificate, UDYAM certificate, payment proof URLs)
      - Payment information (amount, date, mode, transaction details)
      - Alternate contact information
      - Metadata (submission timestamp, status)

  2. Security
    - Enable RLS on `member_registrations` table
    - Add policy for public insert access (form submissions)
    - Add policy for authenticated read access (admin review)

  3. Features
    - Auto-generated UUID primary key
    - Timestamp tracking for submissions
    - Status field for approval workflow
    - File URL storage for uploaded documents
*/

CREATE TABLE IF NOT EXISTS member_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Personal Information
  full_name text NOT NULL,
  gender text NOT NULL CHECK (gender IN ('male', 'female')),
  date_of_birth date NOT NULL,
  email text NOT NULL,
  mobile_number text NOT NULL CHECK (length(mobile_number) = 10),
  
  -- Company Information
  company_name text NOT NULL,
  designation text NOT NULL,
  company_address text NOT NULL,
  city text NOT NULL,
  district text NOT NULL,
  state text NOT NULL,
  pin_code text NOT NULL,
  
  -- Business Details
  industry text NOT NULL,
  activity_type text NOT NULL,
  constitution text NOT NULL,
  annual_turnover text NOT NULL,
  number_of_employees text NOT NULL,
  products_services text NOT NULL,
  brand_names text DEFAULT '',
  website text DEFAULT '',
  
  -- Registration Details
  gst_registered text NOT NULL CHECK (gst_registered IN ('yes', 'no')),
  gst_number text DEFAULT '',
  pan_company text NOT NULL,
  esic_registered text NOT NULL CHECK (esic_registered IN ('yes', 'no')),
  epf_registered text NOT NULL CHECK (epf_registered IN ('yes', 'no')),
  
  -- File Upload URLs
  gst_certificate_url text DEFAULT '',
  udyam_certificate_url text DEFAULT '',
  payment_proof_url text DEFAULT '',
  
  -- Payment Information
  referred_by text DEFAULT '',
  amount_paid text NOT NULL,
  payment_date date NOT NULL,
  payment_mode text NOT NULL,
  transaction_id text DEFAULT '',
  bank_reference text DEFAULT '',
  
  -- Alternate Contact Information
  alternate_contact_name text DEFAULT '',
  alternate_mobile text DEFAULT '',
  
  -- Metadata
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE member_registrations ENABLE ROW LEVEL SECURITY;

-- Policy for public insert access (form submissions)
CREATE POLICY "Allow public insert for member registrations"
  ON member_registrations
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Policy for authenticated read access (admin review)
CREATE POLICY "Allow authenticated read for member registrations"
  ON member_registrations
  FOR SELECT
  TO authenticated
  USING (true);

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_member_registrations_status ON member_registrations(status);
CREATE INDEX IF NOT EXISTS idx_member_registrations_created_at ON member_registrations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_member_registrations_email ON member_registrations(email);