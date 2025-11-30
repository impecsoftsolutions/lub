# Admin Users Page - RLS Policy Fix for user_roles Query

## Root Cause Identified

The admin roles are not displaying because the `user_roles` query is being blocked by RLS policies.

### The Problem

1. **Current Setup:**
   - Browser client uses anon key to query Supabase
   - RLS policies on `user_roles` table use `current_user_id()` function
   - `current_user_id()` reads from session variable `app.current_user_id`
   - Browser client cannot set this session variable
   - Result: `current_user_id()` returns NULL
   - Result: RLS policies fail and query returns empty array

2. **Debug Output Expected:**
   ```javascript
   [AdminUsers] Loaded users: 5
   [AdminUsers] Loaded roles: 0  // ← PROBLEM: Should have roles!
   [AdminUsers] Roles data: []    // ← Empty because RLS blocked it
   ```

## Solution Options

### Option 1: Use Service Role for user_roles Query (Recommended)

Create a secure server-side endpoint or use service role key to bypass RLS.

**Pros:**
- Most secure
- Works with existing RLS policies
- Separates privileged operations

**Cons:**
- Requires backend endpoint or edge function
- More complex implementation

### Option 2: Create Public View with Security Function

Create a view that filters data based on permissions, similar to `v_active_payment_settings`.

**Implementation:**
```sql
-- Create a helper function to check if current user is admin
CREATE OR REPLACE FUNCTION is_current_user_admin()
RETURNS boolean AS $$
BEGIN
  -- For browser clients using Supabase auth JWT
  RETURN (
    SELECT EXISTS (
      SELECT 1
      FROM users u
      WHERE u.email = (auth.jwt() ->> 'email')::text
      AND u.account_type IN ('admin', 'both')
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create public view for user roles
CREATE OR REPLACE VIEW v_admin_user_roles AS
SELECT
  ur.id,
  ur.user_id,
  ur.role,
  ur.state,
  ur.district
FROM user_roles ur
WHERE is_current_user_admin() = true;

-- Grant access to view
GRANT SELECT ON v_admin_user_roles TO authenticated, anon;
```

**Then update AdminUsers.tsx:**
```typescript
const { data: rolesData, error: rolesError } = await supabase
  .from('v_admin_user_roles')  // ← Changed from 'user_roles'
  .select('id, user_id, role, state, district');
```

### Option 3: Update RLS Policy to Use auth.jwt()

Add a policy that works with browser clients using JWT.

**Implementation:**
```sql
-- Add policy for admins using JWT email
CREATE POLICY "Admins can view all user roles via JWT"
  ON user_roles
  FOR SELECT
  TO authenticated, anon
  USING (
    EXISTS (
      SELECT 1
      FROM users u
      WHERE u.email = (auth.jwt() ->> 'email')::text
      AND u.account_type IN ('admin', 'both')
    )
  );
```

**Pros:**
- Simple to implement
- Works with browser client directly
- No code changes in AdminUsers.tsx

**Cons:**
- Depends on JWT containing email
- Less secure if JWT is compromised

## Recommended Implementation: Option 3 (Quick Fix)

This is the fastest solution that works with the current architecture:

1. Create a migration file that adds the JWT-based RLS policy
2. Policy checks if user's email (from JWT) exists in users table with account_type admin/both
3. If yes, allows reading all user_roles
4. Browser client can now fetch roles successfully

## Migration File

Create: `supabase/migrations/20251028000002_add_jwt_user_roles_policy.sql`

```sql
/*
  # Add JWT-based RLS policy for user_roles

  1. Purpose
    - Allow admin users to query user_roles from browser client
    - Use auth.jwt() which is available in browser context
    - Existing current_user_id() policies remain for server-side operations

  2. Security
    - Only users with account_type 'admin' or 'both' can read
    - Policy checks users table for account_type
    - JWT email must match a valid admin user

  3. Impact
    - Admin Users page can now load role data
    - Roles will display correctly (e.g., "Super Admin", "State President")
*/

-- Add policy for admins to view user roles using JWT
CREATE POLICY "Admins can view user roles via JWT"
  ON user_roles
  FOR SELECT
  TO authenticated, anon
  USING (
    EXISTS (
      SELECT 1
      FROM users u
      WHERE u.email = (auth.jwt() ->> 'email')::text
      AND u.account_type IN ('admin', 'both')
      AND u.account_status = 'active'
    )
  );

COMMENT ON POLICY "Admins can view user roles via JWT" ON user_roles IS
  'Allows admin users to read all user roles using JWT email for authentication. Used by browser clients.';
```

## Testing After Fix

1. **Open browser console on Admin Users page**
2. **Look for debug output:**
   ```javascript
   [AdminUsers] Loaded users: 5
   [AdminUsers] Loaded roles: 3   // ← Should now show roles!
   [AdminUsers] Roles data: [{id: '...', user_id: '...', role: 'super_admin', ...}, ...]
   [AdminUsers] User admin@example.com (admin): {userId: '...', foundRoles: 1, roles: ['super_admin']}
   [getAccountTypeDisplay] Admin user admin@example.com formatted roles: Super Admin
   ```

3. **Verify display:**
   - Admin users should show "Super Admin" not "Admin"
   - Both users should show "Member + Super Admin" not "Member + Admin"
   - Multiple roles should show comma-separated

## Alternative: If JWT Doesn't Contain Email

If `auth.jwt()` doesn't have email, we can use the service role approach or set up an edge function.

**Edge Function Approach:**
```typescript
// supabase/functions/get-user-roles/index.ts
import { createClient } from 'npm:@supabase/supabase-js@2'

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')! // ← Bypasses RLS
  )

  const { data, error } = await supabase
    .from('user_roles')
    .select('id, user_id, role, state, district')

  return new Response(JSON.stringify({ data, error }), {
    headers: { 'Content-Type': 'application/json' }
  })
})
```

Then update AdminUsers.tsx to call this edge function instead of querying directly.

## Cleanup After Fix

Once issue is resolved and roles display correctly:

1. Remove or comment out console.log statements in AdminUsers.tsx
2. Keep the debug guide for future reference
3. Document the RLS policy pattern for similar situations
