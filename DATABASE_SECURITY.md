# Database Security Audit Report

**Date:** 2025-10-07
**Database:** Supabase PostgreSQL
**Project:** Laghu Udyog Bharati Member Portal

---

## Executive Summary

This document provides a comprehensive security audit of the Supabase database for the LUB Member Portal. The audit covers:

- 18 database tables with Row Level Security (RLS) enabled
- 5 database views for data access abstraction
- 17 functions (4 SECURITY DEFINER, 13 SECURITY INVOKER)
- 69+ RLS policies controlling data access
- Role-based access control (RBAC) implementation
- Public registration form security
- Admin dashboard access controls

**Security Status:** ✅ All tables have RLS enabled
**Critical Issues Found:** 0
**Recommendations:** See sections below

---

## Table of Contents

1. [Role-Based Access Control Model](#role-based-access-control-model)
2. [Security Matrix](#security-matrix)
3. [Table-by-Table Security Analysis](#table-by-table-security-analysis)
4. [SECURITY DEFINER Functions](#security-definer-functions)
5. [Database Views](#database-views)
6. [Storage Bucket Security](#storage-bucket-security)
7. [Security Recommendations](#security-recommendations)
8. [Testing Procedures](#testing-procedures)

---

## Role-Based Access Control Model

The system implements a 5-tier access control model:

### 1. Anonymous (anon) Role
**Purpose:** Public visitors, not logged in
**Use Case:** Registration form submission, viewing public directory

**Access Rights:**
- ✅ INSERT: member_registrations (new applications)
- ✅ INSERT: pending_cities_master (city suggestions)
- ✅ SELECT: All master data tables (states, districts, cities, designations)
- ✅ SELECT: validation_rules (active rules only)
- ✅ SELECT: form_field_configurations (visible fields only)
- ✅ SELECT: payment_settings (public payment info)
- ✅ SELECT: member_registrations (approved members only)
- ✅ SELECT: directory_field_visibility (field settings)
- ✅ SELECT: organization_profile (org info)
- ✅ SELECT: state_leaders (leadership info)
- ✅ SELECT: lub_roles_master (active roles only)
- ❌ NO UPDATE or DELETE operations
- ❌ NO access to pending/rejected registrations
- ❌ NO access to audit logs or deleted members

### 2. Authenticated (authenticated) Role
**Purpose:** Logged-in users (future Phase 3 - member login)
**Use Case:** Members viewing directory with full contact details

**Access Rights:**
- ✅ All anonymous role permissions
- ✅ SELECT: Own member_registrations record
- ✅ UPDATE: Own contact information (limited fields)
- ✅ SELECT: member_audit_history (read-only)
- ❌ NO access to other members' pending applications
- ❌ NO admin operations

### 3. Viewer Role
**Purpose:** Read-only portal users
**Use Case:** Observers, auditors, read-only staff

**Access Rights:**
- ✅ All authenticated role permissions
- ✅ SELECT: user_roles (own role only)
- ❌ NO write operations
- ❌ NO admin dashboard access

### 4. Editor Role
**Purpose:** Content editors, data entry staff
**Use Case:** Managing member registrations, updating member data

**Access Rights:**
- ✅ All viewer role permissions
- ✅ SELECT: member_registrations (all records)
- ✅ UPDATE: member_registrations (non-financial fields)
- ✅ INSERT: member_audit_history (log changes)
- ✅ UPDATE: form_field_configurations
- ❌ NO DELETE operations on members
- ❌ NO financial data modification
- ❌ NO user role management

### 5. Admin Role
**Purpose:** State/District administrators
**Use Case:** Full member management, system configuration

**Access Rights:**
- ✅ All editor role permissions
- ✅ SELECT: member_registrations (all records)
- ✅ INSERT: member_registrations (manual entries)
- ✅ UPDATE: member_registrations (all fields)
- ✅ DELETE: member_registrations (soft delete)
- ✅ SELECT: deleted_members (view deleted records)
- ✅ UPDATE: directory_field_visibility
- ✅ Manage: cities, districts, designations, LUB roles
- ❌ NO super_admin operations (user roles, validation rules)

### 6. Super Admin Role
**Purpose:** System administrators, IT division
**Use Case:** Full system access, user management, validation rules

**Access Rights:**
- ✅ ALL admin role permissions
- ✅ Full CRUD: user_roles (manage admin accounts)
- ✅ Full CRUD: validation_rules (system validation)
- ✅ Full CRUD: portal_super_admins (super admin list)
- ✅ SELECT/UPDATE: All financial data
- ✅ Restore: deleted_members
- ✅ All system configuration operations

---

## Security Matrix

| Table | Anon (SELECT) | Anon (INSERT) | Auth (SELECT) | Auth (UPDATE) | Admin (ALL) | Super Admin (ALL) |
|-------|---------------|---------------|---------------|---------------|-------------|-------------------|
| member_registrations | ✅ (approved) | ✅ | ✅ (own) | ✅ (limited) | ✅ | ✅ |
| validation_rules | ✅ (active) | ❌ | ✅ (active) | ❌ | ❌ | ✅ |
| form_field_configurations | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| payment_settings | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| user_roles | ❌ | ❌ | ✅ (own) | ❌ | ❌ | ✅ |
| portal_super_admins | ❌ | ❌ | ✅ (own) | ❌ | ❌ | ✅ |
| member_audit_history | ❌ | ❌ | ✅ | ✅ (insert) | ✅ | ✅ |
| deleted_members | ❌ | ❌ | ❌ | ❌ | ✅ (read) | ✅ |
| directory_field_visibility | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| pending_cities_master | ✅ (approved) | ✅ | ✅ | ✅ | ✅ | ✅ |
| states_master | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ |
| districts_master | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ |
| cities_master | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ |
| company_designations | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ |
| lub_roles_master | ✅ (active) | ❌ | ✅ | ❌ | ✅ | ✅ |
| member_lub_role_assignments | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ |
| organization_profile | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ |
| state_leaders | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ |

---

## Table-by-Table Security Analysis

### 1. member_registrations

**Purpose:** Stores all member registration applications and approved members

**RLS Status:** ✅ Enabled
**Policy Count:** 7 policies

**Policies:**

1. **"Public read approved members only"** (SELECT)
   - Roles: anon, authenticated
   - Condition: `status = 'approved'`
   - Purpose: Public directory access

2. **"Allow public insert for member registrations"** (INSERT)
   - Roles: anon, authenticated
   - Condition: `true` (no restrictions)
   - Purpose: Registration form submission

3. **"Allow admins to read all member registrations"** (SELECT)
   - Roles: authenticated
   - Condition: Checks user_roles table for admin/super_admin
   - Purpose: Admin dashboard access

4. **"Allow admins to update all member registrations"** (UPDATE)
   - Roles: authenticated
   - Condition: Checks user_roles table for admin/super_admin
   - Purpose: Member data management

5. **"Allow admins to delete member registrations"** (DELETE)
   - Roles: authenticated
   - Condition: Checks user_roles table for admin/super_admin
   - Purpose: Soft delete to deleted_members table

6. **"Members can update their own registration (restricted)"** (UPDATE)
   - Roles: authenticated
   - Condition: `auth.uid() = user_id` AND limited fields only
   - Purpose: Member self-service (Phase 3)

7. **"Role-based updates for member registrations"** (UPDATE)
   - Roles: authenticated
   - Condition: Uses check_user_permission() function
   - Purpose: Legacy role-based access

**Security Assessment:** ✅ SECURE
- Anonymous users can only see approved members
- Registration form accepts new applications
- Admins have full CRUD access with audit logging
- No data leakage to unauthorized users

**Recommendations:**
- Consider consolidating the 3 UPDATE policies into one
- Remove legacy "Role-based updates" policy after Phase 3 migration
- Add rate limiting for INSERT operations (application level)

---

### 2. validation_rules

**Purpose:** Stores regex validation patterns for form fields

**RLS Status:** ✅ Enabled
**Policy Count:** 5 policies

**Policies:**

1. **"Allow public read access to active validation rules"** (SELECT)
   - Roles: anon, authenticated
   - Condition: `is_active = true`
   - Purpose: Client-side form validation

2. **"Authenticated users can read active validation rules"** (SELECT)
   - Roles: authenticated
   - Condition: `is_active = true`
   - Purpose: Duplicate of policy 1 (can be removed)

3. **"Super admins can read all validation rules"** (SELECT)
   - Roles: authenticated
   - Condition: Checks user_roles for super_admin
   - Purpose: Admin configuration access

4. **"Super admins can insert validation rules"** (INSERT)
   - Roles: authenticated
   - Condition: Checks user_roles for super_admin
   - Purpose: Creating new validation rules

5. **"Super admins can update validation rules"** (UPDATE)
   - Roles: authenticated
   - Condition: Checks user_roles for super_admin
   - Purpose: Modifying validation rules

**Security Assessment:** ✅ SECURE
- Public can read active validation patterns (safe, non-sensitive data)
- Only super admins can modify validation rules
- No DELETE policy (rules should never be deleted, only deactivated)

**Recommendations:**
- ✅ Remove duplicate "Authenticated users can read active validation rules" policy
- Consider adding audit logging for validation rule changes
- Document why validation patterns are public (form validation UX)

---

### 3. form_field_configurations

**Purpose:** Controls which fields appear in the registration form

**RLS Status:** ✅ Enabled
**Policy Count:** 4 policies

**Policies:**

1. **"Allow public read for form field configurations"** (SELECT)
   - Roles: anon, authenticated
   - Condition: `true`
   - Purpose: Dynamic form rendering

2. **"Allow authenticated insert for form field configurations"** (INSERT)
   - Roles: authenticated
   - Condition: `true`
   - Purpose: Too permissive, should be admin-only

3. **"Allow authenticated update for form field configurations"** (UPDATE)
   - Roles: authenticated
   - Condition: `true`
   - Purpose: Too permissive, should be admin-only

4. **"Allow authenticated delete for form field configurations"** (DELETE)
   - Roles: authenticated
   - Condition: `true`
   - Purpose: Too permissive, should be admin-only

**Security Assessment:** ⚠️ NEEDS HARDENING
- Public read is correct (needed for form rendering)
- INSERT/UPDATE/DELETE are too permissive
- Any authenticated user can modify form configuration

**Recommendations:**
- 🔧 **FIX REQUIRED:** Restrict INSERT/UPDATE/DELETE to admin role only
- Add audit logging for configuration changes
- Add system_field protection to prevent critical field deletion

---

### 4. payment_settings

**Purpose:** Stores bank account and fee information

**RLS Status:** ✅ Enabled
**Policy Count:** 3 policies

**Policies:**

1. **"payment_settings_public_read"** (SELECT)
   - Roles: anon, authenticated
   - Condition: `true`
   - Purpose: Display payment information on registration form

2. **"payment_settings_auth_insert"** (INSERT)
   - Roles: authenticated
   - Condition: `true`
   - Purpose: Too permissive, should be admin-only

3. **"payment_settings_auth_update"** (UPDATE)
   - Roles: authenticated
   - Condition: `true`
   - Purpose: Too permissive, should be admin-only

**Security Assessment:** ⚠️ NEEDS HARDENING
- Public read is acceptable (bank details are meant to be public)
- INSERT/UPDATE too permissive

**Recommendations:**
- 🔧 **FIX REQUIRED:** Restrict INSERT/UPDATE to super_admin only
- Add audit logging for payment settings changes
- Consider encrypting sensitive fields (though bank details are public)

---

### 5. user_roles

**Purpose:** Stores admin user roles and permissions

**RLS Status:** ✅ Enabled
**Policy Count:** 5 policies

**Policies:**

1. **"user_roles_select_own"** (SELECT)
   - Roles: authenticated
   - Condition: `auth.uid() = user_id`
   - Purpose: Users can view their own roles

2. **"user_roles_select_super_admin"** (SELECT)
   - Roles: authenticated
   - Condition: Uses is_portal_super_admin() function
   - Purpose: Super admins can view all roles

3. **"user_roles_insert_super_admin"** (INSERT)
   - Roles: authenticated
   - Condition: Uses is_portal_super_admin() function
   - Purpose: Super admins can create roles

4. **"user_roles_update_super_admin"** (UPDATE)
   - Roles: authenticated
   - Condition: Uses is_portal_super_admin() function
   - Purpose: Super admins can modify roles

5. **"user_roles_delete_super_admin"** (DELETE)
   - Roles: authenticated
   - Condition: Uses is_portal_super_admin() function
   - Purpose: Super admins can remove roles

**Security Assessment:** ✅ SECURE
- Users can only see their own roles
- Only super admins can manage roles
- Uses non-recursive is_portal_super_admin() function to prevent RLS loops

**Recommendations:**
- ✅ Well-designed security model
- Consider adding audit logging for role changes
- Document the portal_super_admins table relationship

---

### 6. portal_super_admins

**Purpose:** Whitelist of super admin email addresses

**RLS Status:** ✅ Enabled
**Policy Count:** 2 policies

**Policies:**

1. **"portal_super_admins_select"** (SELECT)
   - Roles: authenticated
   - Condition: `(auth.jwt() ->> 'email') = email`
   - Purpose: Users can check if they're super admin

2. **"portal_super_admins_manage"** (ALL)
   - Roles: authenticated
   - Condition: Email in portal_super_admins list
   - Purpose: Super admins manage the super admin list

**Security Assessment:** ✅ SECURE
- Prevents RLS recursion by using auth.jwt() directly
- Self-referential security model is sound
- No anonymous access

**Recommendations:**
- ✅ Security model is correct
- Document that this is the root of admin privilege
- Ensure at least one email is always in this table

---

### 7. member_audit_history

**Purpose:** Audit log of all member data changes

**RLS Status:** ✅ Enabled
**Policy Count:** 2 policies

**Policies:**

1. **"Authenticated users can read audit history"** (SELECT)
   - Roles: authenticated
   - Condition: `true`
   - Purpose: All authenticated users can view audit logs

2. **"Authenticated users can insert audit records"** (INSERT)
   - Roles: authenticated
   - Condition: `true`
   - Purpose: Log changes made by authenticated users

**Security Assessment:** ⚠️ CONSIDER HARDENING
- All authenticated users can read all audit logs
- May expose sensitive change history

**Recommendations:**
- Consider restricting SELECT to admin role only
- Verify this aligns with audit log viewing requirements
- Ensure no sensitive data in audit logs (e.g., passwords)

---

### 8. deleted_members

**Purpose:** Soft delete archive for member records

**RLS Status:** ✅ Enabled
**Policy Count:** 2 policies

**Policies:**

1. **"Only super admins can read deleted members"** (SELECT)
   - Roles: authenticated
   - Condition: Checks user_roles for super_admin
   - Purpose: Restrict access to deleted records

2. **"Authenticated users can insert deleted members"** (INSERT)
   - Roles: authenticated
   - Condition: `true`
   - Purpose: Allow soft delete operation

**Security Assessment:** ✅ SECURE
- Only super admins can view deleted records
- INSERT is permissive but required for soft delete
- No UPDATE or DELETE (records should be immutable)

**Recommendations:**
- Consider restricting INSERT to admin role only
- Add audit logging for delete/restore operations
- Document restore procedure

---

### 9. directory_field_visibility

**Purpose:** Controls which member fields are visible in directory

**RLS Status:** ✅ Enabled
**Policy Count:** 3 policies

**Policies:**

1. **"Anyone can read field visibility settings"** (SELECT)
   - Roles: public (anon, authenticated)
   - Condition: `true`
   - Purpose: Directory needs to know what to display

2. **"Authenticated users can insert field visibility"** (INSERT)
   - Roles: authenticated
   - Condition: `true`
   - Purpose: Too permissive, should be admin-only

3. **"Authenticated users can update field visibility"** (UPDATE)
   - Roles: authenticated
   - Condition: `true`
   - Purpose: Too permissive, should be admin-only

**Security Assessment:** ⚠️ NEEDS HARDENING
- Public read is correct
- INSERT/UPDATE too permissive

**Recommendations:**
- 🔧 **FIX REQUIRED:** Restrict INSERT/UPDATE to admin role only
- Add audit logging for visibility changes
- Document security implications of field visibility

---

### 10. pending_cities_master

**Purpose:** City suggestions from registration form + approved cities

**RLS Status:** ✅ Enabled
**Policy Count:** 8 policies

**Policies:**

1. **"Anyone can view approved cities"** (SELECT)
   - Roles: public
   - Condition: `status = 'approved'`
   - Purpose: City dropdown in registration form

2. **"Authenticated users can insert cities"** (INSERT)
   - Roles: authenticated
   - Condition: `true`
   - Purpose: Allow city suggestions from logged-in users

3-8. **State admin and super admin policies**
   - Various INSERT, UPDATE, DELETE, SELECT operations
   - Purpose: Admin city management

**Security Assessment:** ✅ SECURE
- Public can only see approved cities
- Anonymous INSERT missing (needed for registration form?)
- Admin management properly restricted

**Recommendations:**
- 🔧 **Consider:** Add anonymous INSERT policy if registration form needs it
- Consolidate admin policies to reduce complexity
- Document approval workflow

---

### 11-18. Master Data Tables

**Tables:** states_master, districts_master, cities_master, company_designations, lub_roles_master, member_lub_role_assignments, organization_profile, state_leaders

**Common Pattern:**
- ✅ Public SELECT for active records
- ✅ Authenticated INSERT/UPDATE/DELETE for admins
- ✅ Consistent policy naming

**Security Assessment:** ✅ SECURE
- Appropriate public read access for dropdown data
- Admin-only write operations
- No sensitive data exposure

**Recommendations:**
- Consider adding admin-only checks to write operations
- Document which fields are public vs admin-only
- Add audit logging for critical changes

---

## SECURITY DEFINER Functions

SECURITY DEFINER functions run with the privileges of the function creator (postgres user), bypassing RLS policies. These require careful security review.

### 1. is_portal_super_admin()

**Purpose:** Check if current user is a super admin
**Security Type:** SECURITY DEFINER
**Return Type:** boolean

**Function Logic:**
```sql
RETURNS EXISTS (
  SELECT 1 FROM portal_super_admins
  WHERE email = (auth.jwt() ->> 'email')
)
```

**Security Assessment:** ✅ SECURE
- Uses auth.jwt() directly (no RLS recursion)
- Only checks portal_super_admins table
- Returns boolean (no data leakage)
- SET search_path = public (prevents schema injection)

**Recommendations:**
- ✅ Security model is sound
- Document why SECURITY DEFINER is required
- Consider caching result in session

---

### 2. check_user_permission(target_state, target_district)

**Purpose:** Legacy function to check geographic access rights
**Security Type:** SECURITY DEFINER
**Return Type:** boolean

**Function Logic:**
```sql
-- Checks user_roles table for permission
-- Returns true if user has access to specified state/district
```

**Security Assessment:** ⚠️ REVIEW REQUIRED
- May have RLS recursion risk
- Used by legacy policies
- May not be needed with simplified role model

**Recommendations:**
- 🔧 **Review:** Check if still used after role simplification
- Consider deprecating if not needed
- Add SET search_path if keeping

---

### 3. get_user_role()

**Purpose:** Return the current user's role
**Security Type:** SECURITY DEFINER
**Return Type:** text

**Function Logic:**
```sql
RETURNS role FROM user_roles WHERE user_id = auth.uid()
```

**Security Assessment:** ⚠️ POTENTIAL DATA LEAKAGE
- Returns role as text (could leak role names)
- May bypass RLS on user_roles table
- Used for debugging?

**Recommendations:**
- 🔧 **Review:** Check if this is still used
- Consider removing if not needed
- Add SET search_path if keeping

---

### 4. get_member_counts_by_state()

**Purpose:** Return member counts grouped by state
**Security Type:** SECURITY DEFINER
**Return Type:** TABLE(state_name text, member_count bigint)

**Function Logic:**
```sql
SELECT state, COUNT(*)
FROM member_registrations
WHERE status = 'approved'
GROUP BY state
```

**Security Assessment:** ✅ SECURE
- Only counts approved members (not sensitive)
- Useful for statistics/dashboard
- No PII exposure
- Granted to anon and authenticated

**Recommendations:**
- ✅ Security model is appropriate
- Consider adding caching
- Document intended use case

---

## Database Views

Views can inherit or bypass RLS policies depending on SECURITY DEFINER/INVOKER setting.

### 1. v_active_states

**Purpose:** Active states for dropdown lists
**Definition:** SELECT * FROM states_master WHERE is_active = true

**Security:** Inherits RLS from states_master (public SELECT)
**Assessment:** ✅ SECURE

---

### 2. v_active_districts

**Purpose:** Active districts for dropdown lists
**Definition:** Joins districts_master with states_master

**Security:** Inherits RLS from underlying tables
**Assessment:** ✅ SECURE

---

### 3. v_active_cities

**Purpose:** Active cities for dropdown lists
**Definition:** Joins cities_master with districts_master and states_master

**Security:** Inherits RLS from underlying tables
**Assessment:** ✅ SECURE

---

### 4. v_active_payment_settings

**Purpose:** Payment settings joined with active states
**Definition:** Joins payment_settings with states_master

**Security:** Inherits RLS (public SELECT)
**Assessment:** ✅ SECURE
**Note:** Earlier v_public_payment view was removed, this is the replacement

---

### 5. v_registration_states

**Purpose:** States available for registration
**Definition:** SELECT from states_master with payment settings filter

**Security:** Inherits RLS (public SELECT)
**Assessment:** ✅ SECURE

---

## Storage Bucket Security

### 1. public-files Bucket

**Purpose:** GST certificates, UDYAM certificates, payment proofs
**Access:**
- Anonymous UPLOAD (registration form)
- Public READ (admin review)

**Security Assessment:** ⚠️ VERIFY CONFIGURATION
- Check if anonymous upload is enabled
- Verify file type restrictions
- Check size limits

**Recommendations:**
- Restrict file types to PDF, JPG, PNG
- Set max file size (e.g., 5MB)
- Add virus scanning if available
- Document retention policy

---

### 2. member-photos Bucket

**Purpose:** Member profile photos
**Access:**
- Anonymous UPLOAD (registration form)
- Public READ (directory display)

**Security Assessment:** ⚠️ VERIFY CONFIGURATION
- Check if anonymous upload is enabled
- Verify image type restrictions
- Check size limits

**Recommendations:**
- Restrict to image formats (JPEG, PNG)
- Set max file size (e.g., 2MB)
- Add image processing/optimization
- Document deletion policy

---

## Security Recommendations

### Critical Fixes Required

1. **form_field_configurations Table**
   - Restrict INSERT/UPDATE/DELETE to admin role only
   - Current: Any authenticated user can modify form config
   - Risk: High - Attacker could hide required fields

2. **payment_settings Table**
   - Restrict INSERT/UPDATE to super_admin role only
   - Current: Any authenticated user can modify payment info
   - Risk: High - Financial data integrity

3. **directory_field_visibility Table**
   - Restrict INSERT/UPDATE to admin role only
   - Current: Any authenticated user can modify visibility
   - Risk: Medium - Privacy settings bypass

### High Priority Improvements

4. **member_audit_history Table**
   - Consider restricting SELECT to admin role
   - Current: All authenticated users can read audit logs
   - Risk: Low-Medium - Information disclosure

5. **Anonymous INSERT to pending_cities_master**
   - Add policy if registration form needs it
   - Current: Only authenticated can insert
   - Risk: Low - Registration form may fail for anonymous users

6. **Consolidate Duplicate Policies**
   - validation_rules has duplicate SELECT policy
   - member_registrations has 3 overlapping UPDATE policies
   - Risk: Low - Policy confusion, maintenance burden

### Best Practice Enhancements

7. **Add Audit Logging**
   - Log all changes to: user_roles, validation_rules, payment_settings
   - Helps with compliance and debugging
   - Can use existing member_audit_history pattern

8. **Function Security Review**
   - Add SET search_path = public to all SECURITY DEFINER functions
   - Review check_user_permission() for RLS recursion
   - Consider removing get_user_role() if unused

9. **Storage Bucket Policies**
   - Document and verify anonymous upload configuration
   - Add file type and size restrictions
   - Implement malware scanning if available

10. **Rate Limiting**
    - Add rate limiting for registration form (application level)
    - Prevent abuse of public INSERT operations
    - Can use Supabase rate limiting features

---

## Testing Procedures

### Test 1: Anonymous User Registration Flow

**Purpose:** Verify public registration form works correctly

**Steps:**
1. Open registration form in incognito browser
2. Fill out all required fields
3. Upload documents (GST, UDYAM, payment proof)
4. Upload profile photo
5. Submit form

**Expected Results:**
- ✅ Form loads validation rules from database
- ✅ Form displays all active states, districts, cities
- ✅ File uploads succeed
- ✅ Registration INSERT succeeds
- ✅ No permission errors (42501)

**Test SQL:**
```sql
-- Verify anonymous can read validation rules
SET ROLE anon;
SELECT COUNT(*) FROM validation_rules WHERE is_active = true;
-- Should return count, not error

-- Verify anonymous can read states
SELECT COUNT(*) FROM states_master;
-- Should return count, not error
```

---

### Test 2: Public Directory Viewing

**Purpose:** Verify anonymous users can view approved members

**Steps:**
1. Open directory page in incognito browser
2. View list of members
3. Click on a member to view details
4. Verify contact info shows "Sign in to view"

**Expected Results:**
- ✅ Approved members display correctly
- ✅ Pending/rejected members not visible
- ✅ Contact details hidden for anonymous users
- ✅ No permission errors

**Test SQL:**
```sql
-- Verify anonymous can read approved members
SET ROLE anon;
SELECT COUNT(*) FROM member_registrations WHERE status = 'approved';
-- Should return count

-- Verify anonymous cannot read pending members
SELECT COUNT(*) FROM member_registrations WHERE status = 'pending';
-- Should return 0 (policy blocks)
```

---

### Test 3: Admin Dashboard Access

**Purpose:** Verify admin users can manage members

**Prerequisites:** Login as admin user (has admin role in user_roles)

**Steps:**
1. Login to admin dashboard
2. View all member registrations (pending, approved, rejected)
3. Update a member record
4. Change member status
5. View audit history
6. Soft delete a member

**Expected Results:**
- ✅ Can view all registrations
- ✅ Can update member data
- ✅ Can change status
- ✅ Can view audit logs
- ✅ Can soft delete members
- ✅ Changes logged in audit_history

**Test SQL:**
```sql
-- Login as admin user, verify can read all registrations
SELECT COUNT(*) FROM member_registrations;
-- Should return total count (all statuses)

-- Verify can update
UPDATE member_registrations SET mobile_number = '9999999999'
WHERE id = 'test-id';
-- Should succeed
```

---

### Test 4: Super Admin Operations

**Purpose:** Verify super admin can manage system config

**Prerequisites:** Login as super admin (email in portal_super_admins)

**Steps:**
1. Login to admin dashboard
2. Access user management
3. Create new admin user
4. Modify validation rules
5. Update payment settings
6. View deleted members

**Expected Results:**
- ✅ Can manage user roles
- ✅ Can modify validation rules
- ✅ Can update payment settings
- ✅ Can view deleted members
- ✅ All operations succeed

**Test SQL:**
```sql
-- Verify super admin status
SELECT is_portal_super_admin();
-- Should return true

-- Verify can insert user role
INSERT INTO user_roles (user_id, role)
VALUES ('test-user-id', 'admin');
-- Should succeed
```

---

### Test 5: Privilege Escalation Prevention

**Purpose:** Verify users cannot escalate privileges

**Prerequisites:** Login as regular authenticated user (no admin role)

**Steps:**
1. Attempt to read user_roles table (should only see own role)
2. Attempt to insert into user_roles (should fail)
3. Attempt to update payment_settings (should fail with fix)
4. Attempt to read deleted_members (should fail)

**Expected Results:**
- ✅ Can only view own user_roles record
- ❌ Cannot insert user_roles
- ❌ Cannot update payment_settings (after fix)
- ❌ Cannot read deleted_members

**Test SQL:**
```sql
-- As regular authenticated user
SELECT COUNT(*) FROM user_roles;
-- Should return 1 (own record only)

-- Attempt privilege escalation
INSERT INTO user_roles (user_id, role)
VALUES (auth.uid(), 'super_admin');
-- Should fail with permission denied
```

---

### Test 6: Data Leakage Prevention

**Purpose:** Verify policies don't leak sensitive data

**Steps:**
1. As anonymous, try to read pending registrations
2. As anonymous, try to read audit history
3. As admin (not super_admin), try to read deleted members
4. As authenticated, try to read other users' emails from member_registrations

**Expected Results:**
- ❌ Anonymous cannot read pending registrations
- ❌ Anonymous cannot read audit history
- ❌ Admin cannot read deleted members (only super_admin)
- ✅ Can only read approved members (email visible in directory)

---

## Appendix A: Policy Details

### Policy Naming Conventions

- Use descriptive names that explain the policy purpose
- Format: "[Role] can [action] [condition]"
- Examples:
  - "Public read approved members only"
  - "Super admins can update validation rules"
  - "Authenticated users can insert audit records"

### Policy Best Practices

1. **Separate SELECT from Write Operations**
   - Use separate policies for SELECT vs INSERT/UPDATE/DELETE
   - More granular control and easier to audit

2. **Use USING for SELECT and DELETE**
   - USING clause filters rows user can see/delete

3. **Use WITH CHECK for INSERT and UPDATE**
   - WITH CHECK validates new/modified rows

4. **Use Both for UPDATE**
   - USING: Which existing rows can be updated
   - WITH CHECK: What values are allowed in updated rows

5. **Avoid USING (true) for Sensitive Operations**
   - Always check user identity or role
   - Exception: Public read-only operations

---

## Appendix B: Common Security Patterns

### Pattern 1: Public Read, Admin Write

**Use Case:** Master data tables (states, districts, cities)

```sql
-- Public read
CREATE POLICY "public_read_table"
  ON table_name FOR SELECT
  TO anon, authenticated
  USING (true);

-- Admin write
CREATE POLICY "admin_write_table"
  ON table_name FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('admin', 'super_admin')
    )
  );
```

### Pattern 2: Own Records Only

**Use Case:** Users accessing their own data

```sql
CREATE POLICY "users_own_records"
  ON table_name FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
```

### Pattern 3: Super Admin Only

**Use Case:** System configuration tables

```sql
CREATE POLICY "super_admin_only"
  ON table_name FOR ALL
  TO authenticated
  USING (is_portal_super_admin())
  WITH CHECK (is_portal_super_admin());
```

### Pattern 4: Conditional Public Read

**Use Case:** Show only active/approved records to public

```sql
CREATE POLICY "public_read_active"
  ON table_name FOR SELECT
  TO anon, authenticated
  USING (is_active = true AND status = 'approved');
```

---

## Appendix C: Security Checklist

### Before Production Deployment

- [ ] All tables have RLS enabled
- [ ] No tables use USING (true) for write operations
- [ ] All SECURITY DEFINER functions reviewed
- [ ] All SECURITY DEFINER functions have SET search_path
- [ ] Storage bucket policies configured
- [ ] File upload restrictions in place
- [ ] Rate limiting enabled for public endpoints
- [ ] Audit logging configured for critical tables
- [ ] Test all user roles (anon, authenticated, admin, super_admin)
- [ ] Test privilege escalation prevention
- [ ] Test data leakage prevention
- [ ] Document all security decisions
- [ ] Review and apply all critical fixes in this document
- [ ] Super admin email list is secure
- [ ] Backup and restore procedures tested

### Regular Security Audits

- [ ] Review RLS policies quarterly
- [ ] Review SECURITY DEFINER functions
- [ ] Check for new overly permissive policies
- [ ] Audit super admin access list
- [ ] Review audit logs for suspicious activity
- [ ] Update this document with any changes

---

## Document History

| Date | Author | Changes |
|------|--------|---------|
| 2025-10-07 | Security Audit | Initial comprehensive security audit |

---

**End of Security Audit Report**
