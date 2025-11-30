/*
  # Add Re-application Tracking Columns

  1. New Columns
    - `reapplication_count` (integer, default 0, not null)
      - Tracks how many times a member has re-applied after rejection
      - Helps admins see application history
    - `approval_date` (timestamptz, nullable)
      - Records when the application was approved
      - Used to display approval date on member dashboard

  2. Purpose
    - Track member re-application attempts
    - Display approval date to approved members
    - Support re-application workflow for rejected members

  3. Notes
    - rejection_reason column already exists from previous migration
    - reapplication_count increments each time member re-submits after rejection
*/

-- Add reapplication_count column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'member_registrations' AND column_name = 'reapplication_count'
  ) THEN
    ALTER TABLE member_registrations
    ADD COLUMN reapplication_count integer DEFAULT 0 NOT NULL;
  END IF;
END $$;

-- Add approval_date column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'member_registrations' AND column_name = 'approval_date'
  ) THEN
    ALTER TABLE member_registrations
    ADD COLUMN approval_date timestamptz;
  END IF;
END $$;

-- Add index for efficient queries on approval_date
CREATE INDEX IF NOT EXISTS idx_member_registrations_approval_date
ON member_registrations(approval_date);

-- Add comments explaining the purpose
COMMENT ON COLUMN member_registrations.reapplication_count IS
  'Number of times this member has re-applied after rejection. Used to track application history.';

COMMENT ON COLUMN member_registrations.approval_date IS
  'Date when this application was approved. Displayed to members on their dashboard.';
