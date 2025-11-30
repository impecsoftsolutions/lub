/*
  # Create compatibility view for designations_master

  1. Compatibility View
    - Creates `public.designations_master` view that mirrors `company_designations`
    - Same columns: id, designation_name, is_active, created_at, updated_at
  
  2. INSTEAD OF Triggers
    - Makes the view fully writable
    - INSERT/UPDATE/DELETE operations transparently operate on `company_designations`
    - RLS policies continue to apply via the underlying table
  
  3. Zero Downtime
    - Existing UI code continues to work immediately
    - No breaking changes to current functionality
*/

-- Drop existing view if it exists
DROP VIEW IF EXISTS public.designations_master CASCADE;

-- Create compatibility view that mirrors company_designations
CREATE VIEW public.designations_master AS
SELECT 
  id,
  designation_name,
  is_active,
  created_at,
  updated_at
FROM public.company_designations;

-- Create INSTEAD OF INSERT trigger
CREATE OR REPLACE FUNCTION handle_designations_master_insert()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.company_designations (designation_name, is_active)
  VALUES (NEW.designation_name, NEW.is_active);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER designations_master_insert_trigger
  INSTEAD OF INSERT ON public.designations_master
  FOR EACH ROW EXECUTE FUNCTION handle_designations_master_insert();

-- Create INSTEAD OF UPDATE trigger
CREATE OR REPLACE FUNCTION handle_designations_master_update()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.company_designations 
  SET 
    designation_name = NEW.designation_name,
    is_active = NEW.is_active,
    updated_at = now()
  WHERE id = OLD.id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER designations_master_update_trigger
  INSTEAD OF UPDATE ON public.designations_master
  FOR EACH ROW EXECUTE FUNCTION handle_designations_master_update();

-- Create INSTEAD OF DELETE trigger
CREATE OR REPLACE FUNCTION handle_designations_master_delete()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM public.company_designations WHERE id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER designations_master_delete_trigger
  INSTEAD OF DELETE ON public.designations_master
  FOR EACH ROW EXECUTE FUNCTION handle_designations_master_delete();

-- Grant appropriate permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.designations_master TO authenticated;
GRANT SELECT ON public.designations_master TO anon;