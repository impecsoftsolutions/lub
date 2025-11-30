# View Application Modal RLS Fix - Session 36

## Problem Identified

The ViewApplicationModal was showing "Application not found" error when attempting to view pending member registrations in the Admin Registrations page.

### Root Cause

The `getApplicationDetails` method in `src/lib/supabase.ts` was using a direct Supabase query with RLS policies:

```typescript
const { data, error } = await supabase
  .from('member_registrations')
  .select(`*, company_designations(designation_name)`)
  .eq('id', applicationId)
  .maybeSingle();
```

**Why it failed:**
- Custom authentication system uses localStorage tokens, NOT Supabase Auth
- `auth.jwt()` and `auth.uid()` always return NULL
- RLS policies using `current_user_id()` fail because session is never set
- Direct SELECT queries are blocked by RLS policies
- Result: Empty data returned, triggering "Application not found"

## Solution Implemented

### 1. Created New RPC Function

**File:** `supabase/migrations/20251103000003_create_get_admin_member_registration_by_id_rpc.sql`

**Function:** `get_admin_member_registration_by_id(p_requesting_user_id, p_registration_id)`

**Features:**
- Uses `SECURITY DEFINER` to bypass RLS
- Reuses existing `admin_member_registration_type` composite type
- Validates user authentication and authorization
- Dual authorization check: `account_type IN ('admin', 'both')` OR `user_roles`
- Includes 'viewer' role for read-only access
- LEFT JOIN to `company_designations` for designation name
- Returns `SETOF` (empty set if not authorized or not found)
- Same security measures as `get_admin_member_registrations`

### 2. Updated Service Method

**File:** `src/lib/supabase.ts`

**Method:** `getApplicationDetails(applicationId)`

**Changes:**
1. Gets current user ID from localStorage (`lub_session_token_user`)
2. Calls RPC function: `get_admin_member_registration_by_id`
3. Passes requesting user ID and registration ID
4. Handles SETOF response (takes first array item)
5. Transforms flat data structure to nested format:
   ```typescript
   company_designations: registration.company_designation_name
     ? { designation_name: registration.company_designation_name }
     : null
   ```
6. Added comprehensive logging for debugging

## Files Modified

### New Migration
- `supabase/migrations/20251103000003_create_get_admin_member_registration_by_id_rpc.sql`

### Updated Files
- `src/lib/supabase.ts` - Updated `getApplicationDetails` method

## Data Transformation

The RPC function returns flat data with `company_designation_name`, but ViewApplicationModal expects nested structure:

**RPC Returns:**
```typescript
{
  company_designation_id: 'uuid',
  company_designation_name: 'Owner'  // Flat field
}
```

**Transformed To:**
```typescript
{
  company_designation_id: 'uuid',
  company_designations: {           // Nested object
    designation_name: 'Owner'
  }
}
```

This matches the pattern used in `AdminRegistrations.tsx` loadRegistrations method.

## Authorization Logic

Same as list function:

1. **Account Type Check:** `account_type IN ('admin', 'both')`
2. **User Roles Check:** `role IN ('super_admin', 'admin', 'editor', 'viewer')`
3. Returns empty set if not authorized (no error leakage)

## Testing Checklist

- [ ] Admin can view pending registration details
- [ ] Modal displays all application fields correctly
- [ ] Designation field shows properly (or "Not provided" if NULL)
- [ ] Documents section displays uploaded files
- [ ] Edit button works from view modal
- [ ] Approve/Reject buttons work from view modal
- [ ] View count increments properly
- [ ] Console logs show successful RPC calls
- [ ] No "Application not found" errors
- [ ] Build completes successfully ✓

## Build Status

✅ Build successful
- No TypeScript errors
- No compilation errors
- All imports resolved correctly

## Security Notes

- Function uses `SECURITY DEFINER` - executes with creator's privileges
- Validates user is active before proceeding
- Checks permissions before returning data
- Returns empty set on auth failure (prevents error information leakage)
- `SET search_path = public` prevents SQL injection
- Same security measures as the list RPC function

## Next Steps

1. Test the View Details functionality in the Admin Registrations page
2. Verify that pending applications display correctly
3. Confirm designation field shows properly for all cases
4. Test with registrations that have NULL company_designation_id

## Related Documentation

- Session 35: Original implementation of `get_admin_member_registrations` RPC
- Migration: `20251103000002_create_get_admin_member_registrations_rpc.sql`
- Issue: Direct queries blocked by RLS with custom auth system
