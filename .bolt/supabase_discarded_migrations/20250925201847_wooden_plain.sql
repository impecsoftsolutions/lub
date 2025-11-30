@@ .. @@
 /*
   # Seed Designations Master and Add Foreign Key Constraint

   1. Seed Data
     - Insert 15 initial designations into `masters.company_designations`
     - All designations are set as active by default
   
   2. Foreign Key Constraint
     - Add foreign key constraint between `member_registrations.designation_id` and `masters.company_designations.id`
     - Uses IF NOT EXISTS to prevent errors if constraint already exists
 */

--- Seed the masters.company_designations table with initial designations
+-- Seed the masters.company_designations table with initial designations
 INSERT INTO masters.company_designations (designation, is_active) VALUES
   ('Proprietor', true),
   ('Partner', true),
@@ .. @@
 ON CONFLICT (designation) DO NOTHING;

--- Add foreign key constraint if it doesn't exist
+-- Add foreign key constraint if it doesn't exist
 ALTER TABLE public.member_registrations
 ADD CONSTRAINT IF NOT EXISTS fk_designation_id
 FOREIGN KEY (designation_id)
 REFERENCES masters.company_designations(id)
-ON DELETE RESTRICT;
-
--- Add the designation_id column if it doesn't exist
-DO $$
-BEGIN
-  IF NOT EXISTS (
-    SELECT 1 FROM information_schema.columns
-    WHERE table_name = 'member_registrations' 
-    AND column_name = 'designation_id'
-    AND table_schema = 'public'
-  ) THEN
-    ALTER TABLE public.member_registrations
-    ADD COLUMN designation_id uuid;
-  END IF;
-END $$;