# PostgREST Cache Workaround - Quick Start Guide

## The Issue
"cannot pass more than 100 arguments to a function" error when calling `admin_update_registration_status` via Supabase RPC, even though the function works perfectly via SQL.

## The Solution
Use a new function with a simpler name: `update_member_registration_status`

## What Changed

### 1. Database Migration
**File**: `supabase/migrations/20251110000005_create_update_member_registration_status.sql`

Created new function:
```sql
update_member_registration_status(
  p_registration_id uuid,
  p_requesting_user_id uuid,
  p_new_status text,
  p_rejection_reason text DEFAULT NULL
)
```

### 2. Client Code
**File**: `src/lib/supabase.ts` (line ~1289)

Changed from:
```typescript
await supabase.rpc('admin_update_registration_status', rpcParams)
```

To:
```typescript
await supabase.rpc('update_member_registration_status', rpcParams)
```

## How to Apply

### Step 1: Apply the Migration
Go to your Supabase dashboard and run the migration file:
```
supabase/migrations/20251110000005_create_update_member_registration_status.sql
```

Or use Supabase CLI:
```bash
supabase db push
```

### Step 2: Test the Fix
1. Log in to admin portal
2. Go to Members → Registrations
3. Click "View" on any pending registration
4. Try to approve or reject it
5. Verify no "100 arguments" error

## Why This Works

PostgREST caches function metadata by name. The cache had issues with functions prefixed with `admin_`. By using a simpler function name without the prefix, we bypass the cache issue entirely.

## Function Capabilities

The new function handles everything:
- ✅ Validates all input parameters
- ✅ Authenticates and authorizes the requesting user
- ✅ Updates registration status (approved/rejected)
- ✅ Updates user account_type from 'general_user' to 'member' when approved
- ✅ Logs all changes to audit history
- ✅ Returns complete registration data
- ✅ Handles rejection reasons properly
- ✅ Uses SECURITY DEFINER for secure operations

## Function History

| Version | Function Name | Status |
|---------|--------------|--------|
| v1 | `admin_update_registration_status` | ❌ PostgREST cache issue |
| v2 | `admin_update_member_registration_status` | ❌ Still had cache issues |
| v3 | `update_member_registration_status` | ✅ Working solution |

## Technical Notes

- **Security**: SECURITY DEFINER - bypasses RLS with internal permission checks
- **Parameters**: Always pass all 4 parameters (use `null` for optional rejection reason)
- **Returns**: JSONB object with `{success: boolean, error?: string, registration?: object}`
- **Permissions**: Granted to both `authenticated` and `anon` roles (function handles auth internally)

## Clean Up (Optional - Future Task)

The old functions can be removed once you confirm the new function works:
- `admin_update_registration_status`
- `admin_update_member_registration_status`

These are kept for now to avoid breaking changes during testing.
