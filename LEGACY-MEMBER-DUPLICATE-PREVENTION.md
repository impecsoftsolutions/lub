# Legacy Member System - Duplicate Prevention Implementation

## Overview

This document describes the implementation of the legacy member system that allows existing imported members to maintain duplicate emails and mobile numbers while enforcing uniqueness for all new registrations.

## Problem Statement

- **144 existing members** were imported from the old system
- Some of these imported members have duplicate mobile numbers and/or emails
- We need to keep these existing members as-is
- New members joining through the website must have unique mobile numbers and emails

## Solution: Partial Unique Indexes

We implemented PostgreSQL **partial unique indexes** that enforce uniqueness constraints only on non-legacy members.

### How It Works

1. **is_legacy_member Column**: A new boolean column added to both `member_registrations` and `deleted_members` tables
   - Default: `false` (new registrations are not legacy members)
   - Set to `true` for all 144 existing members

2. **Partial Unique Indexes**: Special database indexes that include a WHERE clause
   - Only index rows where `is_legacy_member = false`
   - Legacy members (is_legacy_member = true) are excluded from the index
   - This allows duplicates for legacy members but prevents them for new members

3. **Database-Level Enforcement**: Constraints are enforced at the PostgreSQL level
   - Works regardless of how data is inserted (app, admin panel, direct SQL)
   - Cannot be bypassed by application bugs
   - Provides the strongest guarantee of data integrity

## Database Migrations

Four migrations were created to implement this system:

### 1. `20251019130000_add_is_legacy_member_to_member_registrations.sql`
- Adds `is_legacy_member` column to `member_registrations` table
- Default value: `false`
- Creates index for efficient queries

### 2. `20251019130001_add_is_legacy_member_to_deleted_members.sql`
- Adds `is_legacy_member` column to `deleted_members` table
- Maintains consistency with active members table
- Preserves legacy status during soft delete operations

### 3. `20251019130002_mark_existing_members_as_legacy.sql`
- Marks all members created before migration as legacy
- Uses migration execution timestamp as cutoff
- Approximately 144 members marked as legacy

### 4. `20251019130003_replace_unique_constraints_with_partial_indexes.sql`
- Drops existing `unique_email` and `unique_mobile` constraints
- Creates partial unique index on email (only for is_legacy_member = false)
- Creates partial unique index on mobile_number (only for is_legacy_member = false)
- Adds comments explaining the indexes

## Backend Changes

### New Helper Functions in `memberRegistrationService`

```typescript
// Check if email is already registered (non-legacy members only)
async checkEmailDuplicate(email: string, excludeMemberId?: string)

// Check if mobile number is already registered (non-legacy members only)
async checkMobileDuplicate(mobileNumber: string, excludeMemberId?: string)
```

### Updated Functions

**submitRegistration**:
- Explicitly sets `is_legacy_member = false` for new registrations
- Detects unique constraint violations and returns user-friendly error messages

**updateMemberRegistration**:
- Prevents `is_legacy_member` from being modified during updates
- Preserves legacy status regardless of update data

## Frontend Changes

### Join Page (Registration Form)

**Real-time Duplicate Validation**:
- Email field: Checks for duplicates on blur event
- Mobile number field: Checks for duplicates on blur event
- Only checks against non-legacy members (is_legacy_member = false)

**Error Messages**:
- Email: "This email address is already registered. You can either sign in to your account or register with a different email address."
- Mobile: "This mobile number is already registered. You can either sign in to your account or register with a different mobile number."

### EditMemberModal

- Does not expose `is_legacy_member` field to users
- Backend automatically prevents modification of legacy status
- Legacy members can be edited without affecting their legacy status

## Testing

### Test Script: `test-legacy-member-system.mjs`

Run this script to verify the implementation:

```bash
node test-legacy-member-system.mjs
```

The script tests:
1. ✅ is_legacy_member column exists in both tables
2. ✅ Counts legacy vs non-legacy members (~144 expected)
3. ✅ Legacy members can have duplicate emails (if any exist)
4. ✅ Legacy members can have duplicate mobile numbers (if any exist)
5. ✅ Partial unique indexes are created
6. ✅ deleted_members table has is_legacy_member column

### Manual Testing Steps

1. **Test Legacy Member Preservation**:
   - Edit an existing legacy member
   - Verify their is_legacy_member status remains true
   - Confirm they can still be edited successfully

2. **Test New Member Registration**:
   - Try to register with an email that exists (non-legacy)
   - Should see error: "This email address is already registered..."
   - Try to register with a mobile that exists (non-legacy)
   - Should see error: "This mobile number is already registered..."

3. **Test Real-time Validation**:
   - Open the registration form
   - Enter an existing email and tab out (blur)
   - Should see error message immediately
   - Same for mobile number field

## Pages Affected

The following pages may need to be aware of the legacy member system:

### Core Pages
- ✅ **Join.tsx** - Registration form with duplicate validation
- ✅ **EditMemberModal.tsx** - Member editing (preserves legacy status)

### Admin Pages (Display Only)
- **AdminRegistrations.tsx** - Could show legacy status in member list
- **AdminDeletedMembers.tsx** - Could show legacy status for deleted members
- **Directory.tsx** - No changes needed (displays all approved members)
- **MemberProfile.tsx** - No changes needed (displays member details)

### Files Modified
- ✅ `src/lib/supabase.ts` - Added helper functions and updated services
- ✅ `src/pages/Join.tsx` - Added duplicate validation
- ✅ `src/components/EditMemberModal.tsx` - Already compatible (no changes needed)

## Benefits of This Approach

1. **Data Integrity**: Database-level enforcement cannot be bypassed
2. **Backward Compatibility**: Existing members preserved exactly as imported
3. **Forward Protection**: All new registrations must have unique email/mobile
4. **Audit Trail**: Legacy status preserved in deleted_members table
5. **User Experience**: Clear, helpful error messages for duplicates
6. **Performance**: Partial indexes are efficient and don't slow down queries
7. **Maintainability**: Self-documenting with clear comments in migrations

## Technical Details

### Partial Index Syntax

```sql
-- Email uniqueness for non-legacy members only
CREATE UNIQUE INDEX idx_member_registrations_email_unique_non_legacy
ON member_registrations(email)
WHERE is_legacy_member = false;

-- Mobile uniqueness for non-legacy members only
CREATE UNIQUE INDEX idx_member_registrations_mobile_unique_non_legacy
ON member_registrations(mobile_number)
WHERE is_legacy_member = false;
```

### How PostgreSQL Handles This

- When inserting a new member (is_legacy_member = false):
  - PostgreSQL checks the partial index
  - If email or mobile already exists (in non-legacy members), insertion fails
  - Error is caught and converted to user-friendly message

- When inserting/updating a legacy member (is_legacy_member = true):
  - Row is not included in the partial index
  - No uniqueness check is performed
  - Duplicate emails/mobiles are allowed

## Security Considerations

- `is_legacy_member` flag cannot be modified through normal update operations
- Only super admins should be able to manually change legacy status (if needed)
- Frontend validation provides good UX, backend enforcement provides security
- Database constraints are the ultimate safeguard

## Future Enhancements

If needed in the future, you could:

1. **Admin UI Enhancement**: Add visual indicators for legacy members
2. **Reporting**: Track how many duplicates exist among legacy members
3. **Data Cleanup**: Eventually consolidate duplicate legacy members if needed
4. **Bulk Import**: Automatically set is_legacy_member = true for future imports

## Rollback Plan

If you need to rollback these changes:

1. Drop the partial indexes
2. Re-add the original unique constraints (if desired)
3. Drop the is_legacy_member columns

Note: This would require resolving any duplicate emails/mobiles first.

## Summary

The legacy member system is fully implemented and ready for use. All 144 existing members will maintain their current data (including any duplicates), while all new registrations through the website must have unique email addresses and mobile numbers. The system enforces this at both the database and application levels for maximum security and reliability.
