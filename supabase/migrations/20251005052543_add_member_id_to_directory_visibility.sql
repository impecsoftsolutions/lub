/*
  # Add Member ID Field to Directory Field Visibility Settings

  ## Overview
  Adds the member_id field to the directory_field_visibility table so admins can control
  whether Member ID (certificate number) is visible in the member directory.

  ## Changes

  1. New Visibility Setting
    - Add `member_id` field to directory_field_visibility table
    - Field Label: "Member ID"
    - Field Name: "member_id"
    - Default visibility: OFF for both public and logged-in members
    - Rationale: Member ID is administrative information that should be hidden by default

  2. Important Notes
    - Uses ON CONFLICT to prevent duplicate entries if migration is run multiple times
    - Default values set to false for maximum privacy
    - Admins can always see this field regardless of visibility settings
    - This setting only affects the public directory display, not admin interfaces
*/

-- Insert member_id field visibility setting into directory_field_visibility table
INSERT INTO directory_field_visibility (field_name, field_label, show_to_public, show_to_members)
VALUES ('member_id', 'Member ID', false, false)
ON CONFLICT (field_name) DO NOTHING;
