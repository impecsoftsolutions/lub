@@ .. @@
 /*
   # Add designation_id foreign key constraint

   1. Changes
-    - Add designation_id column to member_registrations table
-    - Add foreign key constraint to masters.company_designations
+    - Add foreign key constraint from designation_id to masters.company_designations
   
   2. Security
     - No RLS changes needed as this only adds a constraint
 */

--- Add the new foreign key column, allowing nulls initially
-ALTER TABLE public.member_registrations
-ADD COLUMN designation_id uuid;
-
 -- Add the foreign key constraint to masters.company_designations
-ALTER TABLE public.member_registrations
-ADD CONSTRAINT fk_designation_id
-FOREIGN KEY (designation_id) REFERENCES masters.company_designations(id) ON DELETE RESTRICT;
+alter table public.member_registrations
+add constraint if not exists fk_designation_id
+foreign key (designation_id)
+references masters.company_designations(id)
+on delete restrict;