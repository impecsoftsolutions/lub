# City Field Migration Guide

## Overview

This guide documents the changes made to properly handle custom city names in the member registration system. The solution separates approved cities from custom entries, making it easy for admins to distinguish between them.

## Changes Made

### 1. Database Schema

**Migration File:** `supabase/migrations/20251004144702_add_other_city_name_column.sql`

- Added `other_city_name` column to `member_registrations` table
- Type: `text`, nullable
- Purpose: Stores custom city names when users select "Other" from the city dropdown
- When `city = "Other"`, the actual custom city name is stored in `other_city_name`
- Includes index for faster lookups

### 2. City Dropdown Behavior

**Fixed duplicate "Other" option:**
- Removed hardcoded "Other" option from `supabase.ts` in `getActiveCitiesByDistrictId()` function
- "Other" is now added directly in the JSX of forms (Join.tsx and EditMemberModal.tsx)
- Result: "Other" appears exactly once at the end of the dropdown list

### 3. Registration Form (Join.tsx)

**Changes:**
- Added `other_city_name` to form state
- When "Other" is selected:
  - `city` field stores the literal text "Other"
  - `other_city_name` field stores the custom city name entered by user
- Added validation: `other_city_name` is required when `city = "Other"`
- Custom city input field shows required indicator when city is "Other"

### 4. Edit Member Modal (EditMemberModal.tsx)

**Changes:**
- Added `other_city_name` to form state
- On load: If `city = "Other"`, shows the text input field pre-populated with `other_city_name` value
- Displays both dropdown (with "Other" selected) AND text input showing custom city name
- Validation ensures `other_city_name` is provided when editing members with custom cities

### 5. Display Views

**Public View (Directory.tsx):**
- Shows only the custom city name (no "Other" prefix)
- Logic: `city === 'Other' && other_city_name ? other_city_name : city`

**Admin View (ExpandedMemberDetails.tsx):**
- Currently shows only custom city name (same as public view)
- Can be modified to show "Other (CustomCityName)" format if needed

**Search functionality:**
- Directory search now includes `other_city_name` in search terms
- Users can find members by searching their custom city names

## Data Migration

### Migration Script

**File:** `scripts/migrateCustomCities.js`

This script identifies existing records where the `city` field contains custom text (not from the approved cities list) and:

1. Moves the custom city name to `other_city_name` field
2. Sets `city` field to "Other"
3. Logs all changes for audit trail

### Running the Migration

**Prerequisites:**
- Node.js installed
- Supabase credentials in `.env` file
- Database migration for `other_city_name` column already applied

**Steps:**

1. **Install dependencies** (if not already done):
   ```bash
   npm install
   ```

2. **Run the migration script**:
   ```bash
   node scripts/migrateCustomCities.js
   ```

3. **Review the output**:
   - The script will list all records that need migration
   - Shows current city name and what it will be changed to
   - Provides a summary of successful and failed migrations

**Example Output:**
```
============================================================
Custom Cities Data Migration Script
============================================================

Fetching approved cities from pending_cities_master...
Found 150 approved cities

Fetching all member registrations...
Analyzing 500 records...

Found 25 records with custom city names:
------------------------------------------------------------
1. John Doe
   Current City: "Khandala"
   Location: Pune, Maharashtra
   Will change to: city="Other", other_city_name="Khandala"

[... more records ...]

------------------------------------------------------------

Starting migration...

✓ Migrated: John Doe (Khandala)
[... more migrations ...]

============================================================
Migration Summary
============================================================
Total records processed: 25
Successfully migrated: 25
Failed: 0
============================================================

✓ Migration completed successfully!
```

### Important Notes

- **Backup first:** Consider backing up your database before running the migration
- **Idempotent:** The script is safe to run multiple times
- **No data loss:** Original city names are preserved in `other_city_name`
- **Audit trail:** All changes are logged with timestamps in `last_modified_at`

## Testing

### Test Cases

1. **Registration with approved city:**
   - Select state → district → city from dropdown
   - Verify city name is stored in `city` field
   - Verify `other_city_name` is empty or null

2. **Registration with custom city:**
   - Select state → district → "Other"
   - Enter custom city name
   - Verify `city = "Other"`
   - Verify custom name is stored in `other_city_name`

3. **Edit member with custom city:**
   - Open edit modal for member with `city = "Other"`
   - Verify dropdown shows "Other" selected
   - Verify text input shows custom city name
   - Update custom city name
   - Save and verify changes

4. **Display in Directory:**
   - Public view: Shows only custom city name (no "Other" prefix)
   - Search: Can find members by custom city name

5. **No duplicate "Other":**
   - Open any city dropdown
   - Verify "Other" appears only once at the end of the list

## Benefits

1. **Clear distinction:** Admins can easily identify custom cities vs. approved cities
2. **Data integrity:** City field contains only approved names or "Other"
3. **Better reporting:** Can filter/group by approved cities vs. custom entries
4. **Audit trail:** Clear history of which members entered custom city names
5. **User experience:** Users can still enter any city name they need
6. **Future-proof:** Easy to promote custom cities to approved list if needed

## Future Enhancements

1. **Admin display format:** Modify ExpandedMemberDetails to show "Other (CustomCityName)" for admin users
2. **Pending cities integration:** Link custom cities to pending_cities_master for approval workflow
3. **Auto-suggestions:** Show frequently entered custom cities as suggestions
4. **Bulk approval:** Admin tool to approve multiple custom cities at once
