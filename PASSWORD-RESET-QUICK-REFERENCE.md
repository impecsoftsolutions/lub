# Password Reset - Quick Reference Guide

## Overview

The password reset system now uses secure database functions with Row Level Security (RLS) policies to enable unauthenticated users to reset their passwords safely.

## Files Changed

1. **Migration File**: `supabase/migrations/20251020120000_enable_password_reset_with_rls.sql`
   - Enables RLS on users, auth_sessions, and password_reset_tokens tables
   - Creates 3 secure database functions
   - Adds RLS policies for password reset flow

2. **Code File**: `src/lib/passwordReset.ts`
   - Updated to use database functions instead of direct queries
   - Simplified logic with atomic operations

## Database Functions

### 1. `lookup_user_for_password_reset(identifier text)`
**Purpose**: Look up user by email or mobile number for password reset

**Input**: Email or mobile number (text)

**Output**:
```
user_id: uuid
user_email: text
mobile_number: text
account_type: text
account_status: text
```

**Security**: Does NOT return password_hash

**Usage in Code**:
```typescript
const { data: users, error } = await supabase.rpc(
  'lookup_user_for_password_reset',
  { identifier: 'user@example.com' }
);
const user = users && users.length > 0 ? users[0] : null;
```

### 2. `validate_password_reset_token(token_value text)`
**Purpose**: Validate a password reset token

**Input**: Reset token (text)

**Output**:
```
is_valid: boolean
user_id: uuid (if valid)
user_email: text (if valid)
error_message: text (if invalid)
```

**Checks**:
- Token exists
- Token not expired
- Token not already used

**Usage in Code**:
```typescript
const { data: validationResults, error } = await supabase.rpc(
  'validate_password_reset_token',
  { token_value: 'reset-token-here' }
);
const validation = validationResults && validationResults.length > 0
  ? validationResults[0]
  : null;
```

### 3. `reset_user_password(reset_token text, new_password text)`
**Purpose**: Reset user password (complete password reset process)

**Input**:
- reset_token: Reset token (text)
- new_password: New password (text)

**Output**:
```
success: boolean
error_message: text (if failed)
```

**Actions Performed** (Atomic Transaction):
1. Validates the reset token
2. Hashes the new password using bcrypt
3. Updates user's password
4. Sets account_status to 'active'
5. Clears failed_login_attempts
6. Marks token as used
7. Invalidates all active sessions

**Usage in Code**:
```typescript
const { data: resetResults, error } = await supabase.rpc(
  'reset_user_password',
  {
    reset_token: 'reset-token-here',
    new_password: 'NewPassword123',
  }
);
const result = resetResults && resetResults.length > 0
  ? resetResults[0]
  : null;
```

## RLS Policies Summary

### Users Table
- Users can read their own data
- Users can update their own data (with restrictions)
- Admins can read all users
- Admins can update users

### Password Reset Tokens Table
- Anyone can INSERT (create reset tokens)
- Anyone can SELECT (validate tokens)
- Anyone can UPDATE (mark tokens as used)
- System can DELETE expired tokens

### Auth Sessions Table
- Anyone can INSERT (create sessions during sign-in)
- Anyone can SELECT (validate sessions)
- Users can UPDATE their own sessions
- Users can DELETE their own sessions
- System can DELETE expired sessions

## Password Reset Flow

### Step 1: Request Password Reset
```
User enters email/mobile
  ↓
lookup_user_for_password_reset(identifier)
  ↓
Create reset token in database
  ↓
Send email with reset link
```

### Step 2: Validate Token
```
User clicks reset link
  ↓
validate_password_reset_token(token)
  ↓
Show reset password form (if valid)
```

### Step 3: Reset Password
```
User enters new password
  ↓
Validate password strength (client-side)
  ↓
reset_user_password(token, new_password)
  ↓
Success: Redirect to login
```

## Security Features

1. **No Sensitive Data Exposure**: Functions never return password_hash
2. **Enumeration Prevention**: Always returns success, even if user not found
3. **Atomic Operations**: Password reset happens in a single transaction
4. **Audit Logging**: All operations are logged via PostgreSQL RAISE LOG
5. **Session Invalidation**: All sessions are deleted after password reset
6. **Token Security**: Tokens validated for existence, expiration, and usage

## Testing Commands

### Test User Lookup
```sql
SELECT * FROM lookup_user_for_password_reset('user@example.com');
```

### Test Token Validation
```sql
-- First create a test token manually
INSERT INTO password_reset_tokens (user_id, token, expires_at)
VALUES ('user-id-here', 'test-token-123', now() + interval '1 hour');

-- Then validate it
SELECT * FROM validate_password_reset_token('test-token-123');
```

### Test Password Reset
```sql
SELECT * FROM reset_user_password('test-token-123', 'NewPassword123');
```

### Check RLS Status
```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename IN ('users', 'auth_sessions', 'password_reset_tokens');
```

### View Policies
```sql
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE tablename IN ('users', 'auth_sessions', 'password_reset_tokens')
ORDER BY tablename, policyname;
```

## Common Issues & Solutions

### Issue: "Function does not exist"
**Solution**: Migration not applied. Check Supabase Dashboard > Database > Migrations

### Issue: "Permission denied"
**Solution**: RLS policy blocking access. Review policies or check function permissions

### Issue: "User not found" but user exists
**Solution**: Check if user.is_active = true (function only returns active users)

### Issue: "Token expired" immediately
**Solution**: Check server timezone. Token expiry is set in `passwordReset.ts` (default 1 hour)

## Monitoring

### Daily Checks
```sql
-- Reset requests today
SELECT count(*) FROM password_reset_tokens
WHERE created_at >= CURRENT_DATE;

-- Successful resets today
SELECT count(*) FROM password_reset_tokens
WHERE used_at >= CURRENT_DATE;

-- Failed attempts (unused expired tokens)
SELECT count(*) FROM password_reset_tokens
WHERE expires_at < now() AND used_at IS NULL;
```

### Security Monitoring
```sql
-- Multiple resets from same user (potential abuse)
SELECT user_id, count(*) as reset_count
FROM password_reset_tokens
WHERE created_at >= CURRENT_DATE
GROUP BY user_id
HAVING count(*) > 3;
```

## Maintenance

### Clean Up Expired Tokens
```sql
-- Run this periodically (daily recommended)
SELECT clean_expired_sessions();
```

### Manual Token Cleanup
```sql
-- Delete expired unused tokens older than 7 days
DELETE FROM password_reset_tokens
WHERE expires_at < now() - interval '7 days'
AND used_at IS NULL;

-- Delete used tokens older than 30 days (for audit trail)
DELETE FROM password_reset_tokens
WHERE used_at < now() - interval '30 days';
```

## Password Requirements

As defined in `src/lib/passwordReset.ts`:
- Minimum 8 characters
- Must contain at least one uppercase letter (A-Z)
- Must contain at least one lowercase letter (a-z)
- Must contain at least one number (0-9)

## Configuration

### Token Expiry Time
Location: `src/lib/passwordReset.ts`
```typescript
const RESET_TOKEN_EXPIRY_HOURS = 1; // Default: 1 hour
```

To change: Update this constant and redeploy.

### Email Template
Location: `src/lib/passwordReset.ts` (sendResetEmail function)

Customize:
- Email subject
- HTML template
- Text fallback

## Support & Troubleshooting

### Check Logs
1. **Browser Console**: Client-side errors
2. **Supabase Logs**: Database errors
   - Navigate to: Dashboard > Logs > Postgres Logs
   - Filter for: "Password reset"

### Debug Mode
Enable verbose logging by checking browser console:
```javascript
// All password reset operations log with [passwordReset] prefix
// Look for these in browser console
```

### Verify Database State
```sql
-- Check users table
SELECT id, email, account_status, is_active FROM users LIMIT 5;

-- Check recent reset tokens
SELECT * FROM password_reset_tokens
ORDER BY created_at DESC LIMIT 10;

-- Check active sessions
SELECT * FROM auth_sessions
ORDER BY created_at DESC LIMIT 10;
```

## Additional Resources

- **Full Documentation**: `PASSWORD-RESET-FIX-SUMMARY.md`
- **Deployment Guide**: `PASSWORD-RESET-DEPLOYMENT-CHECKLIST.md`
- **Test Queries**: `test-password-reset-functions.sql`
- **Migration File**: `supabase/migrations/20251020120000_enable_password_reset_with_rls.sql`
- **Source Code**: `src/lib/passwordReset.ts`

## Quick Links

- Supabase Dashboard: https://supabase.com/dashboard
- Database Policies: Dashboard > Authentication > Policies
- SQL Editor: Dashboard > SQL Editor
- Logs: Dashboard > Logs > Postgres Logs

---

**Last Updated**: 2025-10-20
**Version**: 1.0
**Status**: Production Ready ✓
