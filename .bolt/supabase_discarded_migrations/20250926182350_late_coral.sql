/*
  # Final Fix for user_roles Foreign Key Constraint
  
  This migration ensures exactly one place creates the user_roles foreign key.
  It's idempotent and will always succeed by dropping first, then recreating.
*/

BEGIN;

-- 1) Drop any existing FK so re-run is always safe
ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey;

-- 2) Recreate FK exactly once, with the correct behavior
ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id)
  ON DELETE CASCADE;

COMMIT;

-- 3) Force PostgREST (Supabase API) to reload schema cache immediately
SELECT pg_notify('pgrst', 'reload schema');