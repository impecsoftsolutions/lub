/*
  # Add submission_id and other_city columns for data mapping

  1. Changes to member_registrations
    - Add `submission_id` column (text, nullable)
    - This column will link members back to their original Jotform submissions
    - Create index for faster lookups

  2. Changes to staging.jotform_members_raw
    - Add `other_city` column (text, nullable)
    - This column stores the actual city name when user selected "Other" in the form
    - Ensures both staging tables have the same structure

  3. Indexes
    - Add index on member_registrations.submission_id
    - Add index on member_registrations.city for faster filtering
*/

-- Add submission_id to member_registrations
ALTER TABLE public.member_registrations 
ADD COLUMN IF NOT EXISTS submission_id text;

-- Create index for submission_id lookups
CREATE INDEX IF NOT EXISTS idx_member_registrations_submission_id 
ON public.member_registrations(submission_id);

-- Create index on city for faster filtering
CREATE INDEX IF NOT EXISTS idx_member_registrations_city 
ON public.member_registrations(city);

-- Add other_city to staging.jotform_members_raw
ALTER TABLE staging.jotform_members_raw 
ADD COLUMN IF NOT EXISTS other_city text;

-- Create index for other_city lookups in staging tables
CREATE INDEX IF NOT EXISTS idx_jotform_members_raw_other_city 
ON staging.jotform_members_raw(other_city);

CREATE INDEX IF NOT EXISTS idx_jotform_csv_auto_other_city 
ON staging.jotform_csv_auto(other_city);
