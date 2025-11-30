@@ .. @@
   WHERE conrelid = 'public.user_roles'::regclass 
   AND conname = 'valid_roles'
 ) THEN
   ALTER TABLE user_roles ADD CONSTRAINT valid_roles 
     CHECK (role IN ('super_admin', 'admin', 'editor', 'viewer'));
   RAISE NOTICE 'Added valid_roles CHECK constraint';
 ELSE
   RAISE NOTICE 'valid_roles CHECK constraint already exists';
 END IF;
-
- -- Add foreign key constraint if it doesn't exist
- IF NOT EXISTS (
-   SELECT 1 
-   FROM pg_constraint 
-   WHERE conrelid = 'public.user_roles'::regclass 
-   AND conname = 'user_roles_user_id_fkey'
- ) THEN
-   ALTER TABLE public.user_roles
-   ADD CONSTRAINT user_roles_user_id_fkey
-   FOREIGN KEY (user_id) REFERENCES auth.users(id)
-   ON DELETE CASCADE;
-   RAISE NOTICE 'Added user_roles_user_id_fkey foreign key constraint';
- ELSE
-   RAISE NOTICE 'user_roles_user_id_fkey foreign key constraint already exists';
- END IF;
 END $$;