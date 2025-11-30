/*
  # Drop compatibility view for designations_master

  This migration removes the temporary compatibility view and triggers
  once the frontend has been fully migrated to use company_designations directly.
  
  Only run this after confirming the frontend works with company_designations.
*/

-- Drop the compatibility view and all its triggers
DROP VIEW IF EXISTS public.designations_master CASCADE;

-- Drop the trigger functions
DROP FUNCTION IF EXISTS handle_designations_master_insert() CASCADE;
DROP FUNCTION IF EXISTS handle_designations_master_update() CASCADE;
DROP FUNCTION IF EXISTS handle_designations_master_delete() CASCADE;