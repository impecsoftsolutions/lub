@@ .. @@
 -- Set all state and district columns to NULL (no geographic scoping)
 UPDATE user_roles SET state = NULL, district = NULL;
 
--- Ensure foreign key constraint exists
-ALTER TABLE user_roles 
-DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey;
-
-ALTER TABLE user_roles
-ADD CONSTRAINT user_roles_user_id_fkey
-FOREIGN KEY (user_id) REFERENCES auth.users(id)
-ON DELETE CASCADE;
-
 -- Update check_user_permission function for new role structure