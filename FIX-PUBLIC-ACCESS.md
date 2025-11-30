# Fix Public Access to Members Directory

## Problem
The Members Directory is showing "No members found" for public (non-logged-in) users, but works correctly for logged-in admins. This indicates that Row Level Security (RLS) policies are blocking anonymous access to the `member_registrations` table.

## Root Cause
The current RLS policies on the `member_registrations` table do not allow anonymous (`anon` role) users to read approved member records. Only authenticated users can access the data.

## Solution
Apply the migration file that creates proper RLS policies allowing public access to approved members:

**Migration File:** `supabase/migrations/20251002190000_enable_public_directory_access.sql`

## How to Apply the Migration

### Option 1: Using Supabase Dashboard (Recommended)

1. **Open Supabase Dashboard**
   - Go to https://supabase.com/dashboard
   - Select your project: `0ec90b57d6e95fcbda19832f`

2. **Navigate to SQL Editor**
   - Click on "SQL Editor" in the left sidebar
   - Click "New query"

3. **Copy and Paste the Migration SQL**
   - Open the migration file: `supabase/migrations/20251002190000_enable_public_directory_access.sql`
   - Copy the entire contents
   - Paste into the SQL Editor

4. **Execute the Migration**
   - Click "Run" or press Ctrl+Enter
   - Wait for confirmation that the query executed successfully

5. **Verify Success**
   - You should see a success message
   - The directory should now show members for public users

### Option 2: Using Supabase CLI (If installed)

```bash
# From the project root directory
supabase db push

# Or apply specific migration
supabase migration up
```

## What the Migration Does

### 1. Fixes RLS Policies
- **Drops old restrictive policies** that were blocking anonymous access
- **Creates a new comprehensive policy** that allows:
  - ✅ Anonymous users can read approved members
  - ✅ Authenticated users can read approved members
  - ✅ Authenticated users can also read their own registrations (any status)

### 2. Adds Performance Indexes
- Indexes on `state`, `district`, `full_name`, `company_name`
- Composite index for state-grouped pagination
- GIN index for full-text search on products/services
- All indexes are partial (only on approved members) for optimal performance

### 3. Creates Helper Function
- `get_member_counts_by_state()` - Returns member counts grouped by state
- Accessible to both anonymous and authenticated users

## Expected Behavior After Fix

### For Public (Non-Logged-In) Users
Will see for each member:
- ✅ Full name
- ✅ Company name
- ✅ District, City
- ✅ Business type/industry badge
- ✅ "Sign in to view contact details" message

### For Logged-In Members
Will see everything public users see PLUS:
- ✅ Company designation
- ✅ Member since date
- ✅ Phone number
- ✅ Email address
- ✅ Full company address
- ✅ Website link

### For Admin Users
Will see everything members see PLUS:
- ✅ GST certificate link
- ✅ UDYAM certificate link
- ✅ Payment proof link

## Verification Steps

### 1. Check in Browser (Incognito Mode)
1. Open your application in an **incognito/private window** (to simulate non-logged-in user)
2. Navigate to the Members Directory page
3. You should see member cards with basic information
4. Contact details should show "Sign in to view"

### 2. Run Test Script
```bash
node test-public-access-simple.js
```

Expected output:
```
✅ SUCCESS: Fetched 10 members (Total approved: 144)
🎉 PERFECT: All 144 members are accessible!
```

### 3. Check Different User States
- **Public user**: Should see 144 members with limited info
- **Logged-in member**: Should see 144 members with contact details
- **Admin user**: Should see 144 members with documents

## Troubleshooting

### Still showing "No members found"?

1. **Verify migration was applied**
   - Check in Supabase Dashboard → Database → Migrations
   - Look for `20251002190000_enable_public_directory_access`

2. **Check RLS policies directly**
   - Go to Supabase Dashboard → Authentication → Policies
   - Find `member_registrations` table
   - Should see policy: "Allow public read of approved members"
   - Policy should apply to: `anon`, `authenticated`

3. **Verify member status values**
   - Run in SQL Editor:
     ```sql
     SELECT status, COUNT(*)
     FROM member_registrations
     GROUP BY status;
     ```
   - Should show: `approved | 144`
   - If you see `Approved` (capital A), the status values are case-sensitive

### If status values are incorrect:

```sql
-- Fix status values if they're capitalized
UPDATE member_registrations
SET status = 'approved'
WHERE status = 'Approved';
```

## Technical Details

### The Key RLS Policy

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

This policy allows:
1. **Anyone** (including anonymous users) to read records where `status = 'approved'`
2. **Authenticated users** to also read their own records (matched by email)

### Why This Works
- PostgreSQL RLS uses OR logic when multiple conditions are present
- The policy is permissive (allows access) rather than restrictive (blocks access)
- It applies to both `anon` and `authenticated` roles
- The `USING` clause is checked before allowing SELECT operations

## Files Modified/Created

1. ✅ `supabase/migrations/20251002190000_enable_public_directory_access.sql` - New migration
2. ✅ `src/pages/Directory.tsx` - Updated to show minimal info for public users
3. ✅ `test-public-access-simple.js` - Test script to verify public access
4. ✅ `FIX-PUBLIC-ACCESS.md` - This documentation file

## Summary

**Current Status:** RLS policies are blocking public access

**Required Action:** Apply the migration file using Supabase Dashboard SQL Editor

**Expected Result:** All 144 approved members visible to public users with limited information

**Time to Fix:** < 2 minutes

## Questions?

If the directory still doesn't work after applying the migration:
1. Check browser console for errors
2. Verify the Supabase URL and Anon Key in `.env` file
3. Ensure RLS is enabled on the `member_registrations` table
4. Run the test script to diagnose the exact issue
