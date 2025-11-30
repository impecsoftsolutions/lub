# Super Admin Setup for yogish@gmail.com

## What Was Done

✅ Created migration file: `supabase/migrations/20251017163000_add_yogish_super_admin.sql`

This migration adds `yogish@gmail.com` to the `portal_super_admins` table, which grants super admin privileges.

## Next Steps

### Option 1: Apply Migration via Supabase Dashboard (RECOMMENDED)

1. **Go to your Supabase SQL Editor:**
   - URL: https://supabase.com/dashboard/project/qskziirjtzomrtckpzas/sql/new

2. **Copy and paste this SQL:**

```sql
-- Add yogish@gmail.com to portal_super_admins table
INSERT INTO portal_super_admins (email)
VALUES ('yogish@gmail.com')
ON CONFLICT (email) DO NOTHING;

-- If the user already exists in auth.users, add their role
DO $$
DECLARE
    admin_user_id uuid;
BEGIN
    -- Check if user exists in auth.users
    SELECT id INTO admin_user_id
    FROM auth.users
    WHERE email = 'yogish@gmail.com';

    -- If user exists, add their super_admin role
    IF admin_user_id IS NOT NULL THEN
        INSERT INTO user_roles (user_id, role, state, district, is_member_linked)
        VALUES (admin_user_id, 'super_admin', NULL, NULL, false)
        ON CONFLICT (user_id, role, COALESCE(state, ''), COALESCE(district, ''))
        DO NOTHING;

        RAISE NOTICE 'Super admin role assigned to existing user: %', admin_user_id;
    ELSE
        RAISE NOTICE 'User yogish@gmail.com will get super admin access when they sign up';
    END IF;
END $$;
```

3. **Click "Run" to execute the SQL**

4. **Verify the setup:**

```sql
-- Check if email was added to portal_super_admins
SELECT * FROM portal_super_admins WHERE email = 'yogish@gmail.com';
```

### Option 2: Create User Account in Supabase Dashboard

Since the email is now in the super admin list, you need to create the actual user account:

1. **Go to Supabase Authentication:**
   - URL: https://supabase.com/dashboard/project/qskziirjtzomrtckpzas/auth/users

2. **Click "Add User" → "Create new user"**

3. **Fill in the details:**
   - Email: `yogish@gmail.com`
   - Password: (choose a secure password - save it somewhere safe!)
   - ✅ Check "Auto Confirm User" (important!)

4. **Click "Create User"**

### Option 3: Sign Up Through the Application

If your application has a signup page at `/admin/signup`:

1. Visit the signup page
2. Enter:
   - Email: `yogish@gmail.com`
   - Password: (choose a secure password)
3. Complete the signup process

## Verification

Once the user is created, verify super admin access:

1. **Check portal_super_admins table:**
```sql
SELECT * FROM portal_super_admins WHERE email = 'yogish@gmail.com';
```

2. **Check user_roles table (after user is created):**
```sql
SELECT ur.*, au.email
FROM user_roles ur
JOIN auth.users au ON ur.user_id = au.id
WHERE au.email = 'yogish@gmail.com';
```

## Login

Once the user account is created:

1. Go to: `/admin/login`
2. Enter:
   - Email: `yogish@gmail.com`
   - Password: (the password you set)
3. You should now have full super admin access!

## Current Super Admins

After applying the migration, these emails will have super admin access:

1. `admin@lub.org.in` (original super admin)
2. `yogish@gmail.com` (new super admin)

## Security Notes

- The email `yogish@gmail.com` is now whitelisted in the `portal_super_admins` table
- This means anyone who signs up with this email will automatically get super admin privileges
- Make sure this is a real email address you control
- Use a strong password for the account
- Consider enabling 2FA in Supabase for additional security

## Troubleshooting

**If login doesn't work:**

1. Verify the user exists in Supabase Dashboard → Authentication → Users
2. Check if the user is confirmed (email_confirmed_at should have a timestamp)
3. Verify the email is in portal_super_admins table
4. Check browser console for any errors

**If super admin features don't work:**

1. Log out and log back in
2. Check the user_roles table to ensure the role was added
3. Verify the email matches exactly (no extra spaces)

## Files Created

- `/supabase/migrations/20251017163000_add_yogish_super_admin.sql` - Migration file
- `/create-super-admin.mjs` - Helper script (not needed if using SQL directly)
- This documentation file

---

**Status:** ✅ Migration file created and ready to apply
**Next Action:** Apply the SQL via Supabase Dashboard SQL Editor
