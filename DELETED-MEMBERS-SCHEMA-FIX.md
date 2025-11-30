# Deleted Members Schema Fix - Implementation Guide

## Problem Description

Member deletion was failing with the following error:
```
Could not find the 'first_viewed_at' column of 'deleted_members' in the schema cache
```

This occurred because the `deleted_members` table was missing several columns that exist in the `member_registrations` table. When the `softDeleteMember` function attempted to copy all fields from a member record to the deleted_members archive table, PostgreSQL couldn't find these columns in the schema cache.

## Root Cause

The schema drift happened because:
1. Migration `20251007200000_add_application_review_tracking.sql` added review tracking columns to `member_registrations`
2. Migration `20251005100001_add_profile_photo_url.sql` added the profile photo URL column to `member_registrations`
3. These columns were never added to the `deleted_members` table
4. The `softDeleteMember` function in `src/lib/supabase.ts` uses a spread operator to copy all fields, which requires matching schemas

## Solution Implemented

### 1. Database Migration Created

**File:** `supabase/migrations/20251019120000_add_review_tracking_columns_to_deleted_members.sql`

This migration adds four missing columns to the `deleted_members` table:

| Column Name | Data Type | Nullable | Default | Description |
|------------|-----------|----------|---------|-------------|
| `first_viewed_at` | timestamptz | YES | NULL | Timestamp when admin first viewed the application |
| `first_viewed_by` | uuid | YES | NULL | User ID of admin who first viewed the application |
| `reviewed_count` | integer | NO | 0 | Number of times application was viewed by admins |
| `profile_photo_url` | text | YES | NULL | URL to member's profile photo in Supabase storage |

**Key Features:**
- ✅ Idempotent: Uses `IF NOT EXISTS` checks, safe to run multiple times
- ✅ Documented: Includes comprehensive comments on table and columns
- ✅ Indexed: Creates indexes for efficient querying
- ✅ Consistent: Matches the structure and constraints of `member_registrations`

### 2. TypeScript Interface Updated

**File:** `src/lib/supabase.ts`

The `DeletedMember` interface now includes:
```typescript
export interface DeletedMember {
  // ... existing fields ...
  first_viewed_at?: string | null;
  first_viewed_by?: string | null;
  reviewed_count?: number;
  profile_photo_url?: string | null;
}
```

### 3. Test Script Created

**File:** `test-deleted-members-schema.mjs`

A comprehensive test script that:
- Compares schemas between `member_registrations` and `deleted_members`
- Verifies all required columns are present
- Tests deletion readiness
- Checks for proper indexes
- Provides clear pass/fail reporting

## Manual Steps Required

### Step 1: Apply the Migration

You need to apply the migration to your Supabase database. You can do this in one of two ways:

#### Option A: Using Supabase Dashboard (Recommended)
1. Open your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Open the migration file: `supabase/migrations/20251019120000_add_review_tracking_columns_to_deleted_members.sql`
4. Copy the entire SQL content
5. Paste it into the SQL Editor
6. Click **Run** to execute the migration
7. Verify success in the output panel

#### Option B: Using Supabase CLI (If Available)
```bash
# If you have Supabase CLI installed and configured
supabase db push
```

### Step 2: Verify the Migration

Run the test script to verify the schema is correct:
```bash
node test-deleted-members-schema.mjs
```

Expected output:
```
✅ first_viewed_at: Present in deleted_members
✅ first_viewed_by: Present in deleted_members
✅ reviewed_count: Present in deleted_members
✅ profile_photo_url: Present in deleted_members
✅ All checks passed! Member deletion should work correctly.
```

### Step 3: Test Member Deletion

1. Log into the admin dashboard
2. Navigate to **Admin Registrations** page
3. Select a test member (preferably a test/dummy record)
4. Click the **Delete** action
5. Enter a deletion reason
6. Confirm deletion
7. Verify:
   - No error messages appear
   - Member is removed from registrations list
   - Member appears in **Deleted Members** page with all data intact

## Pages Affected

The following pages interact with member deletion and may be affected:

### 1. **AdminRegistrations** (`src/pages/AdminRegistrations.tsx`)
   - **Primary Impact:** High
   - **What Changed:** Member deletion now works correctly without schema errors
   - **User Action:** Delete member button now functions properly
   - **Testing:** Test deleting members with various field combinations

### 2. **AdminDeletedMembers** (`src/pages/AdminDeletedMembers.tsx`)
   - **Primary Impact:** Medium
   - **What Changed:** Can now display review tracking and profile photo data for deleted members
   - **User Action:** View deleted members list and details
   - **Testing:** Verify deleted members appear correctly with all data

### 3. **ViewApplicationModal** (`src/components/ViewApplicationModal.tsx`)
   - **Primary Impact:** Low (Indirect)
   - **What Changed:** Review tracking data is now preserved when member is deleted
   - **User Action:** View application details before deletion
   - **Testing:** Verify review tracking increments and is preserved after deletion

### 4. **EditMemberModal** (`src/components/EditMemberModal.tsx`)
   - **Primary Impact:** Low (Indirect)
   - **What Changed:** Profile photo data is preserved when member is deleted
   - **User Action:** Edit member profile including photo
   - **Testing:** Verify members with photos can be deleted successfully

## Error Handling

The fix ensures that:

1. **Schema Errors:** Eliminated by matching table structures
2. **Null Values:** Properly handled with nullable columns
3. **Data Integrity:** All member data preserved during deletion
4. **Audit Trail:** Review history maintained in deleted records

If deletion still fails after applying the migration:
1. Check Supabase logs for specific error messages
2. Verify the migration was applied successfully
3. Confirm RLS policies allow deletion operations
4. Run the test script to validate schema alignment

## Prevention for Future Schema Drift

### Recommendations

1. **Automated Schema Sync Check**
   - Add the test script to CI/CD pipeline
   - Run schema comparison before production deployments
   - Alert on schema mismatches between related tables

2. **Migration Checklist**
   - When adding columns to `member_registrations`, always add to `deleted_members`
   - When adding columns to `deleted_members`, document the reason
   - Review `softDeleteMember` function when schema changes occur

3. **Database Function Alternative (Future Enhancement)**
   Consider creating a database function that:
   ```sql
   CREATE OR REPLACE FUNCTION soft_delete_member(member_id uuid, reason text)
   RETURNS void AS $$
   BEGIN
     -- Automatically handles all fields without explicit listing
   END;
   $$ LANGUAGE plpgsql;
   ```

4. **Documentation**
   - Keep this file updated when schema changes occur
   - Document all columns added to either table
   - Maintain list of dependent tables/functions

## Testing Checklist

- [x] Migration file created and documented
- [x] TypeScript interfaces updated
- [x] Test script created
- [ ] Migration applied to database (Manual step - requires Supabase dashboard access)
- [ ] Test script executed successfully
- [ ] Member deletion tested in UI
- [ ] Deleted member data verified in AdminDeletedMembers page
- [ ] Profile photos preserved during deletion
- [ ] Review tracking data preserved during deletion
- [ ] Build process completes without errors

## Related Files

- `supabase/migrations/20251019120000_add_review_tracking_columns_to_deleted_members.sql` - Migration file
- `src/lib/supabase.ts` - DeletedMember interface and softDeleteMember function
- `src/pages/AdminRegistrations.tsx` - Member deletion UI
- `src/pages/AdminDeletedMembers.tsx` - Deleted members view
- `test-deleted-members-schema.mjs` - Schema verification script

## Rollback Plan

If issues occur after applying the migration:

```sql
-- Remove the added columns (only if absolutely necessary)
ALTER TABLE deleted_members DROP COLUMN IF EXISTS first_viewed_at;
ALTER TABLE deleted_members DROP COLUMN IF EXISTS first_viewed_by;
ALTER TABLE deleted_members DROP COLUMN IF EXISTS reviewed_count;
ALTER TABLE deleted_members DROP COLUMN IF EXISTS profile_photo_url;

-- Remove the indexes
DROP INDEX IF EXISTS idx_deleted_members_first_viewed_at;
DROP INDEX IF EXISTS idx_deleted_members_reviewed_status;
```

**Note:** Rollback is generally not recommended unless there are critical issues, as it will cause deletion operations to fail again.

## Support

If you encounter issues:
1. Check the Supabase dashboard logs
2. Run the test script for detailed diagnostics
3. Verify your user has proper permissions
4. Review this documentation for manual steps

## Changelog

### 2025-10-19 - Initial Fix
- Added four missing columns to deleted_members table
- Updated TypeScript interfaces
- Created comprehensive test script
- Documented all changes and manual steps
