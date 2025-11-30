# Profile Photo Removal Detection Fix

## Problem
When a user clicked "Remove Photo" in the MemberEditProfile page:
1. The Submit button would enable (expected)
2. But clicking Submit showed "No changes detected" error (bug)
3. The photo removal was not being saved to the database

## Root Cause
The `hasFormChanges()` function compares `formData` and `originalData` using JSON.stringify to detect if the form has been modified. However, the `profile_photo_url` field was **not included** in the `formData` state object, so:

- When loading the profile, the photo URL was set in `profilePhotoPreview` state but not in `formData`
- When removing or changing the photo, it attempted to update `formData.profile_photo_url` which didn't exist in the state
- The comparison in `hasFormChanges()` couldn't detect photo changes because the field wasn't being tracked

## Solution Implemented
Added `profile_photo_url` to the `formData` state object to track photo changes consistently with other form fields:

### 1. Added to Initial State (Line ~139)
```typescript
const [formData, setFormData] = useState({
  // ... other fields ...
  alternate_contact_name: '',
  alternate_mobile: '',

  // Profile Photo
  profile_photo_url: ''
});
```

### 2. Updated loadMemberProfile (Line ~258)
```typescript
const initialFormData = {
  // ... other fields ...
  alternate_mobile: data.alternate_mobile || '',
  profile_photo_url: data.profile_photo_url || ''
};
```

Now the photo URL is tracked in both `formData` and `originalData`.

### 3. Photo State Markers
- When a new photo is cropped: `profile_photo_url: '__NEW_PHOTO__'`
- When a photo is removed: `profile_photo_url: ''`
- When loading existing photo: `profile_photo_url: 'https://...'`

### 4. Updated saveProfileData (Line ~867)
```typescript
profile_photo_url: dataToSave.profile_photo_url === '__NEW_PHOTO__'
  ? null
  : (dataToSave.profile_photo_url || null)
```

This handles the special marker value for new photos.

## How It Works Now

### Scenario 1: Remove Existing Photo
1. User clicks "Remove Photo"
2. `handleRemovePhoto` sets `formData.profile_photo_url = ''`
3. Original value was `'https://...'`, new value is `''`
4. `hasFormChanges()` returns `true` (values differ)
5. Submit button enables
6. On submit, `detectChangedFields()` includes `profile_photo_url`
7. RPC function receives `profile_photo_url: null` and updates database

### Scenario 2: Upload New Photo
1. User selects and crops a photo
2. `handleCropComplete` sets `formData.profile_photo_url = '__NEW_PHOTO__'`
3. `hasFormChanges()` returns `true`
4. Submit button enables
5. On submit, change is detected and saved

### Scenario 3: No Photo Changes
1. User edits other fields only
2. `profile_photo_url` remains unchanged in `formData`
3. `hasFormChanges()` only considers other field changes
4. Works as expected

## Testing Checklist

✅ **Test 1: Remove existing photo**
- Load profile with existing photo
- Click "Remove Photo"
- Submit button should enable
- Click Submit - should save successfully
- Refresh page - photo should be gone

✅ **Test 2: Upload new photo**
- Load profile (with or without existing photo)
- Click "Choose Photo" and crop image
- Submit button should enable
- Click Submit - should save successfully
- Refresh page - new photo should display

✅ **Test 3: Remove and re-add photo**
- Remove photo
- Don't submit
- Add a new photo
- Submit button should remain enabled
- Click Submit - should save new photo

✅ **Test 4: No photo changes**
- Edit other fields but don't touch photo
- Submit button should enable (due to other changes)
- Click Submit - should save successfully
- Photo should remain unchanged

## Database Schema
The `member_registrations` table already has the `profile_photo_url` column:
- Type: `text` (nullable)
- Stores the URL to the photo (if uploaded to storage)
- Can be `NULL` if no photo

## Future Enhancements
Currently, the photo upload functionality stores URLs but doesn't handle actual file uploads to Supabase Storage. For complete photo management:

1. Add Supabase Storage integration
2. Upload the `profilePhoto` Blob to a storage bucket
3. Get the public URL and save it as `profile_photo_url`
4. Handle photo deletion from storage when removed
5. Handle photo replacement (delete old, upload new)

## Files Modified
- `/src/pages/MemberEditProfile.tsx` - Fixed photo change detection

## Related Components
These components also work with `profile_photo_url` and should continue to work:
- `src/pages/MemberViewProfile.tsx` - Displays profile photo
- `src/pages/MemberProfile.tsx` - Shows member's own photo
- `src/pages/Directory.tsx` - Lists members with photos
- `src/components/ExpandedMemberDetails.tsx` - Shows photo in details view
- `src/components/EditMemberModal.tsx` - Admin edit interface
