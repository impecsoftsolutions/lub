# Database Checkpoint: user_roles Foreign Key

## Verified State (as of 26-Sep-2025)

- Constraint Name: user_roles_user_id_fkey
- Table: public.user_roles
- Column: user_id
- References: auth.users(id)
- Behavior: ON DELETE CASCADE
- Status: ✅ Verified working
- API Expansion: Works with `user:user_id(email)` in Supabase queries

## Why This Matters
- This foreign key enables Admin User Management to display user emails correctly.
- Duplicate migrations previously caused 42710 errors by re-adding the same constraint.
- Problem solved by deleting redundant migration: `supabase/migrations/99999999_fix_user_roles_fk.sql`.

## Do Not Do
- Do not create another migration that re-adds this constraint.
- Do not rename the constraint unless absolutely necessary.
- Do not point the foreign key to a different table (must always be `auth.users(id)`).

## What To Do Instead
- If the foreign key ever needs to be changed, drop it explicitly and recreate with a new migration.
- Always check constraints with:

```sql
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.user_roles'::regclass
  AND conname = 'user_roles_user_id_fkey';
```

## Verification Commands

### Check API Expansion
```bash
# Test the API expansion that depends on this foreign key
curl -X GET "https://your-project.supabase.co/rest/v1/user_roles?select=*,user:user_id(email)" \
  -H "apikey: your-anon-key" \
  -H "Authorization: Bearer your-jwt-token"
```

### Check All user_roles Constraints
```sql
SELECT conname, contype, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.user_roles'::regclass
ORDER BY contype, conname;
```

## Expected Results
- Primary key: `user_roles_pkey`
- Foreign key: `user_roles_user_id_fkey`
- Unique constraint: `unique_user_role_scope`
- Check constraint: `valid_roles`

## Last Verified
- Date: 26-Sep-2025
- By: System verification after cleanup
- Admin Panel: ✅ Working with user emails displayed
- API Expansion: ✅ Working correctly