@@ .. @@
   created_at timestamptz DEFAULT now(),
   updated_at timestamptz DEFAULT now(),
   
-  -- Unique constraint to prevent duplicate role assignments
-  CONSTRAINT unique_member_role_assignment UNIQUE (member_id, role_id, level, COALESCE(state, ''), COALESCE(district, ''))
+  -- Unique constraint to prevent duplicate role assignments (allows NULLs)
+  CONSTRAINT unique_member_role_assignment UNIQUE (member_id, role_id, level, state, district)
 );
 
 -- Enable RLS