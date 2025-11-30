# Account Type Update Implementation

## Summary
Updated the member approval process to automatically change a user's account_type from 'general_user' to 'member' when their membership application is approved.

## Problem
When users register for membership through the Join form:
1. A user account is created with `account_type: 'general_user'`
2. A membership application is submitted with `status: 'pending'`
3. When admin approves the application, only the `status` was updated to 'approved'
4. The user's `account_type` remained as 'general_user' instead of being upgraded to 'member'

This prevented approved members from accessing member-only features.

## Solution

### 1. Database Migration
**File**: `supabase/migrations/20251028000001_add_general_user_account_type.sql`

- Updated the CHECK constraint on `users.account_type` to include 'general_user'
- Valid account_type values are now:
  - `'admin'`: Admin-only access
  - `'member'`: Member-only access
  - `'both'`: Both admin and member access
  - `'general_user'`: Registered but not yet approved (temporary state)

### 2. Approval Handler Update
**File**: `src/pages/AdminRegistrations.tsx`

Modified the `handleStatusUpdate` function (lines 195-211) to:
1. Check if the status is being changed to 'approved' and user_id exists
2. Update the users table to set `account_type='member'`
3. Only update users where current `account_type='general_user'`
4. Log the account type update for debugging
5. Handle errors gracefully without failing the approval process

```typescript
if (newStatus === 'approved' && registrationData.user_id) {
  try {
    const { error: accountTypeError } = await supabase
      .from('users')
      .update({ account_type: 'member', updated_at: new Date().toISOString() })
      .eq('id', registrationData.user_id)
      .eq('account_type', 'general_user');

    if (accountTypeError) {
      console.error('Error updating account type:', accountTypeError);
    } else {
      console.log('Successfully updated account type from general_user to member for user:', registrationData.user_id);
    }
  } catch (accountTypeUpdateError) {
    console.error('Failed to update account type:', accountTypeUpdateError);
  }
}
```

## User Flow After Changes

1. **Registration**: User creates account → `account_type: 'general_user'`
2. **Application**: User submits membership form → `status: 'pending'`
3. **Approval**: Admin approves application → `status: 'approved'` AND `account_type: 'member'`
4. **Access**: Member can now access member-only features

## Edge Cases Handled

1. **User ID Missing**: If `registrationData.user_id` is null/undefined, the account type update is skipped
2. **Wrong Account Type**: The update only affects users with `account_type='general_user'`, preventing accidental downgrades of admin accounts
3. **Update Failure**: If the account type update fails, it's logged but doesn't prevent the approval from completing
4. **Rejection Flow**: Rejected applications don't trigger account type changes - users remain as 'general_user' and can reapply

## Testing Checklist

- [ ] New user registers → verify account_type is 'general_user'
- [ ] Admin approves member → verify account_type changes to 'member'
- [ ] Approved member can log in and access member features
- [ ] Admin rejects application → verify account_type stays 'general_user'
- [ ] Admin approves already-approved member → verify account_type doesn't change unnecessarily
- [ ] Admin user approvals don't affect admin account_type

## Technical Details

### Database Query
The update uses two conditions to ensure safety:
- `.eq('id', registrationData.user_id)` - Target the specific user
- `.eq('account_type', 'general_user')` - Only update if currently 'general_user'

This prevents:
- Downgrading admin accounts to member
- Changing 'both' accounts to member-only
- Multiple unnecessary updates

### Error Handling
The account type update is wrapped in try-catch and:
- Logs errors to console for debugging
- Does not throw or fail the approval process
- Continues to send welcome email even if account type update fails

## Files Modified

1. `src/pages/AdminRegistrations.tsx` - Added account type update logic
2. `supabase/migrations/20251028000001_add_general_user_account_type.sql` - Updated database constraint

## Build Status

✅ Project builds successfully with no errors
