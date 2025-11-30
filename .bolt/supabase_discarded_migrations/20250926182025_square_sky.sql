@@ .. @@
--- Drop existing constraint if it exists to ensure clean state
-ALTER TABLE public.user_roles 
-DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey;
-
--- Add foreign key constraint from user_roles.user_id to auth.users.id
-ALTER TABLE public.user_roles
-ADD CONSTRAINT user_roles_user_id_fkey
-FOREIGN KEY (user_id) REFERENCES auth.users(id)
-ON DELETE CASCADE;
-
--- Verify the constraint was created
-DO $$
-BEGIN
-  IF NOT EXISTS (
-    SELECT 1 FROM pg_constraint 
-    WHERE conrelid = 'public.user_roles'::regclass 
-    AND conname = 'user_roles_user_id_fkey'
-  ) THEN
-    RAISE EXCEPTION 'Foreign key constraint user_roles_user_id_fkey was not created successfully';
-  END IF;
-END $$;
+-- Check if foreign key constraint exists, create only if missing
+DO $$
+BEGIN
+  -- Check if the constraint already exists
+  IF NOT EXISTS (
+    SELECT 1 
+    FROM pg_constraint 
+    WHERE conrelid = 'public.user_roles'::regclass 
+    AND conname = 'user_roles_user_id_fkey'
+  ) THEN
+    -- Create the foreign key constraint only if it doesn't exist
+    ALTER TABLE public.user_roles
+    ADD CONSTRAINT user_roles_user_id_fkey
+    FOREIGN KEY (user_id) REFERENCES auth.users(id)
+    ON DELETE CASCADE;
+    
+    RAISE NOTICE 'Created foreign key constraint user_roles_user_id_fkey';
+  ELSE
+    RAISE NOTICE 'Foreign key constraint user_roles_user_id_fkey already exists, skipping creation';
+  END IF;
+END $$;