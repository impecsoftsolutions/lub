@@ .. @@
 BEGIN;
 
--- 1) Drop any existing FK so re-run is always safe
-ALTER TABLE public.user_roles
-  DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey;
-
--- 2) Recreate FK exactly once, with the correct behavior
-ALTER TABLE public.user_roles
-  ADD CONSTRAINT user_roles_user_id_fkey
-  FOREIGN KEY (user_id) REFERENCES auth.users(id)
-  ON DELETE CASCADE;
+-- Dynamic cleanup: Drop any existing FK constraints on user_roles.user_id
+DO $$
+DECLARE
+    constraint_name text;
+BEGIN
+    -- Find and drop any FK constraints on user_roles.user_id column
+    FOR constraint_name IN
+        SELECT con.conname
+        FROM pg_constraint con
+        JOIN pg_class rel ON rel.oid = con.conrelid
+        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
+        JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
+        WHERE nsp.nspname = 'public'
+          AND rel.relname = 'user_roles'
+          AND att.attname = 'user_id'
+          AND con.contype = 'f'  -- foreign key
+    LOOP
+        EXECUTE format('ALTER TABLE public.user_roles DROP CONSTRAINT %I', constraint_name);
+        RAISE NOTICE 'Dropped existing FK constraint: %', constraint_name;
+    END LOOP;
+END $$;
+
+-- Add single FK constraint with unique name to avoid collisions
+ALTER TABLE public.user_roles
+  ADD CONSTRAINT fk_user_roles_user_id__auth_users
+  FOREIGN KEY (user_id) REFERENCES auth.users(id)
+  ON DELETE CASCADE;
 
 COMMIT;
 
--- 3) Force PostgREST (Supabase API) to reload schema cache immediately
+-- Force PostgREST (Supabase API) to reload schema cache immediately
 SELECT pg_notify('pgrst', 'reload schema');