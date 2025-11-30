@@ .. @@
 /*
   # Add foreign key relationship for user_roles
 
   1. Foreign Key
     - Add foreign key constraint from user_roles.user_id to auth.users.id
     - Enable CASCADE delete to clean up orphaned roles
   
   2. Verification
     - Check that constraint exists and points to auth.users
 */
 
+-- Drop existing constraint if it exists to ensure clean state
+ALTER TABLE public.user_roles 
+DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey;
+
 -- Add foreign key constraint from user_roles.user_id to auth.users.id
 ALTER TABLE public.user_roles
 ADD CONSTRAINT user_roles_user_id_fkey
 FOREIGN KEY (user_id) REFERENCES auth.users(id)
 ON DELETE CASCADE;