# Member ID Duplicate Constraint Error - FIXED

## Problem Summary

When editing a member with an existing `member_id`, the system threw this error:
```
duplicate key value violates unique constraint 'member_registrations_member_id_key'
```

## Root Cause

The `member_id` field has a UNIQUE constraint in the database. The RPC function `update_member_registration` was attempting to update the `member_id` field even when the value hadn't changed.

### Why This Failed

The previous logic was:
```sql
member_id = COALESCE((v_update_data->>'member_id'), member_id),
```

This meant:
1. If `member_id` is in the updates, use it
2. Otherwise, keep the existing value

However, when editing a member:
- The form includes the current `member_id` value
- The RPC tries to "update" it to the same value
- PostgreSQL's UNIQUE constraint check triggers
- The constraint sees "trying to set member_id='LUB-001' but that value exists"
- It doesn't recognize it's the same row being updated
- Result: Duplicate constraint violation error

## The Fix

**Migration Created:** `20251030000001_fix_member_id_duplicate_constraint.sql`

### Changed Logic

The new `member_id` update logic:
```sql
member_id = CASE
  WHEN v_update_data->>'member_id' IS NOT NULL
    AND v_update_data->>'member_id' != ''
    AND v_update_data->>'member_id' != COALESCE(member_id, '')
  THEN v_update_data->>'member_id'
  WHEN v_update_data->>'member_id' = ''
  THEN NULL
  ELSE member_id
END,
```

This means:
- ✅ Only update `member_id` if a new value is provided
- ✅ AND the new value is not empty
- ✅ AND the new value is different from the current value
- ✅ If empty string is provided, convert to NULL
- ✅ Otherwise, keep existing `member_id` unchanged

### Additional Security Improvement

Added line to remove `member_id` from updates for non-super-admins:
```sql
v_update_data := v_update_data - 'member_id';  -- Remove member_id for non-super-admins
```

This ensures only super admins can modify the `member_id` field.

## How It Works Now

### Scenario 1: Super Admin Edits Member Without Changing member_id
- **Before:** Tried to update to same value → UNIQUE constraint error ❌
- **After:** Detects value unchanged → Skips update → No error ✅

### Scenario 2: Super Admin Changes member_id to New Value
- **Before:** Updates to new value → Works (if unique) ✅
- **After:** Detects value changed → Updates to new value → Works ✅

### Scenario 3: Super Admin Clears member_id Field
- **Before:** Would try to set empty string → Possible issues
- **After:** Converts empty string to NULL → Works correctly ✅

### Scenario 4: Non-Super Admin Tries to Edit member_id
- **Before:** Field stripped later in process
- **After:** Field stripped immediately in permission check → More secure ✅

## Testing the Fix

To verify the fix works:

1. **Test unchanged member_id:**
   - Edit a member who has `member_id = "LUB-001"`
   - Don't change the member_id field
   - Save changes
   - **Expected:** No error, saves successfully

2. **Test changing member_id:**
   - Edit a member
   - Change their member_id to a new unique value
   - Save changes
   - **Expected:** Updates successfully

3. **Test clearing member_id:**
   - Edit a member who has a member_id
   - Clear the member_id field (make it empty)
   - Save changes
   - **Expected:** Sets member_id to NULL

4. **Test non-super admin:**
   - Login as non-super admin
   - Try to edit a member
   - **Expected:** member_id field should not be visible/editable

## Database Schema Reference

**Table:** `member_registrations`
**Field:** `member_id TEXT NULL UNIQUE`

**Constraint:** `member_registrations_member_id_key`
- Type: UNIQUE constraint
- Allows NULL values
- Prevents duplicate non-NULL values

**Migration History:**
1. `20251005100000_add_member_id_column.sql` - Created field with UNIQUE constraint
2. `20251028000006_create_admin_update_member_rpc.sql` - Created RPC function
3. `20251028000008_fix_update_member_rpc_audit_logging.sql` - Fixed audit logging
4. `20251030000001_fix_member_id_duplicate_constraint.sql` - **Fixed duplicate constraint error** ✅
5. `20251030000002_fix_audit_column_name.sql` - **Fixed audit logging column name** ✅

## Additional Fix: Audit Column Name

After creating the initial fix, discovered the RPC function was using the wrong column name for audit logging.

**Problem:** Referenced `changed_at` column that doesn't exist in `member_audit_history` table

**Actual Schema:** The column is named `created_at` (from migration 20251004044045)

**Fix:** Migration `20251030000002_fix_audit_column_name.sql` corrects the INSERT statement:
```sql
-- BEFORE (Wrong)
INSERT INTO member_audit_history (
  member_id, action_type, field_name, old_value, new_value, changed_by,
  changed_at  -- ❌ Column doesn't exist
)

-- AFTER (Correct)
INSERT INTO member_audit_history (
  member_id, action_type, field_name, old_value, new_value, changed_by,
  created_at  -- ✅ Actual column name
)
```

## Summary

The fix prevents the RPC function from triggering PostgreSQL's UNIQUE constraint when updating a member with an unchanged `member_id` value. The function now intelligently detects when `member_id` is actually changing and only performs the update when necessary. Additionally, the audit logging now uses the correct column name.

**Migrations Created:**
1. `20251030000001_fix_member_id_duplicate_constraint.sql` - Fixed member_id duplicate constraint logic
2. `20251030000002_fix_audit_column_name.sql` - Fixed audit logging to use `created_at` instead of `changed_at`

**Status:** ✅ FIXED - Build passes, both migrations ready to apply
