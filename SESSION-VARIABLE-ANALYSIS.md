# Session Variable vs RPC Function Analysis

## Current Problem

The `set_session_user()` RPC function sets `app.current_user_id` using `set_config(..., false)`:
- The `false` parameter means the setting is LOCAL to the current transaction
- **However**: Supabase uses connection pooling (pgBouncer in transaction mode)
- Each query may use a **different connection** from the pool
- The session variable set in one RPC call is **NOT visible** to subsequent queries

## Evidence from Console Logs

```
User ID: 89243fab-8f9a-4188-9f69-9a2b03794170
Account type: both
Update affected: 0 rows (RLS policy blocking)
```

This confirms:
1. User is authenticated with correct ID
2. `setUserContext()` is being called
3. But the UPDATE query doesn't see the session variable
4. RLS policy blocks because `current_user_id()` returns NULL

## Session Variable Implementation

### set_session_user() Function
```sql
CREATE OR REPLACE FUNCTION set_session_user(session_user_id uuid)
RETURNS void AS $$
BEGIN
  -- FALSE = transaction-local (lost after transaction ends)
  PERFORM set_config('app.current_user_id', session_user_id::text, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### current_user_id() Function
```sql
CREATE OR REPLACE FUNCTION current_user_id()
RETURNS uuid AS $$
BEGIN
  user_id_text := current_setting('app.current_user_id', true);
  RETURN user_id_text::uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### RLS Policy Checking current_user_id()
```sql
CREATE POLICY "Allow admins to update all member registrations"
  ON member_registrations
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = current_user_id()  -- Returns NULL!
      AND user_roles.role IN ('super_admin', 'admin', 'editor')
    )
  );
```

## Why Session Variables Fail with Connection Pooling

### Connection Pooling Modes

Supabase uses **PgBouncer in Transaction Mode**:
1. Connection is assigned for a single transaction
2. After transaction commits, connection returns to pool
3. Next query may get a **different connection**
4. Session variables don't persist across different connections

### The Execution Flow

```
1. Client calls: await customAuth.setUserContext(userId)
   ├─> Opens connection A
   ├─> Calls set_session_user RPC 
   ├─> Sets app.current_user_id in connection A
   └─> Transaction commits, connection A returns to pool

2. Client calls: await supabase.from('member_registrations').update()
   ├─> Gets connection B from pool (different connection!)
   ├─> RLS policy calls current_user_id()
   ├─> current_setting('app.current_user_id') returns NULL
   └─> Update blocked by RLS
```

## Solutions

### Option 1: Use SECURITY DEFINER RPC Function (RECOMMENDED)

Create a secure RPC function that:
1. Validates the calling user has permission
2. Performs the update **within the same transaction**
3. Bypasses RLS using SECURITY DEFINER

**Advantages:**
✅ Works with connection pooling
✅ Single transaction ensures atomicity
✅ Centralized permission checking
✅ Used successfully elsewhere (update_user_details, delete_user_by_id)

**Example:**
```sql
CREATE OR REPLACE FUNCTION admin_update_member_registration(
  p_member_id uuid,
  p_updates jsonb,
  p_updating_user_id uuid
)
RETURNS jsonb AS $$
DECLARE
  v_is_admin boolean;
  v_result jsonb;
BEGIN
  -- Check if user has admin role
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = p_updating_user_id
    AND role IN ('super_admin', 'admin', 'editor')
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  -- Perform update (bypasses RLS via SECURITY DEFINER)
  UPDATE member_registrations
  SET 
    full_name = COALESCE((p_updates->>'full_name')::text, full_name),
    email = COALESCE((p_updates->>'email')::text, email),
    -- ... all other fields
    last_modified_by = p_updating_user_id,
    last_modified_at = now()
  WHERE id = p_member_id
  RETURNING to_jsonb(member_registrations.*) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Option 2: Set Session Variable in Same Transaction

Use Supabase's `.rpc()` to set session context AND perform update:

```typescript
await supabase.rpc('update_member_with_context', {
  p_user_id: userId,
  p_member_id: memberId,
  p_updates: updateData
});
```

**Function:**
```sql
CREATE OR REPLACE FUNCTION update_member_with_context(
  p_user_id uuid,
  p_member_id uuid,
  p_updates jsonb
)
RETURNS void AS $$
BEGIN
  -- Set session variable
  PERFORM set_config('app.current_user_id', p_user_id::text, false);
  
  -- Perform update (in same transaction, sees session variable)
  UPDATE member_registrations
  SET ... -- update logic
  WHERE id = p_member_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Option 3: Use JWT Claims (Supabase Native Auth Pattern)

Supabase's native auth stores user info in JWT claims that persist across queries.
This requires migrating to Supabase Auth or implementing custom JWT handling.

**Not Recommended:** Would require major refactoring of custom auth system.

### Option 4: Pass User ID to RLS Policy via Function Parameter

Modify RLS policies to accept user_id as parameter instead of reading from session.

**Not Possible:** PostgreSQL RLS policies cannot accept function parameters.

## Recommended Approach

**Use Option 1: Create `admin_update_member_registration` RPC function**

### Implementation Plan:

1. **Create RPC Function** (`admin_update_member_registration.sql`)
   - Accept member_id, updates (jsonb), and updating_user_id
   - Validate user has admin permissions
   - Perform update within function (bypasses RLS via SECURITY DEFINER)
   - Return updated row data
   - Log audit trail within same transaction

2. **Update Client Code** (`supabase.ts`)
   - Replace direct `.update()` call with `.rpc()` call
   - Pass all update data as JSONB parameter
   - Remove `setUserContext()` call (not needed)
   - Handle response data

3. **Benefits:**
   - Works reliably with connection pooling
   - Single transaction ensures data consistency
   - Clear permission checking
   - Follows existing pattern in codebase

4. **Similar Functions Already in Use:**
   - `update_user_details` - Updates users table
   - `delete_user_by_id` - Deletes users
   - `block_unblock_user` - Blocks/unblocks users
   - All use SECURITY DEFINER pattern successfully

## Questions for Consideration

1. **Should we handle all fields or only allowed fields in RPC?**
   - Option A: Accept JSONB and dynamically update all provided fields
   - Option B: Explicitly list each field as a parameter
   
2. **Should super_admin restrictions be in RPC or client?**
   - Currently client removes payment fields for non-super-admins
   - Should RPC also enforce this restriction?

3. **Should we create similar RPC functions for other operations?**
   - `toggleMemberActive`
   - `softDeleteMember`
   - `updateStatusWithReason`
   - All have same connection pooling issue

## Next Steps

1. Review approach with you
2. Create migration for `admin_update_member_registration` function
3. Update client code to use RPC
4. Test thoroughly
5. Consider applying same pattern to other update operations
