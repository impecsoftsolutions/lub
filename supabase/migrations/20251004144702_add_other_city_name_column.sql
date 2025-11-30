/*
  # Add other_city_name column to member_registrations

  1. Changes to member_registrations
    - Add `other_city_name` column (text, nullable)
    - This column stores the actual custom city name when user selects "Other" in the city dropdown
    - When city field equals "Other", the custom city name is stored in other_city_name
    - This separation allows admins to clearly distinguish between approved cities and custom entries

  2. Purpose
    - Clear separation between approved dropdown cities and custom city entries
    - city field contains only approved city names or the literal text "Other"
    - other_city_name contains the actual custom city name entered by user
    - Enables better filtering, reporting, and audit trails for city management

  3. Indexes
    - Add index on other_city_name for faster lookups and filtering
*/

-- Add other_city_name column to member_registrations
ALTER TABLE public.member_registrations
ADD COLUMN IF NOT EXISTS other_city_name text;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_member_registrations_other_city_name
ON public.member_registrations(other_city_name);

-- Add comment to document the column's purpose
COMMENT ON COLUMN public.member_registrations.other_city_name IS
'Stores custom city name when user selects "Other" from city dropdown. The city field will contain "Other" and this field contains the actual custom city name.';
