# Admin Users Page - Role Display Debugging Guide

## Problem Description
Admin roles from the `user_roles` table are not displaying correctly. Users with role='super_admin' show generic "Admin" or "Member + Admin" instead of "Super Admin" or "Member + Super Admin".

## Debugging Steps Added

### 1. Data Loading Debug (loadUsers function)

Added console logs to track:
- Number of users loaded from `users` table
- Number of roles loaded from `user_roles` table
- Full roles data array
- For each admin/both user: user ID, role count, and role names
- Total number of users with roles prepared

**Console output format:**
```javascript
[AdminUsers] Loaded users: 5
[AdminUsers] Loaded roles: 3
[AdminUsers] Roles data: [{id: '...', user_id: '...', role: 'super_admin', ...}, ...]
[AdminUsers] User admin@example.com (admin): {userId: '...', foundRoles: 1, roles: ['super_admin']}
[AdminUsers] Users with roles prepared: 5
```

### 2. Display Logic Debug (getAccountTypeDisplay function)

Added console logs to track:
- Account type being processed
- Number of roles found
- Role names array
- Formatted role output
- Whether fallback is used

**Console output format:**
```javascript
[getAccountTypeDisplay] Processing user admin@example.com: {account_type: 'admin', roles_length: 1, roles: ['super_admin']}
[getAccountTypeDisplay] Admin user admin@example.com formatted roles: Super Admin
```

## How to Debug

### Step 1: Open Browser Console
1. Navigate to the Admin Users page
2. Open browser DevTools (F12)
3. Go to Console tab
4. Refresh the page

### Step 2: Check User Data Loading
Look for log lines starting with `[AdminUsers]`:

**Expected output if working correctly:**
```
[AdminUsers] Loaded users: 5
[AdminUsers] Loaded roles: 3
[AdminUsers] Roles data: [Array of role objects]
[AdminUsers] User admin@example.com (admin): {userId: '123...', foundRoles: 1, roles: ['super_admin']}
```

**If roles data is empty:**
- Problem: `user_roles` table query is not returning data
- Solution: Check RLS policies on `user_roles` table

**If foundRoles is 0:**
- Problem: user_id doesn't match between tables
- Solution: Verify user_id values in both tables match

### Step 3: Check Display Logic
Look for log lines starting with `[getAccountTypeDisplay]`:

**Expected output if working correctly:**
```
[getAccountTypeDisplay] Processing user admin@example.com: {account_type: 'admin', roles_length: 1, roles: ['super_admin']}
[getAccountTypeDisplay] Admin user admin@example.com formatted roles: Super Admin
```

**If roles_length is 0:**
- Problem: roles array not populated in User object
- Solution: Check data mapping in loadUsers function

**If seeing fallback message:**
```
[getAccountTypeDisplay] Fallback for user admin@example.com
```
- Problem: Conditions not matching (account_type or roles array)
- Solution: Verify User interface and data structure

## Common Issues and Solutions

### Issue 1: RLS Policy Blocking user_roles Query

**Symptom:**
```
[AdminUsers] Loaded roles: 0
[AdminUsers] Roles data: []
```

**Solution:**
Check if there's a policy allowing admins to read user_roles:
```sql
-- Check existing policies
SELECT * FROM pg_policies WHERE tablename = 'user_roles';

-- Create policy if missing
CREATE POLICY "Admins can view all user roles"
  ON user_roles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role IN ('super_admin', 'state_president', 'state_general_secretary',
                      'district_president', 'district_general_secretary',
                      'it_division_head', 'accounts_head')
    )
  );
```

### Issue 2: user_id Mismatch

**Symptom:**
```
[AdminUsers] User admin@example.com (admin): {userId: '123...', foundRoles: 0, roles: []}
```

**Solution:**
Check if user_id in user_roles matches id in users table:
```sql
-- Check for orphaned roles
SELECT ur.*
FROM user_roles ur
LEFT JOIN users u ON ur.user_id = u.id
WHERE u.id IS NULL;

-- Check if specific user has roles
SELECT u.email, u.id, ur.role
FROM users u
LEFT JOIN user_roles ur ON u.id = ur.user_id
WHERE u.account_type IN ('admin', 'both');
```

### Issue 3: roles Array Not Defined

**Symptom:**
```
[getAccountTypeDisplay] Processing user admin@example.com: {account_type: 'admin', roles_length: 0, roles: []}
```

**Solution:**
Ensure User interface includes roles array and it's being set correctly in loadUsers.

### Issue 4: formatRoleName Not Called

**Symptom:**
Display shows "super_admin" instead of "Super Admin"

**Solution:**
Check that formatRoleName function has correct mappings and is being called in getAccountTypeDisplay.

## Testing After Fix

1. **Verify Data Loading:**
   - Console should show roles being loaded
   - Each admin user should have roles array populated

2. **Verify Display:**
   - Admin users should show formatted role names
   - Both users should show "Member + [Role Name]"
   - General users should show "General User"
   - Regular members should show "Member"

3. **Test Multiple Roles:**
   - User with multiple roles should show comma-separated list
   - Example: "Super Admin, Accounts Head"

4. **Test Sorting:**
   - Sorting by Account Type should work
   - Sort order should be consistent

## Remove Debug Logs After Fix

Once issue is identified and fixed, consider removing or commenting out debug logs for cleaner console output in production.

## Expected Final Behavior

- **account_type='admin'** with roles=['super_admin'] → Display: "Super Admin"
- **account_type='both'** with roles=['super_admin'] → Display: "Member + Super Admin"
- **account_type='admin'** with roles=['super_admin', 'accounts_head'] → Display: "Super Admin, Accounts Head"
- **account_type='admin'** with roles=[] → Display: "Admin" (fallback)
- **account_type='member'** → Display: "Member"
- **account_type='general_user'** → Display: "General User"
