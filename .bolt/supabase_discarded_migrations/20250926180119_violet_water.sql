@@ .. @@
 -- Set all state and district columns to NULL (no geographic scoping)
 UPDATE user_roles SET state = NULL, district = NULL;
 
+-- Add foreign key constraint to auth.users (required for API queries)
+ALTER TABLE public.user_roles
+ADD CONSTRAINT user_roles_user_id_fkey
+FOREIGN KEY (user_id) REFERENCES auth.users(id)
+ON DELETE CASCADE;