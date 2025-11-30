# Password Reset Fix - Deployment Checklist

## Pre-Deployment Verification

### 1. Code Review
- [x] Migration file created: `supabase/migrations/20251020120000_enable_password_reset_with_rls.sql`
- [x] Code updated: `src/lib/passwordReset.ts`
- [x] Documentation created: `PASSWORD-RESET-FIX-SUMMARY.md`
- [x] Test script created: `test-password-reset-functions.sql`

### 2. Build Verification
- [ ] Run `npm run build` - Ensure project builds without errors
- [ ] Check for TypeScript errors
- [ ] Check for linting errors

## Deployment Steps

### Step 1: Backup Current Database (IMPORTANT!)
```sql
-- Create a backup of critical tables before migration
-- Run this in Supabase SQL Editor

-- Backup users table structure
CREATE TABLE IF NOT EXISTS users_backup_20251020 AS
SELECT * FROM users;

-- Backup auth_sessions
CREATE TABLE IF NOT EXISTS auth_sessions_backup_20251020 AS
SELECT * FROM auth_sessions;

-- Backup password_reset_tokens
CREATE TABLE IF NOT EXISTS password_reset_tokens_backup_20251020 AS
SELECT * FROM password_reset_tokens;
```

### Step 2: Apply Migration
The migration will be automatically applied by Supabase when you deploy.

Verify the migration was applied:
```bash
# Check migration status in Supabase Dashboard
# Navigate to: Database > Migrations
# Confirm: 20251020120000_enable_password_reset_with_rls.sql is applied
```

### Step 3: Verify Database Changes

Run the verification queries from `test-password-reset-functions.sql`:

```sql
-- 1. Check RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename IN ('users', 'auth_sessions', 'password_reset_tokens');
-- Expected: All should have rowsecurity = true

-- 2. Check functions exist
SELECT proname FROM pg_proc
WHERE proname IN (
  'lookup_user_for_password_reset',
  'validate_password_reset_token',
  'reset_user_password'
);
-- Expected: All 3 functions returned

-- 3. Check policies exist
SELECT tablename, count(*) as policy_count
FROM pg_policies
WHERE tablename IN ('users', 'auth_sessions', 'password_reset_tokens')
GROUP BY tablename;
-- Expected: Multiple policies for each table
```

### Step 4: Test Password Reset Flow

#### Test 1: Request Password Reset
1. Navigate to the forgot password page
2. Enter a valid email address
3. Click "Send Reset Link"
4. Verify: Success message appears
5. Check email inbox for reset link

#### Test 2: Validate Reset Token
1. Click the reset link from email
2. Verify: Redirected to reset password page
3. Verify: No error messages about invalid token

#### Test 3: Reset Password
1. Enter a new password (must meet requirements)
2. Confirm password
3. Click "Reset Password"
4. Verify: Success message appears
5. Verify: Redirected to login page

#### Test 4: Sign In with New Password
1. Enter email and new password
2. Click "Sign In"
3. Verify: Successfully logged in
4. Verify: Redirected to dashboard

#### Test 5: Token Reuse Prevention
1. Try to use the same reset link again
2. Verify: Error message "This reset link has already been used"

#### Test 6: Token Expiration (Optional)
1. Create a reset token manually with expired time
2. Try to use the expired token
3. Verify: Error message about expired token

### Step 5: Security Verification

#### Test 7: User Enumeration Prevention
1. Request password reset with non-existent email
2. Verify: Still shows success message (no indication user doesn't exist)

#### Test 8: Data Privacy
1. Test database functions directly in SQL editor
2. Verify: `lookup_user_for_password_reset` does NOT return password_hash
3. Verify: Only returns: user_id, email, mobile_number, account_type, account_status

#### Test 9: RLS Policy Enforcement
```sql
-- Test as unauthenticated user
-- This should fail (return no rows)
SELECT * FROM users WHERE email = 'test@example.com';

-- This should succeed
SELECT * FROM lookup_user_for_password_reset('test@example.com');
```

### Step 6: Monitoring Setup

#### Enable Logging
1. Check Supabase logs for password reset attempts:
   - Navigate to: Logs > Postgres Logs
   - Filter for: "Password reset"

2. Monitor for errors:
   - Check for RLS policy violations
   - Check for function execution errors
   - Monitor email delivery failures

#### Set Up Alerts (Recommended)
1. Alert on multiple failed password reset attempts from same IP
2. Alert on high volume of password reset requests (potential attack)
3. Alert on database function errors

## Post-Deployment Verification

### Immediate Checks (Within 1 Hour)
- [ ] Password reset requests are working
- [ ] Reset emails are being sent
- [ ] Users can successfully reset passwords
- [ ] No errors in Supabase logs
- [ ] RLS policies are enforcing correctly

### Extended Monitoring (24 Hours)
- [ ] No user complaints about password reset
- [ ] Email delivery rate is normal
- [ ] No spike in password reset failures
- [ ] Database performance is normal

## Rollback Plan (If Needed)

If issues are detected, follow these steps:

### 1. Emergency Rollback (Disable RLS Temporarily)
```sql
-- ONLY IF ABSOLUTELY NECESSARY
-- This temporarily disables RLS to restore functionality
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE auth_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_tokens DISABLE ROW LEVEL SECURITY;

-- Log the rollback
INSERT INTO system_logs (message, severity)
VALUES ('Emergency RLS rollback performed', 'CRITICAL');
```

### 2. Restore from Backup
```sql
-- If data was corrupted
TRUNCATE TABLE users;
INSERT INTO users SELECT * FROM users_backup_20251020;

TRUNCATE TABLE auth_sessions;
INSERT INTO auth_sessions SELECT * FROM auth_sessions_backup_20251020;

TRUNCATE TABLE password_reset_tokens;
INSERT INTO password_reset_tokens SELECT * FROM password_reset_tokens_backup_20251020;
```

### 3. Remove Migration
```sql
-- Drop functions
DROP FUNCTION IF EXISTS lookup_user_for_password_reset(text);
DROP FUNCTION IF EXISTS validate_password_reset_token(text);
DROP FUNCTION IF EXISTS reset_user_password(text, text);

-- Drop policies (list specific policy names)
-- DROP POLICY "policy_name" ON table_name;
```

### 4. Notify Team
- Inform team of rollback
- Schedule post-mortem meeting
- Document issues encountered

## Troubleshooting Common Issues

### Issue 1: "Permission denied" errors
**Cause**: RLS policies are too restrictive
**Solution**: Review and adjust RLS policies
```sql
-- Check which policies are blocking
SELECT * FROM pg_policies WHERE tablename = 'users';
```

### Issue 2: Users not found during password reset
**Cause**: Database function not working correctly
**Solution**: Test function directly
```sql
SELECT * FROM lookup_user_for_password_reset('known-email@example.com');
```

### Issue 3: Password reset emails not sending
**Cause**: Edge function or email service issue (not related to this fix)
**Solution**: Check edge function logs and email service configuration

### Issue 4: "Token validation failed" errors
**Cause**: Token validation function issue
**Solution**: Test validation function
```sql
-- Create test token first, then validate
SELECT * FROM validate_password_reset_token('test-token');
```

## Success Criteria

The deployment is considered successful when:
- [x] Migration applied without errors
- [ ] All verification tests pass
- [ ] Users can request password reset
- [ ] Users receive reset emails
- [ ] Users can reset passwords successfully
- [ ] Users can sign in with new passwords
- [ ] No security vulnerabilities introduced
- [ ] No performance degradation
- [ ] Zero critical errors in logs

## Support Contacts

**Database Issues:**
- Check: Supabase Dashboard > Database
- Logs: Supabase Dashboard > Logs

**Code Issues:**
- Review: `src/lib/passwordReset.ts`
- Check: Browser console for errors

**Email Issues:**
- Check: Supabase Edge Functions logs
- Verify: Email service configuration

## Additional Notes

### Rate Limiting Recommendation
Consider implementing rate limiting for password reset requests:

```typescript
// Example rate limiting (implement at API/edge function level)
const MAX_RESET_REQUESTS = 5;
const WINDOW_MINUTES = 60;

// Track requests per IP/email
// Reject if exceeded within window
```

### Token Cleanup Job
Set up a periodic job to clean expired tokens:

```sql
-- Run this daily via cron job or Supabase scheduled function
SELECT clean_expired_sessions();
```

### Monitoring Queries

```sql
-- Count password reset requests today
SELECT count(*)
FROM password_reset_tokens
WHERE created_at >= CURRENT_DATE;

-- Count successful resets today
SELECT count(*)
FROM password_reset_tokens
WHERE used_at >= CURRENT_DATE;

-- Find expired unused tokens
SELECT count(*)
FROM password_reset_tokens
WHERE expires_at < now() AND used_at IS NULL;
```

---

## Deployment Sign-Off

- [ ] Code reviewed and approved
- [ ] Migration tested in development
- [ ] Backup created
- [ ] Migration applied to production
- [ ] All tests passed
- [ ] Monitoring configured
- [ ] Documentation updated
- [ ] Team notified of deployment

**Deployed By:** ___________________
**Date:** ___________________
**Time:** ___________________
**Sign-off:** ___________________
