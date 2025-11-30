/*
  # Ensure Role Period Columns Exist on member_lub_role_assignments

  1. Issue
    - Queries fail with "column a.role_start_date does not exist"
    - Indicates that role_start_date, role_end_date, committee_year columns
      are missing from the live database table
    - Previous migrations may not have been applied

  2. Solution
    - Defensively check for and add missing columns:
      - role_start_date (date, nullable)
      - role_end_date (date, nullable)
      - committee_year (text, nullable)
    - These columns support optional date periods and committee year tracking

  3. Safety
    - Uses IF NOT EXISTS to prevent errors if columns already exist
    - All columns are nullable for backwards compatibility
    - No data migration needed
*/

-- =====================================================================
-- Ensure role period columns exist
-- =====================================================================

DO $$
BEGIN
  -- Add role_start_date if missing
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'member_lub_role_assignments'
      AND column_name = 'role_start_date'
  ) THEN
    ALTER TABLE member_lub_role_assignments
      ADD COLUMN role_start_date date;
    
    RAISE NOTICE 'Added role_start_date column to member_lub_role_assignments';
  ELSE
    RAISE NOTICE 'role_start_date column already exists';
  END IF;

  -- Add role_end_date if missing
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'member_lub_role_assignments'
      AND column_name = 'role_end_date'
  ) THEN
    ALTER TABLE member_lub_role_assignments
      ADD COLUMN role_end_date date;
    
    RAISE NOTICE 'Added role_end_date column to member_lub_role_assignments';
  ELSE
    RAISE NOTICE 'role_end_date column already exists';
  END IF;

  -- Add committee_year if missing
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'member_lub_role_assignments'
      AND column_name = 'committee_year'
  ) THEN
    ALTER TABLE member_lub_role_assignments
      ADD COLUMN committee_year text;
    
    RAISE NOTICE 'Added committee_year column to member_lub_role_assignments';
  ELSE
    RAISE NOTICE 'committee_year column already exists';
  END IF;
END $$;

-- =====================================================================
-- End
-- =====================================================================
