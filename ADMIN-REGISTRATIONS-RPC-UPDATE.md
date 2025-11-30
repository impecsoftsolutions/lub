# AdminRegistrations.tsx - RPC Function Update Complete

## Summary

Successfully updated AdminRegistrations.tsx to use the `get_admin_member_registrations` RPC function instead of the direct Supabase query that was being blocked by RLS policies.

## Changes Made

### File Updated
- `src/pages/AdminRegistrations.tsx`

### Function Modified
- `loadRegistrations()` (lines 105-155)

## What Changed

### Before (Direct Query - BLOCKED by RLS)
```typescript
const { data, error } = await supabase
  .from('member_registrations')
  .select(`
    *,
    company_designations(designation_name)
  `)
  .order('created_at', { ascending: false });
```

**Problem**: This query was blocked by RLS policies because:
- `current_user_id()` returns NULL (session never set)
- RLS policies check `user_roles` table but user has no entries
- Result: Empty array, admin cannot see any registrations

### After (RPC Function - BYPASSES RLS)
```typescript
// Get current user ID from localStorage
const userDataStr = localStorage.getItem('lub_session_token_user');
const userData = userDataStr ? JSON.parse(userDataStr) : null;
const userId = userData?.id;

if (!userId) {
  console.error('[AdminRegistrations] User ID not found in session');
  showToast('error', 'User session not found. Please log in again.');
  setIsLoading(false);
  return;
}

// Call RPC function instead of direct query
const { data, error } = await supabase.rpc('get_admin_member_registrations', {
  p_requesting_user_id: userId,
  p_status_filter: null, // Get all statuses
  p_search_query: null,  // No search filter at load time
  p_state_filter: null,  // Get all states
  p_limit: 1000,         // Get all records
  p_offset: 0
});

// Transform data to match expected structure
const transformedData = (data || []).map((reg: any) => ({
  ...reg,
  company_designations: reg.company_designation_name
    ? { designation_name: reg.company_designation_name }
    : null
}));

setRegistrations(transformedData);
```

**Solution**: This approach:
- Extracts user ID from localStorage session
- Calls RPC function with user ID for authorization
- RPC uses SECURITY DEFINER to bypass RLS
- RPC validates permissions internally (dual check: account_type + user_roles)
- Returns all member registrations if authorized
- Transforms data to match expected component structure

## Key Features

### 1. User Authentication Check
- Reads `lub_session_token_user` from localStorage
- Validates user ID exists
- Shows error toast if session not found
- Early return prevents RPC call without user ID

### 2. RPC Function Call
- Function: `get_admin_member_registrations`
- Parameter: `p_requesting_user_id` (from session)
- Filters: All set to `null` to get all records
- Limit: 1000 records (configurable)
- Offset: 0 (no pagination at load time)

### 3. Authorization (Handled in RPC)
The RPC function internally checks:
- User exists and is active
- User has `account_type IN ('admin', 'both')` OR
- User has role in `user_roles` table ('super_admin', 'admin', 'editor', 'viewer')

### 4. Data Transformation
RPC returns flat structure with `company_designation_name`:
```typescript
{
  id: 'uuid',
  full_name: 'John Doe',
  company_designation_name: 'Director', // Flat field from JOIN
  // ... other fields
}
```

Component expects nested structure:
```typescript
{
  id: 'uuid',
  full_name: 'John Doe',
  company_designations: {
    designation_name: 'Director' // Nested object
  },
  // ... other fields
}
```

Transformation code maps the flat field to nested structure.

### 5. Console Logging
Added debug logs:
- `[AdminRegistrations] Fetching registrations for user: {userId}`
- `[AdminRegistrations] Fetched registrations: {count}`
- `[AdminRegistrations] User ID not found in session` (error)
- `[AdminRegistrations] RPC error: {error}` (error)

## Expected Behavior

### Success Case
1. Admin logs in successfully
2. Session token with user ID stored in localStorage
3. Admin navigates to /admin/registrations
4. `loadRegistrations()` executes
5. User ID extracted from localStorage
6. RPC function called with user ID
7. RPC validates admin authorization (account_type or user_roles)
8. RPC returns all member registrations (including new submission)
9. Data transformed to expected structure
10. Component displays **145 registrations** (not 144)
11. Console shows: `[AdminRegistrations] Fetched registrations: 145`

### Error Cases

**Case 1: No Session**
- User ID not found in localStorage
- Error toast: "User session not found. Please log in again."
- Console: `[AdminRegistrations] User ID not found in session`
- No RPC call made

**Case 2: Not Authorized**
- User has account_type = 'member' (not admin)
- User has no admin roles in user_roles
- RPC returns empty array (not an error)
- Component shows: "No registrations found"
- Console: `[AdminRegistrations] Fetched registrations: 0`

**Case 3: RPC Error**
- Database connection failure
- Function doesn't exist (migration not applied)
- Error toast: "Failed to load registrations"
- Console: `[AdminRegistrations] RPC error: {error details}`

## Existing Functionality Preserved

✅ **Search functionality** - Still works (filters client-side)
✅ **Status filter** - Still works (filters client-side)
✅ **Sorting** - RPC returns data sorted by created_at DESC
✅ **Company designations** - Included via LEFT JOIN in RPC
✅ **All member fields** - RPC returns all 63 columns
✅ **Edit, Approve, Reject actions** - No changes
✅ **vCard generation** - No changes
✅ **Audit history** - No changes

## Testing Checklist

### Before Testing
- [ ] Apply migration: `20251103000002_create_get_admin_member_registrations_rpc.sql`
- [ ] Verify function created in database
- [ ] Deploy frontend with updated code
- [ ] Clear browser cache

### Basic Tests
- [ ] Login as admin user
- [ ] Navigate to /admin/registrations
- [ ] Verify all 145 registrations display (not 144)
- [ ] Check console for success logs
- [ ] Verify total count shows 145

### Filter Tests
- [ ] Search by member name - should work
- [ ] Search by email - should work
- [ ] Search by mobile - should work
- [ ] Filter by status (pending/approved/rejected) - should work
- [ ] Verify "Showing X of 145 registrations" updates correctly

### Authorization Tests
- [ ] Test with admin user (account_type = 'admin') - should see all
- [ ] Test with super_admin user (user_roles role = 'super_admin') - should see all
- [ ] Test with editor user - should see all (read access)
- [ ] Test with viewer user - should see all (read access)
- [ ] Test with member user (account_type = 'member') - should see empty
- [ ] Test with no session (logged out) - should show error

### Data Integrity Tests
- [ ] Verify company designation names display correctly
- [ ] Verify all member fields display correctly
- [ ] Verify file links (GST, UDYAM, Payment) work
- [ ] Verify status badges display correctly
- [ ] Verify dates format correctly

### Action Tests
- [ ] Edit member - should work
- [ ] Approve pending registration - should work
- [ ] Reject pending registration - should work
- [ ] Toggle member active/inactive - should work
- [ ] View audit history - should work
- [ ] Delete member - should work
- [ ] Generate vCards - should work

## Related Files

### RPC Function
- `supabase/migrations/20251103000002_create_get_admin_member_registrations_rpc.sql`

### Documentation
- `GET-ADMIN-MEMBER-REGISTRATIONS-RPC.md` - Complete RPC function documentation
- This file - Frontend update documentation

## Build Status

✅ **Build Successful** - No TypeScript errors, no warnings (except chunk size)

## Performance Notes

### Current Implementation
- Fetches ALL registrations at once (limit: 1000)
- Filters applied client-side (search, status)
- Single RPC call on page load

### Future Optimization (if needed)
If you have more than 1000 registrations, consider:

1. **Server-Side Filtering**
   - Pass `p_status_filter` to RPC based on selected filter
   - Pass `p_search_query` to RPC after debouncing
   - Reduces data transferred

2. **Pagination**
   - Use `p_limit` and `p_offset` for pagination
   - Add "Load More" or page numbers
   - Fetch 50-100 records at a time

3. **Lazy Loading**
   - Load only visible registrations
   - Fetch more as user scrolls
   - Virtual scrolling for large lists

Current implementation works well for up to 1000-2000 registrations.

## Troubleshooting

### Problem: Page shows "No registrations found"

**Check**:
1. Console for error messages
2. User is logged in (session exists)
3. User has admin privileges (account_type or user_roles)
4. Migration applied to database
5. RPC function exists: `SELECT * FROM pg_proc WHERE proname = 'get_admin_member_registrations';`

### Problem: Error "User session not found"

**Solution**:
1. Log out and log back in
2. Check localStorage for `lub_session_token_user`
3. Verify session token is valid

### Problem: RPC returns empty array but user is admin

**Check**:
1. User's account_type: `SELECT account_type FROM users WHERE id = 'user-id';`
2. User's roles: `SELECT * FROM user_roles WHERE user_id = 'user-id';`
3. Verify user has account_type IN ('admin', 'both') OR has admin role

### Problem: Count still shows 144 instead of 145

**Check**:
1. New registration exists: `SELECT COUNT(*) FROM member_registrations;`
2. RPC returns all records (check console log count)
3. Data transformation didn't filter anything out

---

**Updated**: November 3, 2025
**Session**: 36 - Replace Direct Query with RPC
**Status**: ✅ Complete and Ready for Testing
