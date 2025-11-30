# CRITICAL FIX: Removed auth.users Table Reference

## The Error
```
"permission denied for table users (Code: 42501)"
```

## Root Cause
The RLS policy on `member_registrations` table was trying to access the `auth.users` table:

### Original (Broken) Policy
```sql
CREATE POLICY "Allow public read of approved members"
  ON member_registrations
  FOR SELECT
  USING (
    status = 'approved'
    OR
    (auth.uid() IS NOT NULL AND email = (SELECT email FROM auth.users WHERE id = auth.uid()))
  );
```

**Problem:** The subquery `(SELECT email FROM auth.users WHERE id = auth.uid())` requires permission to read the auth.users table, which anonymous users don't have.

## The Fix

### New (Working) Policy
```sql
CREATE POLICY "Allow public read of approved members"
  ON member_registrations
  FOR SELECT
  TO anon, authenticated
  USING (status = 'approved');
```

**Key Changes:**
1. ✅ Removed the auth.users subquery entirely
2. ✅ Simplified to only check `status = 'approved'`
3. ✅ Explicitly applies to both `anon` and `authenticated` roles
4. ✅ No authentication table access required

## Why This Matters

### For Public Directory
A public directory should **never** need to access authentication data:
- Anonymous users need to see approved members
- No user account lookup required
- No email matching needed
- Just show approved members - that's it!

### RLS Policy Best Practices
1. **Keep policies simple** - fewer table references = fewer permission issues
2. **Avoid auth.users in public policies** - anonymous users can't access it
3. **Use role-specific policies** - explicitly state `TO anon, authenticated`
4. **Test as anonymous user** - use incognito mode to verify

## Impact

### Before Fix
- ❌ Error 42501 for all users (anonymous and authenticated)
- ❌ Directory completely broken
- ❌ No members displayed

### After Fix
- ✅ Anonymous users can view approved members
- ✅ Authenticated users can view approved members
- ✅ No authentication table access needed
- ✅ Fast and simple query execution

## Other Tables Using Same Pattern

If you see similar errors on other tables, check for:
```sql
-- BAD: Tries to access auth.users
USING (some_column = (SELECT email FROM auth.users WHERE id = auth.uid()))

-- GOOD: Uses auth.uid() directly
USING (user_id = auth.uid())

-- BEST FOR PUBLIC: No auth check at all
USING (is_public = true)
```

## Files Updated

1. ✅ `supabase/migrations/20251002190000_enable_public_directory_access.sql`
   - Removed auth.users reference
   - Simplified policy to `status = 'approved'`

2. ✅ `QUICK-FIX-GUIDE.md`
   - Updated SQL with corrected policy

3. ✅ `DEBUG-SUMMARY.md`
   - Documented the issue and fix

## Verification

After applying the migration, check in browser console:
```
[Directory] Starting to load members...
[Directory] Executing query...
[Directory] Successfully loaded 144 members
```

No more error 42501!

## Key Takeaway

**For public-facing features, avoid accessing auth.users table in RLS policies.**

The directory doesn't need to know WHO is viewing it - it just needs to show approved members to everyone. Keep it simple, keep it fast, keep it working.
