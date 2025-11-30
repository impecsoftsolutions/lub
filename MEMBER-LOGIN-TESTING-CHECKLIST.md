# Member Login System - Complete Testing Checklist

## 🔧 Pre-Testing Setup (Supabase Configuration)

### ✅ Required Supabase Settings

**NO MANUAL SETUP REQUIRED!** All database tables, RLS policies, and configurations have been created automatically through migrations. However, please verify:

1. **Database Migrations Applied** ✓
   - All migrations in `supabase/migrations/` folder have been applied
   - Tables exist: `member_registrations`, `deleted_members`, `member_audit_history`
   - Columns added: `user_id`, `is_legacy_member`, `original_application_id`, `reapplication_parent_id`

2. **RLS Policies Enabled** ✓
   - RLS is enabled on `member_registrations` table
   - Member-specific policies allow users to read/update their own data
   - Public can insert new registrations (for signup)

3. **Auth Settings Verified**
   - Go to: Authentication → Settings in Supabase Dashboard
   - **Email Confirmation**: DISABLED (as per requirements)
   - **Auto-confirm email**: ENABLED (important!)
   - **Enable email signups**: ENABLED

### 📧 Email Configuration (Optional for Testing)

For password reset emails to work, configure SMTP:
- Go to: Authentication → Email Templates
- Configure SMTP settings (or use Supabase's built-in email for testing)
- Customize password reset email template if needed

**For Testing Without Email:**
- You can test without SMTP configured
- Password reset functionality won't send emails but everything else works
- Manual password resets can be done via Supabase Dashboard → Authentication → Users

---

## 🧪 Testing Checklist

### 1️⃣ NEW MEMBER SIGNUP FLOW

**Page**: `/signup`

#### Test Case 1.1: Basic Signup
- [ ] Navigate to `/signup`
- [ ] Verify page loads with clean design (blue gradient header)
- [ ] Fill in email: `newmember@test.com`
- [ ] Fill in mobile: `9876543210`
- [ ] Fill in password: `TestPassword123`
- [ ] Fill in confirm password: `TestPassword123`
- [ ] Click "Create Account"
- [ ] **Expected**: Success message appears
- [ ] **Expected**: Automatically redirected to `/join` page
- [ ] **Expected**: Email and mobile fields are pre-filled and locked

#### Test Case 1.2: Validation Tests
- [ ] Try signup with existing email → Should show error
- [ ] Try signup with existing mobile → Should show error
- [ ] Try passwords that don't match → Should show error
- [ ] Try weak password (less than 8 chars) → Should show error
- [ ] Try invalid email format → Should show error
- [ ] Try mobile with less than 10 digits → Should show error

#### Test Case 1.3: UI/UX Elements
- [ ] Password visibility toggle works for both fields
- [ ] "Already have an account? Login" link goes to `/login`
- [ ] Form shows loading state during submission
- [ ] Toast notification appears on success/error
- [ ] All validation errors are user-friendly

---

### 2️⃣ LOGIN FLOW - EMAIL & MOBILE

**Pages**: `/login`

#### Test Case 2.1: Login with Email
- [ ] Navigate to `/login`
- [ ] Verify "Email or Mobile" input placeholder
- [ ] Enter email: `newmember@test.com`
- [ ] Enter password: `TestPassword123`
- [ ] Click "Login"
- [ ] **Expected**: Success toast appears
- [ ] **Expected**: Redirected to `/dashboard`
- [ ] **Expected**: Dashboard shows member name and status

#### Test Case 2.2: Login with Mobile Number
- [ ] Navigate to `/login`
- [ ] Enter mobile: `9876543210` (without +91)
- [ ] Enter password: `TestPassword123`
- [ ] Click "Login"
- [ ] **Expected**: System looks up email from mobile
- [ ] **Expected**: Login succeeds
- [ ] **Expected**: Redirected to `/dashboard`

#### Test Case 2.3: Login Error Handling
- [ ] Try wrong password → Should show "Invalid credentials"
- [ ] Try non-existent email → Should show error
- [ ] Try non-existent mobile → Should show "No account found"
- [ ] Try empty fields → Should show validation errors

#### Test Case 2.4: Forgot Password Flow
- [ ] Click "Forgot Password?" link
- [ ] Should navigate to password reset page
- [ ] (Test password reset if email configured)

#### Test Case 2.5: Remember Me
- [ ] Login with "Remember Me" checked
- [ ] Close browser and reopen
- [ ] Navigate to site
- [ ] **Expected**: Still logged in (if session valid)

---

### 3️⃣ DASHBOARD ACCESS & NAVIGATION

**Page**: `/dashboard`

#### Test Case 3.1: Dashboard Landing
- [ ] After login, verify dashboard displays:
  - [ ] "Member Dashboard" heading
  - [ ] Welcome message with member name
  - [ ] Application status card with colored badge
  - [ ] Status message (pending/approved/rejected)
  - [ ] "Your Information" section with email, mobile, company
  - [ ] "Quick Actions" sidebar with 5 links

#### Test Case 3.2: Status-Based UI
**For Pending Members:**
- [ ] Status badge is yellow with "Pending Review"
- [ ] Status message: "Your application is under review"
- [ ] No "Re-apply" button visible

**For Approved Members:**
- [ ] Status badge is green with "Approved"
- [ ] Status message: "Welcome to LUB!"
- [ ] Member ID displayed in blue card
- [ ] Approval date shown
- [ ] No "Re-apply" button visible

**For Rejected Members:**
- [ ] Status badge is red with "Rejected"
- [ ] Rejection reason displayed
- [ ] "Re-apply for Membership" button visible and clickable
- [ ] Reapplication count shown (if > 0)

#### Test Case 3.3: Quick Actions Navigation
- [ ] Click "View My Profile" → Goes to `/dashboard/profile`
- [ ] Click "Edit My Information" → Goes to `/dashboard/edit`
- [ ] Click "View Directory" → Goes to `/members`
- [ ] Click "Change Password" → Goes to `/dashboard/change-password`
- [ ] Click "Logout" → Logs out and redirects to home

#### Test Case 3.4: Refresh Functionality
- [ ] Click refresh button in top-right
- [ ] **Expected**: Data reloads from database
- [ ] **Expected**: UI updates with latest status

---

### 4️⃣ JOIN FORM WITH PRE-FILLED LOCKED FIELDS

**Page**: `/join`

#### Test Case 4.1: Authenticated User Access
- [ ] Login as newly created member
- [ ] Navigate to `/join` (or click from dashboard)
- [ ] **Expected**: Page loads successfully
- [ ] **Expected**: Email field is pre-filled and locked (gray background)
- [ ] **Expected**: Email field shows lock icon 🔒
- [ ] **Expected**: Helper text: "This field is locked..."
- [ ] **Expected**: Mobile field is pre-filled and locked
- [ ] **Expected**: Mobile field shows lock icon 🔒
- [ ] **Expected**: Both fields are disabled (cannot edit)

#### Test Case 4.2: Non-Authenticated User Access
- [ ] Logout completely
- [ ] Try to navigate to `/join` directly
- [ ] **Expected**: See warning screen with yellow alert
- [ ] **Expected**: Message: "Sign Up First"
- [ ] **Expected**: Two buttons: "Go to Sign Up" and "Back to Home"
- [ ] Click "Go to Sign Up" → Redirects to `/signup`

#### Test Case 4.3: Form Submission with user_id
- [ ] Login and navigate to `/join`
- [ ] Fill in all required fields (except locked email/mobile)
- [ ] Upload required documents
- [ ] Submit form
- [ ] **Expected**: Form submits successfully
- [ ] **Expected**: `user_id` is automatically included in submission
- [ ] **Expected**: Database record has user_id set
- [ ] Verify in Supabase Dashboard:
  ```sql
  SELECT id, email, mobile_number, user_id, status
  FROM member_registrations
  WHERE email = 'newmember@test.com'
  ORDER BY created_at DESC
  LIMIT 1;
  ```
- [ ] **Expected**: user_id column is populated (not null)

#### Test Case 4.4: Re-application Flow
- [ ] Login as rejected member
- [ ] Navigate to `/dashboard/reapply`
- [ ] Click "Continue to Registration Form"
- [ ] **Expected**: Redirected to `/join`
- [ ] **Expected**: Email and mobile still locked
- [ ] **Expected**: Can fill new application data
- [ ] Submit new application
- [ ] **Expected**: New record created with original_application_id set
- [ ] **Expected**: reapplication_count incremented

---

### 5️⃣ PROFILE VIEWING & EDITING

**Pages**: `/dashboard/profile`, `/dashboard/edit`

#### Test Case 5.1: View Profile
- [ ] From dashboard, click "View My Profile"
- [ ] Navigate to `/dashboard/profile`
- [ ] **Expected**: Profile page loads with blue gradient header
- [ ] **Expected**: Shows profile photo placeholder or actual photo
- [ ] **Expected**: Displays full name and company in header
- [ ] **Expected**: "Edit Profile" button in top-right
- [ ] Verify all information displayed:
  - [ ] Personal Information section (email, mobile)
  - [ ] Company Information section (company name)
  - [ ] Membership Details section (status, member ID, dates)
- [ ] If rejected, rejection reason shown in red box
- [ ] Click "Back to Dashboard" → Returns to dashboard

#### Test Case 5.2: Edit Profile - Basic Flow
- [ ] From profile page, click "Edit Profile"
- [ ] Navigate to `/dashboard/edit`
- [ ] **Expected**: Edit form loads
- [ ] Verify form fields:
  - [ ] Full Name (editable, pre-filled)
  - [ ] Company Name (editable, pre-filled)
  - [ ] Email (disabled, gray background, cannot edit)
  - [ ] Mobile (disabled, gray background, cannot edit)
  - [ ] Helper text under email/mobile: "cannot be changed"

#### Test Case 5.3: Edit Profile - Update Success
- [ ] Change full name to "Updated Name"
- [ ] Change company name to "Updated Company"
- [ ] Click "Save Changes"
- [ ] **Expected**: Button shows "Saving..." with spinner
- [ ] **Expected**: Success toast appears
- [ ] **Expected**: Redirected to `/dashboard/profile` after 1.5 seconds
- [ ] **Expected**: Profile page shows updated information
- [ ] Verify in database:
  ```sql
  SELECT full_name, company_name, last_modified_at
  FROM member_registrations
  WHERE email = 'newmember@test.com';
  ```
- [ ] **Expected**: Changes persisted, last_modified_at updated

#### Test Case 5.4: Edit Profile - Validation
- [ ] Try to submit with empty full name → Should show error
- [ ] Try to submit with empty company name → Should show error
- [ ] Try to edit email field → Should be impossible (disabled)
- [ ] Try to edit mobile field → Should be impossible (disabled)

#### Test Case 5.5: Edit Profile - Cancel
- [ ] Make changes to name/company
- [ ] Click "Cancel" button
- [ ] **Expected**: Redirected back to profile page
- [ ] **Expected**: Changes not saved
- [ ] **Expected**: Profile shows original data

---

### 6️⃣ PASSWORD CHANGE FUNCTIONALITY

**Page**: `/dashboard/change-password`

#### Test Case 6.1: Access Change Password Page
- [ ] From dashboard, click "Change Password"
- [ ] Navigate to `/dashboard/change-password`
- [ ] **Expected**: Page loads with blue gradient header
- [ ] **Expected**: Shows security tips section
- [ ] Click "Change Password" button
- [ ] **Expected**: Modal opens over the page

#### Test Case 6.2: Change Password Modal UI
- [ ] Verify modal displays:
  - [ ] Key icon in header
  - [ ] "Change Password" title
  - [ ] Three password fields (current, new, confirm)
  - [ ] Eye icons for show/hide on each field
  - [ ] Blue info box with password requirements
  - [ ] Cancel and "Change Password" buttons

#### Test Case 6.3: Password Visibility Toggles
- [ ] Type in current password field
- [ ] Click eye icon → Password becomes visible
- [ ] Click again → Password becomes hidden
- [ ] Repeat for new password field
- [ ] Repeat for confirm password field
- [ ] All toggles work independently

#### Test Case 6.4: Change Password Success
- [ ] Enter current password: `TestPassword123`
- [ ] Enter new password: `NewPassword456`
- [ ] Enter confirm password: `NewPassword456`
- [ ] Click "Change Password"
- [ ] **Expected**: Button shows "Changing..." with spinner
- [ ] **Expected**: Green success message appears in modal
- [ ] **Expected**: Modal auto-closes after 2 seconds
- [ ] **Expected**: Success toast appears on page
- [ ] **Expected**: Redirected back to dashboard

#### Test Case 6.5: Verify New Password Works
- [ ] Logout
- [ ] Try to login with old password → Should fail
- [ ] Login with new password: `NewPassword456` → Should succeed

#### Test Case 6.6: Password Change Validation
**Wrong Current Password:**
- [ ] Enter wrong current password
- [ ] Enter valid new password
- [ ] **Expected**: Error: "Current password is incorrect"

**Password Too Short:**
- [ ] Enter valid current password
- [ ] Enter new password: `Short1` (less than 8 chars)
- [ ] **Expected**: Error: "New password must be at least 8 characters"

**Passwords Don't Match:**
- [ ] Enter valid current password
- [ ] Enter new password: `NewPassword789`
- [ ] Enter confirm password: `DifferentPass123`
- [ ] **Expected**: Error: "Passwords do not match"

**Same as Current Password:**
- [ ] Enter current password in all three fields
- [ ] **Expected**: Error: "New password must be different"

#### Test Case 6.7: Cancel Password Change
- [ ] Open change password modal
- [ ] Fill in some fields
- [ ] Click "Cancel" or X button
- [ ] **Expected**: Modal closes
- [ ] **Expected**: No changes made
- [ ] **Expected**: Can login with existing password

---

### 7️⃣ LOGOUT FUNCTIONALITY

#### Test Case 7.1: Logout from Dashboard
- [ ] Login and go to dashboard
- [ ] Click "Logout" in Quick Actions sidebar
- [ ] **Expected**: Success toast appears
- [ ] **Expected**: Redirected to home page after 1 second
- [ ] **Expected**: Header no longer shows "Dashboard" link
- [ ] **Expected**: Header shows "Sign In" button again

#### Test Case 7.2: Logout from Header
- [ ] Login as member
- [ ] From any page, click "Logout" button in header (top-right)
- [ ] **Expected**: Button shows "Logging out..."
- [ ] **Expected**: Button is disabled during logout
- [ ] **Expected**: Session cleared
- [ ] **Expected**: Redirected to home page
- [ ] **Expected**: Header reverts to non-authenticated state

#### Test Case 7.3: Verify Session Cleared
- [ ] After logout, try to access `/dashboard` directly
- [ ] **Expected**: Redirected to `/login`
- [ ] Try to access `/dashboard/profile`
- [ ] **Expected**: Redirected to `/login`
- [ ] Try to access `/dashboard/edit`
- [ ] **Expected**: Redirected to `/login`

#### Test Case 7.4: Post-Logout Navigation
- [ ] After logout, verify all these work:
  - [ ] Can browse public pages (home, directory, events, etc.)
  - [ ] Can signup again as different user
  - [ ] Can login as same user again
  - [ ] Previous session completely terminated

---

## 🎯 Header Navigation Tests (Authenticated)

### Test Case 8.1: Member-Specific Header Elements
**When Logged In:**
- [ ] "Dashboard" link appears in navigation
- [ ] Dashboard link has icon (LayoutDashboard)
- [ ] Dashboard link is highlighted when on /dashboard
- [ ] "Logout" button (red) replaces "Sign In"
- [ ] Logout button has LogOut icon

**For Non-Approved Members:**
- [ ] "Join" dropdown still visible
- [ ] Can access Payment and Register options

**For Approved Members:**
- [ ] "Join" dropdown is hidden
- [ ] No way to re-apply (already approved)

### Test Case 8.2: Mobile Menu (Responsive)
- [ ] On mobile/small screen, open hamburger menu
- [ ] Verify Dashboard link appears
- [ ] Verify Logout button appears at bottom
- [ ] Verify Join options show/hide based on approval status
- [ ] All links work correctly from mobile menu

---

## 🔄 Edge Cases & Advanced Scenarios

### Test Case 9.1: Multiple Sessions
- [ ] Login on Chrome
- [ ] Login on Firefox with same account
- [ ] Both sessions should work independently
- [ ] Logout from one → Other stays logged in
- [ ] Change password in one → Other gets logged out on next action

### Test Case 9.2: Expired Session
- [ ] Login and wait for session to expire (if configured)
- [ ] Try to access protected page
- [ ] **Expected**: Redirected to login
- [ ] Login again → Should work

### Test Case 9.3: Concurrent Applications
- [ ] Create member account
- [ ] Submit application via /join
- [ ] While pending, try to submit another
- [ ] **Expected**: Should allow (no duplicate prevention for authenticated users)
- [ ] Both applications should have same user_id

### Test Case 9.4: Re-application After Rejection
- [ ] Have admin reject a member application
- [ ] Member logs in
- [ ] Dashboard shows rejection reason
- [ ] Click "Re-apply for Membership"
- [ ] Goes to `/dashboard/reapply` page
- [ ] Page explains process
- [ ] Click "Continue to Registration Form"
- [ ] Goes to `/join` with locked email/mobile
- [ ] Submit new application
- [ ] **Expected**: `reapplication_count` increments
- [ ] **Expected**: `original_application_id` set to first application ID
- [ ] **Expected**: New application has status "pending"

### Test Case 9.5: Deleted Member Scenario
- [ ] Have admin delete a member
- [ ] Try to login with that account
- [ ] **Expected**: Login fails or shows appropriate message
- [ ] (This depends on whether auth account was also deleted)

---

## 📊 Database Verification Queries

Use these in Supabase SQL Editor to verify data:

### Check User Creation
```sql
-- Verify auth user created
SELECT id, email, created_at, email_confirmed_at
FROM auth.users
WHERE email = 'newmember@test.com';
```

### Check Member Registration Linked
```sql
-- Verify user_id populated
SELECT id, email, mobile_number, user_id, status, is_legacy_member
FROM member_registrations
WHERE email = 'newmember@test.com';
```

### Check Re-application Chain
```sql
-- Find all applications by email
SELECT
  id,
  email,
  status,
  reapplication_count,
  original_application_id,
  created_at
FROM member_registrations
WHERE email = 'newmember@test.com'
ORDER BY created_at DESC;
```

### Check Audit Trail
```sql
-- View member audit history
SELECT
  mah.action_type,
  mah.changed_fields,
  mah.action_timestamp,
  mah.performed_by_type
FROM member_audit_history mah
JOIN member_registrations mr ON mr.id = mah.member_id
WHERE mr.email = 'newmember@test.com'
ORDER BY mah.action_timestamp DESC;
```

---

## ✅ Success Criteria

The member login system is working correctly if:

1. ✅ New members can signup with email, mobile, and password
2. ✅ Members can login with either email OR mobile number
3. ✅ Dashboard shows correct status (pending/approved/rejected)
4. ✅ Join form pre-fills and locks email/mobile for authenticated users
5. ✅ Non-authenticated users are redirected to signup from /join
6. ✅ Members can view their complete profile
7. ✅ Members can edit limited fields (name, company)
8. ✅ Email and mobile cannot be edited (locked fields)
9. ✅ Password change works with proper validation
10. ✅ Logout clears session and redirects appropriately
11. ✅ Header shows member-specific navigation when logged in
12. ✅ Rejected members can re-apply and data is properly linked
13. ✅ All pages are responsive and mobile-friendly
14. ✅ Toast notifications appear for all actions
15. ✅ Loading states show during async operations
16. ✅ RLS policies prevent unauthorized data access

---

## 🚨 Common Issues & Troubleshooting

### Issue 1: "Email not confirmed" error
**Solution**: Ensure auto-confirm is enabled in Supabase:
- Auth → Settings → Enable auto-confirm email

### Issue 2: Can't login with mobile number
**Cause**: Database might not have matching record
**Solution**: Query `member_registrations` to verify mobile_number exists

### Issue 3: Email/mobile not locked in Join form
**Cause**: User not authenticated or member data not loading
**Solution**: Check MemberContext is wrapping the component

### Issue 4: Logout not working
**Cause**: Supabase client not initialized properly
**Solution**: Check .env file has correct VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY

### Issue 5: Password change fails
**Cause**: Wrong current password or session expired
**Solution**: Try logging out and back in, then change password

### Issue 6: Dashboard shows "Unable to load profile"
**Cause**: user_id not linked to member_registrations
**Solution**: Check database for user_id column population

### Issue 7: Re-application button not showing
**Cause**: Member status is not "rejected"
**Solution**: Have admin reject application first via admin panel

---

## 📝 Test Report Template

After testing, document results:

```
MEMBER LOGIN SYSTEM TEST REPORT
Date: [Date]
Tested By: [Name]
Environment: [Development/Staging/Production]

SUMMARY:
- Total Test Cases: 90+
- Passed: ___
- Failed: ___
- Blocked: ___

CRITICAL ISSUES FOUND:
1. [Description]
2. [Description]

MINOR ISSUES FOUND:
1. [Description]
2. [Description]

NOTES:
[Any additional observations]

RECOMMENDATION:
[ ] Ready for Production
[ ] Requires Fixes
[ ] Needs Re-testing
```

---

## 🎉 Final Checklist Before Production

- [ ] All migrations applied successfully
- [ ] RLS policies tested and working
- [ ] Email configuration tested (if using password reset)
- [ ] All authentication flows tested end-to-end
- [ ] Mobile responsiveness verified
- [ ] Error handling works gracefully
- [ ] Session management works correctly
- [ ] Database queries are optimized
- [ ] No console errors in browser
- [ ] Toast notifications appear correctly
- [ ] Loading states show during operations
- [ ] Back button navigation works everywhere
- [ ] Logout clears all session data
- [ ] Production environment variables set
- [ ] Backup strategy in place

---

**System Status**: ✅ READY FOR TESTING

All components are built and integrated. No manual Supabase setup required beyond verifying migrations are applied and auth settings are correct.
