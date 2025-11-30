# ⚠️ URGENT: Apply These Migrations Now

## The Issue
The error "permission denied for table users (Code: 42501)" means the OLD RLS policy with auth.users reference is still active in your database. The migrations we created haven't been applied yet.

## You MUST Apply Both Migrations

### Step 1: Open Supabase Dashboard
1. Go to https://supabase.com/dashboard
2. Select your project: `0ec90b57d6e95fcbda19832f`
3. Click "SQL Editor" in the left sidebar

---

### Step 2: Apply Migration #1 (Fix auth.users error)

Click "New query" and copy/paste this EXACT SQL:

```sql
-- Drop all existing SELECT policies on member_registrations
DROP POLICY IF EXISTS "Role-based access for member registrations" ON member_registrations;
DROP POLICY IF EXISTS "Public can read approved members" ON member_registrations;
DROP POLICY IF EXISTS "Users can read own registrations" ON member_registrations;
DROP POLICY IF EXISTS "Members can read approved registrations" ON member_registrations;
DROP POLICY IF EXISTS "Allow public read of approved members" ON member_registrations;

-- Create NEW simple policy without auth.users reference
CREATE POLICY "Public read approved members only"
  ON member_registrations
  FOR SELECT
  TO anon, authenticated
  USING (status = 'approved');

-- Add performance indexes
CREATE INDEX IF NOT EXISTS idx_member_registrations_status_approved
ON member_registrations(status)
WHERE status = 'approved';

CREATE INDEX IF NOT EXISTS idx_member_registrations_state
ON member_registrations(state)
WHERE status = 'approved';

CREATE INDEX IF NOT EXISTS idx_member_registrations_district
ON member_registrations(district)
WHERE status = 'approved';

CREATE INDEX IF NOT EXISTS idx_member_registrations_state_name
ON member_registrations(state, full_name)
WHERE status = 'approved';

CREATE INDEX IF NOT EXISTS idx_member_registrations_full_name
ON member_registrations(full_name)
WHERE status = 'approved';

CREATE INDEX IF NOT EXISTS idx_member_registrations_company_name
ON member_registrations(company_name)
WHERE status = 'approved';
```

Click **"Run"** (or press Ctrl+Enter)

✅ Wait for "Success. No rows returned" message

---

### Step 3: Apply Migration #2 (Fix company_designations access)

Click "New query" again and copy/paste this EXACT SQL:

```sql
-- Enable RLS on company_designations
ALTER TABLE company_designations ENABLE ROW LEVEL SECURITY;

-- Drop any existing SELECT policies
DROP POLICY IF EXISTS "Public can read company designations" ON company_designations;
DROP POLICY IF EXISTS "Allow public read of designations" ON company_designations;
DROP POLICY IF EXISTS "Anyone can view designations" ON company_designations;
DROP POLICY IF EXISTS "Public can read all designations" ON company_designations;

-- Create public read policy
CREATE POLICY "Public read all designations"
  ON company_designations
  FOR SELECT
  TO anon, authenticated
  USING (true);
```

Click **"Run"** (or press Ctrl+Enter)

✅ Wait for "Success. No rows returned" message

---

### Step 4: Verify Policies Were Created

Run this query to check:

```sql
-- Check member_registrations policies
SELECT schemaname, tablename, policyname, roles, cmd
FROM pg_policies
WHERE tablename = 'member_registrations' AND cmd = 'SELECT';

-- Check company_designations policies
SELECT schemaname, tablename, policyname, roles, cmd
FROM pg_policies
WHERE tablename = 'company_designations' AND cmd = 'SELECT';
```

You should see:
- `Public read approved members only` on member_registrations
- `Public read all designations` on company_designations

---

### Step 5: Test in Your Browser

1. Go back to your application
2. Navigate to the Directory page
3. Click the "Retry" button or refresh the page
4. You should see all 144 members!

---

## If You Still See Errors

### Check Browser Console (F12)
Look for lines starting with `[Directory]`:
- Should see: `[Directory] Successfully loaded 144 members`
- If you see errors, copy the full error message

### Verify the Policies Exist
In Supabase Dashboard → Authentication → Policies:
- Find `member_registrations` table
- Should see policy: "Public read approved members only"
- Should show: `TO anon, authenticated` and `USING (status = 'approved')`

### Check for Typos in Status Column
Run this query to see status values:
```sql
SELECT DISTINCT status, COUNT(*)
FROM member_registrations
GROUP BY status;
```

Should show `approved` (lowercase). If you see `Approved` (capital A), run:
```sql
UPDATE member_registrations SET status = 'approved' WHERE status = 'Approved';
```

---

## Why Both Migrations Are Required

### Migration #1: Fixes the "permission denied for table users" Error
- The old policy tried to access auth.users table
- Anonymous users can't read auth.users
- New policy only checks status = 'approved'
- No authentication table access needed

### Migration #2: Fixes the JOIN Operation
- Directory query joins to company_designations table
- Even LEFT JOIN fails if the table blocks anonymous access
- This policy allows anonymous users to read designation names

---

## Quick Test After Applying

Open your browser's **Incognito/Private Window**:
1. Go to your application URL
2. Navigate to Directory (don't sign in)
3. Should see member cards immediately
4. Should show "Showing 1-25 of 144 members"

If you see members → SUCCESS! ✅
If you still see error → Check console logs and policy names

---

## Common Mistakes to Avoid

❌ Don't modify the SQL - copy/paste exactly as shown
❌ Don't forget to click "Run" after pasting
❌ Don't skip migration #2 - both are required
❌ Don't forget to refresh the directory page after applying

✅ Copy/paste exactly as shown
✅ Run both migrations in order
✅ Wait for success message after each
✅ Refresh directory page to test

---

## Need Help?

If the error persists after applying both migrations:
1. Check browser console (F12 → Console tab)
2. Look for `[Directory]` logs
3. Copy the full error message
4. Check that both policies were created (use verification query above)
