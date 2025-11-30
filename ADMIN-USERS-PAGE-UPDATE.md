# Admin Users Page Update - Account Types and Roles Display

## Summary
Updated the Admin Users page to display proper account types with detailed admin role information and added sorting functionality for better user management.

## Changes Implemented

### 1. Enhanced Account Type Display

**Previous Behavior:**
- Showed generic badges: "Admin", "Member", "Both"
- No visibility into specific admin roles
- No support for 'general_user' account type

**New Behavior:**
- **General User**: Displays "General User" (gray badge) - users who registered but not yet approved
- **Member**: Displays "Member" (green badge) - approved members
- **Admin**: Displays actual admin role(s) from user_roles table (blue badge with Shield icon)
  - Examples: "Super Admin", "State President", "IT Division Head"
  - Multiple roles shown as comma-separated: "Super Admin, Accounts Head"
- **Both**: Displays "Member + [Admin Role]" (blue badge with Shield icon)
  - Example: "Member + Super Admin", "Member + State President"

### 2. User Roles Integration

**Data Loading:**
- Fetches user data from `users` table
- Fetches role assignments from `user_roles` table
- Joins the data to create enriched user objects with roles array

**Role Name Formatting:**
Converts database role values to human-readable names:
- `super_admin` → "Super Admin"
- `state_president` → "State President"
- `state_general_secretary` → "State General Secretary"
- `district_president` → "District President"
- `district_general_secretary` → "District General Secretary"
- `it_division_head` → "IT Division Head"
- `accounts_head` → "Accounts Head"

### 3. Sorting Functionality

**Sortable Columns:**
- **Email**: Click to sort alphabetically (A-Z or Z-A)
- **Account Type**: Click to sort by account type

**Visual Indicators:**
- Column headers are clickable and show hover state
- Active sort column displays up/down chevron icon indicating direction
- First click: Sort ascending
- Second click: Sort descending
- Click different column: Reset to ascending sort on new column

### 4. Updated Filters

Added "General User" option to the account type filter dropdown:
- All Types
- General User
- Member
- Admin
- Both

## Technical Implementation

### Interface Updates

```typescript
interface UserRole {
  id: string;
  role: string;
  state: string | null;
  district: string | null;
}

interface User {
  id: string;
  email: string;
  mobile_number: string | null;
  account_type: 'admin' | 'member' | 'both' | 'general_user';
  created_at: string;
  roles: UserRole[];
}

type SortField = 'email' | 'account_type' | null;
type SortDirection = 'asc' | 'desc';
```

### Key Functions

1. **loadUsers()**:
   - Fetches users and their roles in two queries
   - Joins data on user_id to create enriched user objects
   - Handles errors gracefully

2. **formatRoleName()**:
   - Maps database role values to display names
   - Returns original value if no mapping exists

3. **getAccountTypeDisplay()**:
   - Determines what text to display based on account_type and roles
   - Handles all four account types appropriately
   - Formats multiple roles as comma-separated list

4. **handleSort()**:
   - Toggles sort direction when same column clicked
   - Resets to ascending when new column selected
   - Updates state to trigger re-filter

5. **filterUsers()**:
   - Applies account type filter
   - Applies search term filter
   - Applies sorting based on selected field and direction

### Database Queries

**Users Query:**
```sql
SELECT id, email, mobile_number, account_type, created_at
FROM users
ORDER BY created_at DESC
```

**Roles Query:**
```sql
SELECT id, user_id, role, state, district
FROM user_roles
```

Data is then joined in JavaScript using array filters and maps.

## Visual Design

### Badge Colors
- **General User**: Gray background (`bg-gray-100 text-gray-800`)
- **Member**: Green background (`bg-green-100 text-green-800`)
- **Admin/Both**: Blue background (`bg-blue-100 text-blue-800`)

### Icons
- **General User**: Users icon
- **Member**: Users icon
- **Admin/Both**: Shield icon

### Sort Indicators
- **Active Sort Ascending**: ChevronUp icon
- **Active Sort Descending**: ChevronDown icon
- Hover effect on sortable headers for better UX

## User Experience Improvements

1. **Better Role Visibility**: Admins can now see exact roles assigned to users
2. **Quick Sorting**: Easy sorting by email or account type for faster user lookup
3. **Comprehensive Filtering**: Filter by all account types including general_user
4. **Clear Visual Hierarchy**: Color-coded badges make it easy to identify user types at a glance
5. **Detailed Information**: Shows combined role information for users with multiple roles

## Example Display Scenarios

### Scenario 1: Super Admin
- **Database**: account_type='admin', roles=['super_admin']
- **Display**: Badge shows "Super Admin" (blue with shield)

### Scenario 2: Member with Admin Role
- **Database**: account_type='both', roles=['state_president']
- **Display**: Badge shows "Member + State President" (blue with shield)

### Scenario 3: Regular Member
- **Database**: account_type='member', roles=[]
- **Display**: Badge shows "Member" (green with users icon)

### Scenario 4: Pending User
- **Database**: account_type='general_user', roles=[]
- **Display**: Badge shows "General User" (gray with users icon)

### Scenario 5: Multiple Admin Roles
- **Database**: account_type='admin', roles=['super_admin', 'accounts_head']
- **Display**: Badge shows "Super Admin, Accounts Head" (blue with shield)

## Files Modified

- `src/pages/admin/AdminUsers.tsx`: Complete rewrite of account type display and added sorting

## Build Status

✅ Project builds successfully with no errors
✅ All TypeScript types properly defined
✅ No breaking changes to existing functionality

## Testing Checklist

- [ ] General users display correctly with gray badge
- [ ] Members display correctly with green badge
- [ ] Admins display with specific role names in blue badge
- [ ] Both account types display as "Member + [Role]" in blue badge
- [ ] Multiple roles display as comma-separated list
- [ ] Email sorting works (ascending/descending)
- [ ] Account type sorting works (ascending/descending)
- [ ] Sort indicators show correct arrow direction
- [ ] Filter dropdown includes all account types
- [ ] Search works with new account types
- [ ] Users without roles show fallback text correctly
