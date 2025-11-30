# Custom Authentication Migration Instructions

## Overview
This document provides step-by-step instructions for migrating from Supabase Auth to a custom authentication system.

## Migration Files Created

All 6 migration files have been created in the `supabase/migrations/` directory:

1. `20251020000001_create_custom_auth_tables.sql` - Create core auth tables
2. `20251020000002_migrate_admin_users_from_supabase_auth.sql` - Migrate admin users
3. `20251020000003_create_user_accounts_for_legacy_members.sql` - Create legacy member accounts
4. `20251020000004_update_member_registrations_foreign_keys.sql` - Update member_registrations
5. `20251020000005_update_user_roles_foreign_keys.sql` - Update user_roles and other tables
6. `20251020000006_update_rls_policies_for_custom_auth.sql` - Update RLS policies

## How to Apply Migrations

### Option 1: Using Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard: https://app.supabase.com
2. Navigate to "SQL Editor"
3. Apply each migration **ONE BY ONE** in order:

   **Migration 1:**
   - Copy contents of `20251020000001_create_custom_auth_tables.sql`
   - Paste into SQL Editor
   - Click "Run"
   - Verify: Check that `users`, `auth_sessions`, and `password_reset_tokens` tables are created

   **Migration 2:**
   - Copy contents of `20251020000002_migrate_admin_users_from_supabase_auth.sql`
   - Paste into SQL Editor
   - Click "Run"
   - Check output: Should show "Migrated X admin users from Supabase Auth"

   **Migration 3:**
   - Copy contents of `20251020000003_create_user_accounts_for_legacy_members.sql`
   - Paste into SQL Editor
   - Click "Run"
   - Check output: Should show "Created user accounts for X legacy members"

   **Migration 4:**
   - Copy contents of `20251020000004_update_member_registrations_foreign_keys.sql`
   - Paste into SQL Editor
   - Click "Run"
   - Check output: Should show "Dropped 4 RLS policies", then "X members linked to user accounts" and "X users have both admin and member roles"
   - Note: This migration drops RLS policies temporarily - they will be recreated in Migration 6

   **Migration 5:**
   - Copy contents of `20251020000005_update_user_roles_foreign_keys.sql`
   - Paste into SQL Editor
   - Click "Run"
   - Check output: Should show "All user_roles records have valid user_id references"

   **Migration 6:**
   - Copy contents of `20251020000006_update_rls_policies_for_custom_auth.sql`
   - Paste into SQL Editor
   - Click "Run"
   - Check output: Should show "RLS policies updated for custom authentication"

### Option 2: Using Supabase CLI

If you have Supabase CLI installed:

```bash
# Apply all migrations
supabase db push

# Or apply them one by one
supabase db execute --file supabase/migrations/20251020000001_create_custom_auth_tables.sql
supabase db execute --file supabase/migrations/20251020000002_migrate_admin_users_from_supabase_auth.sql
supabase db execute --file supabase/migrations/20251020000003_create_user_accounts_for_legacy_members.sql
supabase db execute --file supabase/migrations/20251020000004_update_member_registrations_foreign_keys.sql
supabase db execute --file supabase/migrations/20251020000005_update_user_roles_foreign_keys.sql
supabase db execute --file supabase/migrations/20251020000006_update_rls_policies_for_custom_auth.sql
```

## Expected Results After Each Migration

### After Migration 1
- New tables created: `users`, `auth_sessions`, `password_reset_tokens`
- Helper functions created: `hash_password()`, `verify_password()`, `generate_session_token()`, etc.

### After Migration 2
- Admin users (approximately 2) migrated from `auth.users` to `users` table
- All admin accounts have `password_hash = 'PENDING_PASSWORD_RESET'`
- All admin accounts have `account_status = 'password_pending'`

### After Migration 3
- Legacy member accounts (approximately 144) created in `users` table
- All legacy member accounts have `password_hash = 'PENDING_FIRST_LOGIN'`
- All legacy member accounts have `account_status = 'password_pending'`

### After Migration 4
- 4 RLS policies temporarily dropped (they reference the old user_id column)
- `member_registrations.user_id` now references `users` table (not `auth.users`)
- Legacy members linked to their new user accounts
- Dual-role users (admin + member) have `account_type = 'both'` in `users` table
- **IMPORTANT**: RLS policies will be recreated in Migration 6 with custom auth

### After Migration 5
- `user_roles.user_id` now references `users` table
- All admin tracking columns in various tables updated to reference `users` table
- No orphaned foreign key references

### After Migration 6
- RLS policies updated to use `current_user_id()` instead of `auth.uid()`
- Session management functions created: `set_session_user()` and `current_user_id()`

## Verification Queries

After all migrations complete, run these queries to verify:

```sql
-- 1. Check users table
SELECT
  account_type,
  account_status,
  password_hash,
  COUNT(*) as count
FROM users
GROUP BY account_type, account_status, password_hash;

-- Expected results:
-- account_type='admin', account_status='password_pending', password_hash='PENDING_PASSWORD_RESET', count=2 (or similar)
-- account_type='member', account_status='password_pending', password_hash='PENDING_FIRST_LOGIN', count=144 (or similar)
-- account_type='both', account_status='password_pending', password_hash='PENDING_PASSWORD_RESET', count=0 or more


-- 2. Check member_registrations linkage
SELECT
  COUNT(*) as total_members,
  COUNT(user_id) as linked_members,
  COUNT(*) - COUNT(user_id) as unlinked_members
FROM member_registrations;

-- Expected: Most or all members should be linked (linked_members should be close to total_members)


-- 3. Check dual-role users
SELECT
  u.email,
  u.account_type,
  COUNT(DISTINCT ur.id) as admin_roles_count,
  COUNT(DISTINCT mr.id) as member_count
FROM users u
LEFT JOIN user_roles ur ON ur.user_id = u.id
LEFT JOIN member_registrations mr ON mr.user_id = u.id
WHERE u.account_type = 'both'
GROUP BY u.email, u.account_type;

-- Expected: Shows users with both admin roles and member registration


-- 4. Check foreign key constraints
SELECT
  tc.table_name,
  tc.constraint_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND ccu.table_name = 'users'
ORDER BY tc.table_name;

-- Expected: Multiple tables referencing users(id)
```

## Post-Migration Tasks

After successfully applying all migrations:

### 1. Notify Admin Users (Immediate)
Send password reset emails to the 2 admin users informing them:
- The system has been upgraded
- They need to reset their password
- Provide password reset link/instructions

### 2. Test Authentication (Before Production)
- Test admin login flow
- Test member login flow
- Test password reset flow
- Test dual-role user access (member + admin)

### 3. Update Application Code (Required)
The application code needs to be updated to:
- Use custom authentication instead of Supabase Auth
- Implement session token validation
- Call `set_session_user()` function after validating session
- Implement password hashing using the `hash_password()` function
- Implement first-login flow for legacy members

### 4. Create Password Reset UI
Build UI for:
- Admin password reset flow
- Member first-login security verification (company name + PIN code)
- Member password setup after verification

### 5. Session Management
Implement:
- Session token generation and storage
- 7-day activity-based session expiration
- Session refresh on activity
- Session invalidation on password change

## Rollback Instructions

If you need to rollback the migration, execute these SQL commands in **reverse order**:

```sql
-- Rollback Migration 6: Restore RLS policies to use auth.uid()
-- (You'll need to manually restore the old policies)

-- Rollback Migration 5: Restore foreign keys to auth.users
-- (Complex - not recommended after data has been modified)

-- Rollback Migration 4: Restore member_registrations.user_id
-- (Complex - not recommended after data has been modified)

-- Rollback Migration 3: Delete legacy member user accounts
DELETE FROM users WHERE password_hash = 'PENDING_FIRST_LOGIN';

-- Rollback Migration 2: Delete admin user accounts
DELETE FROM users WHERE password_hash = 'PENDING_PASSWORD_RESET';

-- Rollback Migration 1: Drop custom auth tables
DROP TABLE IF EXISTS password_reset_tokens;
DROP TABLE IF EXISTS auth_sessions;
DROP TABLE IF EXISTS users CASCADE;
DROP FUNCTION IF EXISTS hash_password(text);
DROP FUNCTION IF EXISTS verify_password(text, text);
DROP FUNCTION IF EXISTS generate_session_token();
DROP FUNCTION IF EXISTS clean_expired_sessions();
DROP FUNCTION IF EXISTS current_user_id();
DROP FUNCTION IF EXISTS set_session_user(uuid);
DROP FUNCTION IF EXISTS check_user_permission(text, text);
```

**WARNING**: Rollback is only safe BEFORE updating application code. After users start using the new system, rollback will result in data loss.

## Troubleshooting

### Issue: Migration 2 fails with "relation auth.users does not exist"
**Solution**: This is expected if Supabase Auth hasn't been used. Check if you have any admin users in `user_roles` table first. If not, you may need to manually create admin users.

### Issue: Migration 4 shows "0 members linked"
**Solution**: Check if `member_registrations` has any records with `user_id IS NULL`. Run the SELECT query to see which members weren't linked, then debug why.

### Issue: Foreign key constraint violation
**Solution**: This means there's a data integrity issue. Don't proceed. Check which user_id values are invalid and fix them first.

### Issue: RLS policies block all access
**Solution**: The application must call `set_session_user(user_id)` after validating the session token. Without this, `current_user_id()` returns NULL and all RLS policies deny access.

## Next Steps

1. **Apply all migrations** in order as described above
2. **Run verification queries** to confirm success
3. **Notify admin users** about password reset requirement
4. **Plan application code updates** to support custom auth
5. **Implement password reset UI** for admins
6. **Implement first-login flow** for legacy members
7. **Test thoroughly** before production deployment

## Support

If you encounter issues during migration, check:
1. Supabase logs for detailed error messages
2. PostgreSQL error codes for foreign key violations
3. RLS policy conflicts by temporarily disabling RLS for testing

---

**Created**: October 19, 2025
**Status**: Ready for execution
**Files Location**: `/supabase/migrations/2025102000000[1-6]_*.sql`
