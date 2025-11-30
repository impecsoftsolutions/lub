# Admin Member Registrations RPC Function - Implementation Complete

## Summary

Created `get_admin_member_registrations` RPC function to allow admins to fetch all member registrations, bypassing broken RLS policies.

## Migration File

**File**: `supabase/migrations/20251103000002_create_get_admin_member_registrations_rpc.sql`

## Function Details

### Function Signature

```sql
get_admin_member_registrations(
  p_requesting_user_id uuid,
  p_status_filter text DEFAULT NULL,
  p_search_query text DEFAULT NULL,
  p_state_filter text DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (63 columns)
```

### Authorization Logic

**Dual Check** (both methods are tried):

1. **account_type Check**: `account_type IN ('admin', 'both')`
   - CRITICAL: Does NOT check for 'super_admin' (not a valid account_type value)

2. **user_roles Check**: `role IN ('super_admin', 'admin', 'editor', 'viewer')`
   - Includes 'viewer' role for read-only access

### Key Features

✅ **SECURITY DEFINER** - Bypasses RLS policies
✅ **Dual Authorization** - Checks both account_type and user_roles
✅ **63 Columns Returned** - Complete member registration data
✅ **LEFT JOIN** - Includes company_designation_name from company_designations table
✅ **Optional Filters**:
  - Status filter (pending/approved/rejected)
  - State filter
  - Search query (searches name, company, email, mobile)
✅ **Pagination** - LIMIT and OFFSET support
✅ **Safe Failure** - Returns empty result set if not authorized (no error)

### Columns Returned (63 total)

**Personal Information**:
- id, full_name, gender, date_of_birth, email, mobile_number

**Company Information**:
- company_name, designation, company_designation_id, company_designation_name
- company_address, city, other_city_name, is_custom_city, district, state, pin_code

**Business Details**:
- industry, activity_type, constitution, annual_turnover, number_of_employees
- products_services, brand_names, website

**Registration Details**:
- gst_registered, gst_number, pan_company, esic_registered, epf_registered

**File URLs**:
- gst_certificate_url, udyam_certificate_url, payment_proof_url, profile_photo_url

**Payment Information**:
- referred_by, amount_paid, payment_date, payment_mode, transaction_id, bank_reference

**Alternate Contact**:
- alternate_contact_name, alternate_mobile

**Member Management**:
- member_id, is_active, deactivated_at, deactivated_by

**Application Status**:
- status, is_legacy_member, reapplication_count, approval_date, rejection_reason

**Foreign Keys**:
- user_id

**Audit Tracking**:
- last_modified_by, last_modified_at, first_viewed_at, first_viewed_by, reviewed_count

**Metadata**:
- submission_id, created_at, updated_at

## Usage Examples

### Get All Pending Registrations

```javascript
const { data, error } = await supabase.rpc('get_admin_member_registrations', {
  p_requesting_user_id: currentUser.id,
  p_status_filter: 'pending',
  p_search_query: null,
  p_state_filter: null,
  p_limit: 50,
  p_offset: 0
});
```

### Search for Members in Karnataka

```javascript
const { data, error } = await supabase.rpc('get_admin_member_registrations', {
  p_requesting_user_id: currentUser.id,
  p_status_filter: null,
  p_search_query: 'company',
  p_state_filter: 'Karnataka',
  p_limit: 100,
  p_offset: 0
});
```

### Get All Approved Members (Paginated)

```javascript
const { data, error } = await supabase.rpc('get_admin_member_registrations', {
  p_requesting_user_id: currentUser.id,
  p_status_filter: 'approved',
  p_search_query: null,
  p_state_filter: null,
  p_limit: 100,
  p_offset: page * 100  // For pagination
});
```

## Security Features

1. ✅ **User Authentication** - Verifies user exists and is active
2. ✅ **Dual Authorization** - Checks account_type AND user_roles
3. ✅ **Role-Based Access** - Supports super_admin, admin, editor, viewer
4. ✅ **Input Validation** - Handles NULL parameters safely
5. ✅ **Search Path Protection** - `SET search_path = public`
6. ✅ **No Error Leakage** - Returns empty set on auth failure

## Important Notes

### account_type Values (Valid)
- `'admin'` - Admin-only access
- `'member'` - Member-only access
- `'both'` - Admin + Member access
- `'general_user'` - Registered but not approved

### user_roles Values (Valid)
- `'super_admin'` - Full system access
- `'admin'` - Full member management
- `'editor'` - View and edit capabilities
- `'viewer'` - Read-only access

### CRITICAL: account_type ≠ super_admin

**DO NOT** check for `account_type = 'super_admin'` - it is NOT a valid value!

The function correctly checks:
- account_type IN ('admin', 'both') ✅
- user_roles for 'super_admin' role ✅

## Next Steps

### 1. Update Frontend Components

Replace direct Supabase queries with RPC calls in:
- `src/pages/AdminRegistrations.tsx`
- `src/pages/AdminDashboard.tsx`
- Any other admin pages querying member_registrations

### 2. Example Frontend Update

**Before** (BROKEN - blocked by RLS):
```typescript
const { data, error } = await supabase
  .from('member_registrations')
  .select('*')
  .eq('status', 'pending');
```

**After** (WORKS - bypasses RLS):
```typescript
const { data, error } = await supabase.rpc('get_admin_member_registrations', {
  p_requesting_user_id: currentUser.id,
  p_status_filter: 'pending',
  p_search_query: null,
  p_state_filter: null,
  p_limit: 100,
  p_offset: 0
});
```

### 3. Test Scenarios

- [ ] Test with admin user (account_type = 'admin')
- [ ] Test with super_admin user (user_roles role = 'super_admin')
- [ ] Test with editor user
- [ ] Test with viewer user (should work for SELECT)
- [ ] Test with member user (should return empty set)
- [ ] Test status filter (pending/approved/rejected)
- [ ] Test state filter
- [ ] Test search query
- [ ] Test pagination (limit/offset)
- [ ] Verify company_designation_name is populated from JOIN

### 4. Related RPC Functions

You now have TWO admin RPC functions:
1. `get_admin_member_registrations` - SELECT (this one)
2. `update_member_registration` - UPDATE (existing)
3. `submit_member_registration` - INSERT (existing, for new members)

## Build Status

✅ **Build Successful** - No errors, no warnings (except chunk size)

## Files Changed

1. **Created**: `supabase/migrations/20251103000002_create_get_admin_member_registrations_rpc.sql`
2. **Documentation**: This file

## Migration Status

⏳ **Ready to Apply** - Migration file created but not yet applied to database

To apply this migration:
1. Use Supabase Dashboard SQL Editor
2. Copy migration file contents
3. Execute in SQL Editor
4. Verify function created: `SELECT * FROM pg_proc WHERE proname = 'get_admin_member_registrations';`

---

**Implementation Date**: November 3, 2025
**Session**: 36 - Complete RPC Architecture for Admin Member Registrations
**Status**: ✅ Complete and Ready for Testing
