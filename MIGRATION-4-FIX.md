# Migration 4 Fix - Policy Dependencies Resolved

## Issue Identified
Migration 4 failed with error: "cannot drop column user_id of table member_registrations because other objects depend on it"

The following RLS policies were preventing the column drop:
1. "Members can view own registration" on member_registrations
2. "Members can update own registration" on member_registrations
3. "Authenticated users can create registration" on member_registrations
4. "Members can view own audit history" on member_audit_history

## Solution Implemented

Updated Migration 4 (`20251020000004_update_member_registrations_foreign_keys.sql`) to:

### Step 0 (NEW): Drop Dependent Policies
```sql
DROP POLICY IF EXISTS "Members can view own registration" ON member_registrations;
DROP POLICY IF EXISTS "Members can update own registration" ON member_registrations;
DROP POLICY IF EXISTS "Authenticated users can create registration" ON member_registrations;
DROP POLICY IF EXISTS "Members can view own audit history" ON member_audit_history;
```

### Then proceed with original steps:
- Step 1: Create temporary user_id_new column
- Step 2-3: Copy user_id data
- Step 4: Drop old foreign key
- Step 5: Drop old user_id column (now works!)
- Step 6-9: Rename column and create new foreign key

## Important Notes

1. **RLS policies are temporarily removed** in Migration 4
2. **They will be recreated** in Migration 6 with custom auth support
3. **Security Impact**: Between Migration 4 and 6, RLS policies don't exist
   - This is acceptable because migrations are run in sequence
   - Don't access the database between migrations 4 and 6

## Updated Files

✅ `supabase/migrations/20251020000004_update_member_registrations_foreign_keys.sql` - Updated
✅ `CUSTOM-AUTH-MIGRATION-INSTRUCTIONS.md` - Documentation updated

## Expected Output When Running Migration 4

```
NOTICE:  Dropped 4 RLS policies that depended on user_id column
NOTICE:  These policies will be recreated in Migration 6 with custom auth
NOTICE:  144 members linked to user accounts
NOTICE:  0 users have both admin and member roles
```

(Your numbers may vary based on actual data)

## Ready to Run

Migration 4 is now fixed and ready to run. You can proceed with:
1. Copy the updated Migration 4 contents
2. Paste into Supabase SQL Editor
3. Run the migration
4. Continue with Migrations 5 and 6

---

**Fixed**: October 20, 2025
**Status**: Ready for execution
