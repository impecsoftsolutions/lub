/*
  # Create Member Audit History Table

  1. New Tables
    - `member_audit_history`
      - `id` (uuid, primary key) - Unique identifier for each audit record
      - `member_id` (uuid) - Reference to the member being audited
      - `action_type` (text) - Type of action (update, status_change, deactivate, activate, delete)
      - `field_name` (text) - Name of the field that was changed
      - `old_value` (text) - Previous value of the field
      - `new_value` (text) - New value of the field
      - `changed_by` (uuid) - User ID of the admin who made the change
      - `change_reason` (text) - Optional reason for the change
      - `created_at` (timestamptz) - When the change occurred

  2. Security
    - Enable RLS on `member_audit_history` table
    - Add policy for authenticated users to read audit history
    - Add policy for authenticated users to insert audit records

  3. Indexes
    - Index on member_id for fast lookups
    - Index on created_at for chronological queries
    - Index on changed_by for tracking admin actions
*/

CREATE TABLE IF NOT EXISTS member_audit_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL,
  action_type text NOT NULL CHECK (action_type IN ('update', 'status_change', 'deactivate', 'activate', 'delete', 'restore', 'create')),
  field_name text,
  old_value text,
  new_value text,
  changed_by uuid,
  change_reason text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE member_audit_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read audit history"
  ON member_audit_history
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert audit records"
  ON member_audit_history
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_audit_history_member_id ON member_audit_history(member_id);
CREATE INDEX IF NOT EXISTS idx_audit_history_created_at ON member_audit_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_history_changed_by ON member_audit_history(changed_by);
CREATE INDEX IF NOT EXISTS idx_audit_history_action_type ON member_audit_history(action_type);
