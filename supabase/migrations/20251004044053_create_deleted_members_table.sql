/*
  # Create Deleted Members Table

  1. New Tables
    - `deleted_members`
      - All fields from member_registrations table
      - `deleted_by` (uuid) - User ID of admin who deleted the member
      - `deleted_at` (timestamptz) - When the member was deleted
      - `deletion_reason` (text) - Reason for deletion
      - `original_id` (uuid) - Original ID from member_registrations table

  2. Security
    - Enable RLS on `deleted_members` table
    - Add policy for super_admin users only to read deleted members
    - Add policy for authenticated users to insert (for soft delete operation)

  3. Purpose
    - Stores soft-deleted member records
    - Allows recovery of accidentally deleted members
    - Maintains complete audit trail
*/

CREATE TABLE IF NOT EXISTS deleted_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_id uuid NOT NULL,
  
  -- All fields from member_registrations
  full_name text NOT NULL,
  gender text NOT NULL,
  date_of_birth date NOT NULL,
  email text NOT NULL,
  mobile_number text NOT NULL,
  company_name text NOT NULL,
  designation text,
  company_designation_id uuid,
  company_address text NOT NULL,
  city text NOT NULL,
  district text NOT NULL,
  state text NOT NULL,
  pin_code text NOT NULL,
  industry text NOT NULL,
  activity_type text NOT NULL,
  constitution text NOT NULL,
  annual_turnover text NOT NULL,
  number_of_employees text NOT NULL,
  products_services text NOT NULL,
  brand_names text,
  website text,
  gst_registered text NOT NULL,
  gst_number text,
  pan_company text NOT NULL,
  esic_registered text NOT NULL,
  epf_registered text NOT NULL,
  gst_certificate_url text,
  udyam_certificate_url text,
  payment_proof_url text,
  referred_by text,
  amount_paid text NOT NULL,
  payment_date date NOT NULL,
  payment_mode text NOT NULL,
  transaction_id text,
  bank_reference text,
  alternate_contact_name text,
  alternate_mobile text,
  status text,
  slug text,
  submission_id text,
  other_city text,
  is_active boolean,
  deactivated_at timestamptz,
  deactivated_by uuid,
  rejection_reason text,
  last_modified_by uuid,
  last_modified_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  
  -- Deletion metadata
  deleted_by uuid NOT NULL,
  deleted_at timestamptz DEFAULT now(),
  deletion_reason text NOT NULL
);

ALTER TABLE deleted_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only super admins can read deleted members"
  ON deleted_members
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'super_admin'
    )
  );

CREATE POLICY "Authenticated users can insert deleted members"
  ON deleted_members
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_deleted_members_original_id ON deleted_members(original_id);
CREATE INDEX IF NOT EXISTS idx_deleted_members_deleted_at ON deleted_members(deleted_at DESC);
CREATE INDEX IF NOT EXISTS idx_deleted_members_deleted_by ON deleted_members(deleted_by);
CREATE INDEX IF NOT EXISTS idx_deleted_members_email ON deleted_members(email);
