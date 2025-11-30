# Validation Debug Logging - Testing Guide

## Changes Made

Debug logging has been added to all validation-related code to help identify where the "Validation rule not found" error is occurring.

### Files Modified

1. **src/lib/validation.ts**
   - Added logging when fetching validation rules from database
   - Added logging when using cached rules
   - Added detailed logging in `validateByRuleName` function
   - Shows which rule is being searched for and which rules are available

2. **src/hooks/useValidation.ts**
   - Added logging when loading validation rules
   - Added logging in `validateField` function
   - Shows validation results for each field

3. **src/pages/Join.tsx**
   - Added logging in `validateField` function (called on field blur)
   - Shows field name, mapped rule name, and validation result

4. **src/components/EditMemberModal.tsx**
   - Added logging in `validateSingleField` function
   - Shows field name, mapped rule name, and validation result

## How to Test

### 1. Open Browser Console

Open your browser's Developer Tools (F12) and go to the Console tab.

### 2. Test on Join Page

1. Navigate to `/join` page
2. Fill in the email field with an invalid email (e.g., "test")
3. Click outside the field (blur event)
4. Check console for log messages starting with `[Join]`, `[useValidation]`, and `[Validation]`

### 3. Test on Edit Member Modal

1. Log in as admin
2. Navigate to Admin Dashboard → Registrations
3. Click Edit on any member
4. Modify the email field with an invalid email
5. Click outside the field (blur event)
6. Check console for log messages starting with `[EditModal]`, `[useValidation]`, and `[Validation]`

### 4. What to Look For

The console logs will show:

**When validation rules load:**
```
[useValidation] Loading validation rules...
[Validation] Fetching active validation rules from database...
[Validation] Loaded 6 active validation rules from database
[Validation] Rule names: email_format, mobile_number, gst_number, pan_number, aadhaar_number, pin_code
```

**When a field is validated:**
```
[Join] validateField called for: email value: test@...
[Join] Field email maps to rule: email_format
[useValidation] validateField called: {fieldType: 'email_format', valueLength: 15}
[Validation] validateByRuleName called with: {ruleName: 'email_format', value: 'test@...'}
[Validation] Using cached rules: 6 rules
[Validation] Cached rule names: email_format, mobile_number, gst_number, pan_number, aadhaar_number, pin_code
[Validation] Searching for rule: email_format
[Validation] Available rules: email_format, mobile_number, gst_number, pan_number, aadhaar_number, pin_code
[Validation] Found rule: email_format - Pattern: ^[^\s@]+@[^\s@]+\.[^\s@]+$
[Validation] Validation result for email_format : VALID
```

**If a rule is NOT found:**
```
[Validation] Rule not found: some_rule_name
[Validation] Available rule names: ['email_format', 'mobile_number', ...]
```

## Expected Behavior

### Fields with Validation Rules

These fields should trigger validation on blur:
- **email** → uses `email_format` rule
- **mobile_number** → uses `mobile_number` rule
- **alternate_mobile** → uses `mobile_number` rule
- **gst_number** → uses `gst_number` rule
- **pan_company** → uses `pan_number` rule
- **pin_code** → uses `pin_code` rule

### Fields without Validation Rules

- **website** - Uses custom regex validation (not in database)
- Other fields - No validation on blur

## Troubleshooting

### If you see "Rule not found" error:

1. Check the console logs to see which rule name is being searched
2. Compare it with the available rule names shown in the logs
3. Check if the rule exists in the database but is marked as inactive
4. Verify the field-to-rule mapping in the code matches the database

### If no logs appear:

1. Make sure you're in development mode (`npm run dev`)
2. Clear your browser cache
3. Hard refresh the page (Ctrl+Shift+R or Cmd+Shift+R)
4. Check if JavaScript errors are preventing the code from running

## Database Verification

The database has been confirmed to contain these validation rules (all active):
- email_format
- mobile_number
- gst_number
- pan_number
- aadhaar_number
- pin_code

## Next Steps

After testing with these debug logs:

1. Share the console output showing the validation error
2. We can identify exactly which rule is missing or misconfigured
3. We can then fix the specific issue (either in code or database)
4. Once fixed, we can optionally remove or reduce the debug logging

## Removing Debug Logs (Later)

Once the issue is resolved, you can remove the `console.log` statements by searching for:
- `console.log('[Validation]`
- `console.log('[useValidation]`
- `console.log('[Join]`
- `console.log('[EditModal]`

Or keep them if they're helpful for future debugging!
