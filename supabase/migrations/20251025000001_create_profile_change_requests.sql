/*
  # Create Member Profile Change Requests Table

  1. Purpose
    - Track all member profile change requests for admin approval
    - Store before/after data for comparison
    - Support workflow: Member requests → Admin reviews → Apply changes
    - Enforce ONE pending request per member at a time

  2. New Table: member_profile_change_requests
    - Stores pending, approved, and rejected profile changes
    - Uses JSONB for flexible field storage
    - Tracks which specific fields were changed
    - Admin review workflow with notes and timestamps

  3. Security
    - RLS enabled with policies for members and admins
    - Members can view/create their own requests
    - Only admins can update/approve requests

  4. Integration
    - References member_registrations(id) for member linkage
    - References users(id) for request creator and reviewer
    - ON DELETE CASCADE for automatic cleanup
*/

-- =============================================
-- Create the table
-- =============================================

CREATE TABLE IF NOT EXISTS member_profile_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Member and requester information
  member_id uuid NOT NULL REFERENCES member_registrations(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Change type classification
  change_type text NOT NULL CHECK (change_type IN (
    'profile_update',
    'photo_change',
    'email_change',
    'mobile_change'
  )),

  -- Data storage (JSONB for flexibility)
  current_data jsonb NOT NULL,
  requested_data jsonb NOT NULL,
  changed_fields text[] NOT NULL,

  -- Request metadata
  change_reason text,

  -- Review workflow
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'approved',
    'rejected'
  )),
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  rejection_reason text,
  admin_notes text,

  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================
-- Create indexes
-- =============================================

-- Fast lookups by member
CREATE INDEX idx_profile_change_requests_member_id
  ON member_profile_change_requests(member_id);

-- Filter by status (pending/approved/rejected)
CREATE INDEX idx_profile_change_requests_status
  ON member_profile_change_requests(status);

-- Sort by creation date
CREATE INDEX idx_profile_change_requests_created_at
  ON member_profile_change_requests(created_at DESC);

-- Track who made the request
CREATE INDEX idx_profile_change_requests_requested_by
  ON member_profile_change_requests(requested_by);

-- Track who reviewed
CREATE INDEX idx_profile_change_requests_reviewed_by
  ON member_profile_change_requests(reviewed_by)
  WHERE reviewed_by IS NOT NULL;

-- =============================================
-- UNIQUE CONSTRAINT: Only ONE pending request per member
-- =============================================

CREATE UNIQUE INDEX idx_profile_change_requests_member_pending_unique
  ON member_profile_change_requests(member_id)
  WHERE status = 'pending';

COMMENT ON INDEX idx_profile_change_requests_member_pending_unique IS
  'Ensures only one pending change request per member at a time. Member must wait for admin review before submitting another request.';

-- =============================================
-- Enable Row Level Security
-- =============================================

ALTER TABLE member_profile_change_requests ENABLE ROW LEVEL SECURITY;

-- =============================================
-- RLS Policy 1: Members can view their own change requests
-- =============================================

CREATE POLICY "Members can view own change requests"
  ON member_profile_change_requests
  FOR SELECT
  TO public
  USING (
    member_id IN (
      SELECT id FROM member_registrations
      WHERE user_id = current_user_id()
    )
  );

-- =============================================
-- RLS Policy 2: Admins can view all change requests
-- =============================================

CREATE POLICY "Admins can view all change requests"
  ON member_profile_change_requests
  FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = current_user_id()
    )
  );

-- =============================================
-- RLS Policy 3: Authenticated users can create change requests
-- =============================================

CREATE POLICY "Authenticated users can insert change requests"
  ON member_profile_change_requests
  FOR INSERT
  TO public
  WITH CHECK (
    -- User must be authenticated
    current_user_id() IS NOT NULL
    AND
    -- Can only create request for their own member profile
    member_id IN (
      SELECT id FROM member_registrations
      WHERE user_id = current_user_id()
    )
    AND
    -- requested_by must match current user
    requested_by = current_user_id()
    AND
    -- New requests must be pending
    status = 'pending'
  );

-- =============================================
-- RLS Policy 4: Only admins can update change requests
-- =============================================

CREATE POLICY "Admins can update change requests"
  ON member_profile_change_requests
  FOR UPDATE
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = current_user_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = current_user_id()
    )
  );

-- =============================================
-- Create trigger for updated_at timestamp
-- =============================================

CREATE OR REPLACE FUNCTION update_profile_change_request_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_profile_change_request_timestamp
  BEFORE UPDATE ON member_profile_change_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_profile_change_request_updated_at();

-- =============================================
-- Add helpful comments
-- =============================================

COMMENT ON TABLE member_profile_change_requests IS
  'Tracks member profile change requests requiring admin approval. Members submit changes, admins review and approve/reject. Only ONE pending request allowed per member.';

COMMENT ON COLUMN member_profile_change_requests.change_type IS
  'Type of change: profile_update (general fields), photo_change (profile photo), email_change (email update), mobile_change (mobile update)';

COMMENT ON COLUMN member_profile_change_requests.current_data IS
  'JSONB snapshot of all current field values before the change';

COMMENT ON COLUMN member_profile_change_requests.requested_data IS
  'JSONB snapshot of all requested new field values';

COMMENT ON COLUMN member_profile_change_requests.changed_fields IS
  'Array of field names that changed, e.g., [''full_name'', ''company_name'', ''email'']';

COMMENT ON COLUMN member_profile_change_requests.status IS
  'Workflow status: pending (awaiting review), approved (changes applied), rejected (changes denied)';

-- =============================================
-- Log completion
-- =============================================

DO $$
BEGIN
  RAISE NOTICE '=================================================';
  RAISE NOTICE 'Member profile change requests table created successfully';
  RAISE NOTICE '=================================================';
  RAISE NOTICE 'Table: member_profile_change_requests';
  RAISE NOTICE 'RLS: Enabled with 4 policies';
  RAISE NOTICE '  - Members can view own requests';
  RAISE NOTICE '  - Admins can view all requests';
  RAISE NOTICE '  - Members can insert own requests';
  RAISE NOTICE '  - Admins can update requests';
  RAISE NOTICE 'Indexes: 6 created for optimal performance';
  RAISE NOTICE 'Constraint: Only ONE pending request per member';
  RAISE NOTICE '=================================================';
END $$;
