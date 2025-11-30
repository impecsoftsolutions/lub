/*
  # Add Missing Columns to Deleted Members Table

  1. Problem
    - When deleting an APPROVED member, the system fails with error:
      "Could not find the 'approval_date' column of 'deleted_members' in the schema cache"
    - The deleted_members table is missing several columns that exist in member_registrations
    - The softDeleteMember function uses spread operator (...memberData) which copies ALL fields

  2. Changes
    - Add approval_date (timestamptz, nullable) - Tracks when member was approved
    - Add member_id (text, nullable) - Certificate/ID number assigned to member
    - Add user_id (uuid, nullable) - Links to users table for auth
    - Add is_legacy_member (boolean, nullable) - Flags members from old system
    - Add reapplication_count (integer, default 0) - Tracks reapplication attempts
    - Add other_city_name (text, nullable) - Custom city name when not in master list
    - Add is_custom_city (boolean, nullable) - Flag for custom city entries

  3. Safety
    - All columns are NULLABLE to avoid breaking existing deleted_members rows
    - Uses IF NOT EXISTS for idempotency (safe to run multiple times)
    - No changes to RLS policies or grants
    - No changes to existing indexes

  4. Purpose
    - Ensures schema parity between member_registrations and deleted_members
    - Prevents "column not found" errors during soft delete operations
    - Preserves complete member data in archive without data loss
*/

-- Add approval_date column
ALTER TABLE public.deleted_members
  ADD COLUMN IF NOT EXISTS approval_date timestamptz;

COMMENT ON COLUMN public.deleted_members.approval_date IS
  'Timestamp when this member was approved. Copied from member_registrations during soft delete. Nullable for members who were never approved (pending/rejected at deletion time).';

-- Add member_id column
ALTER TABLE public.deleted_members
  ADD COLUMN IF NOT EXISTS member_id text;

COMMENT ON COLUMN public.deleted_members.member_id IS
  'Certificate/ID number assigned to the member. Copied from member_registrations during soft delete. Nullable if member was deleted before ID assignment.';

-- Add user_id column
ALTER TABLE public.deleted_members
  ADD COLUMN IF NOT EXISTS user_id uuid;

COMMENT ON COLUMN public.deleted_members.user_id IS
  'Links to users table for authentication. Copied from member_registrations during soft delete. Nullable for legacy members without user accounts.';

-- Add is_legacy_member column
ALTER TABLE public.deleted_members
  ADD COLUMN IF NOT EXISTS is_legacy_member boolean;

COMMENT ON COLUMN public.deleted_members.is_legacy_member IS
  'Flags members imported from old system. Copied from member_registrations during soft delete.';

-- Add reapplication_count column
ALTER TABLE public.deleted_members
  ADD COLUMN IF NOT EXISTS reapplication_count integer DEFAULT 0;

COMMENT ON COLUMN public.deleted_members.reapplication_count IS
  'Number of times member reapplied after rejection. Copied from member_registrations during soft delete. Defaults to 0.';

-- Add other_city_name column
ALTER TABLE public.deleted_members
  ADD COLUMN IF NOT EXISTS other_city_name text;

COMMENT ON COLUMN public.deleted_members.other_city_name IS
  'Custom city/town/village name when not in cities_master table. Used with is_custom_city flag. Copied from member_registrations during soft delete.';

-- Add is_custom_city column
ALTER TABLE public.deleted_members
  ADD COLUMN IF NOT EXISTS is_custom_city boolean;

COMMENT ON COLUMN public.deleted_members.is_custom_city IS
  'Flag indicating city is custom (not from cities_master). When true, other_city_name contains the actual city name. Copied from member_registrations during soft delete.';

-- Add indexes for commonly queried fields
CREATE INDEX IF NOT EXISTS idx_deleted_members_approval_date
  ON public.deleted_members(approval_date);

CREATE INDEX IF NOT EXISTS idx_deleted_members_member_id
  ON public.deleted_members(member_id);

CREATE INDEX IF NOT EXISTS idx_deleted_members_user_id
  ON public.deleted_members(user_id);

-- Update table comment to reflect completeness
COMMENT ON TABLE public.deleted_members IS
  'Stores soft-deleted member records with complete data preservation. Schema now aligned with member_registrations table including approval_date, member_id, user_id, reapplication tracking, and custom city fields to ensure accurate archival without data loss. All audit fields (deleted_by, deleted_at, deletion_reason) preserved for compliance.';
