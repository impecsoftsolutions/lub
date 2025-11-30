/*
  # Add Foreign Key Relationship for user_roles

  1. Foreign Key Constraint
    - Add foreign key from user_roles.user_id to auth.users.id
    - Enable CASCADE delete to clean up roles when users are deleted
  
  2. Schema Verification
    - Ensure constraint is properly created and visible
    - Enable proper API queries with user email expansion
*/

-- Add foreign key constraint from user_roles.user_id to auth.users.id
ALTER TABLE public.user_roles
ADD CONSTRAINT user_roles_user_id_fkey
FOREIGN KEY (user_id) REFERENCES auth.users(id)
ON DELETE CASCADE;

-- Verify the constraint was created
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'user_roles_user_id_fkey' 
    AND conrelid = 'public.user_roles'::regclass
  ) THEN
    RAISE NOTICE 'Foreign key constraint user_roles_user_id_fkey created successfully';
  ELSE
    RAISE EXCEPTION 'Failed to create foreign key constraint user_roles_user_id_fkey';
  END IF;
END $$;