# Supabase Storage Setup for Member Photos

This guide explains how to set up the Supabase Storage bucket for member profile photos.

## Steps to Create the Storage Bucket

1. **Log in to Supabase Dashboard**
   - Go to https://app.supabase.com
   - Select your project

2. **Navigate to Storage**
   - Click on "Storage" in the left sidebar
   - Click on "Create a new bucket"

3. **Create the Bucket**
   - Bucket name: `member-photos`
   - Make the bucket **public** (so photos can be displayed without authentication)
   - Click "Create bucket"

4. **Configure Bucket Policies**

   The bucket needs the following policies for proper operation:

   ### Policy 1: Public Read Access (Anyone can view photos)
   ```sql
   CREATE POLICY "Public read access for member photos"
   ON storage.objects FOR SELECT
   TO public
   USING (bucket_id = 'member-photos');
   ```

   ### Policy 2: Authenticated Upload Access (Authenticated users can upload)
   ```sql
   CREATE POLICY "Authenticated users can upload member photos"
   ON storage.objects FOR INSERT
   TO authenticated
   WITH CHECK (bucket_id = 'member-photos');
   ```

   ### Policy 3: Authenticated Update Access (Authenticated users can update their uploads)
   ```sql
   CREATE POLICY "Authenticated users can update member photos"
   ON storage.objects FOR UPDATE
   TO authenticated
   USING (bucket_id = 'member-photos');
   ```

   ### Policy 4: Authenticated Delete Access (Authenticated users can delete)
   ```sql
   CREATE POLICY "Authenticated users can delete member photos"
   ON storage.objects FOR DELETE
   TO authenticated
   USING (bucket_id = 'member-photos');
   ```

5. **Apply Policies via SQL Editor**
   - Go to "SQL Editor" in the Supabase Dashboard
   - Run each policy SQL statement above
   - Verify the policies are created under Storage > Policies

## Bucket Configuration Summary

- **Bucket Name**: `member-photos`
- **Public Access**: Yes (for viewing photos)
- **File Path Format**: `YYYYMMDD-HHMMSS-[randomId].jpg`
- **Allowed Formats**: JPEG only (converted from JPG, JPEG, PNG uploads)
- **File Size**: Target 200-500KB (compressed client-side)
- **Image Dimensions**: 900x1200 pixels (3:4 aspect ratio)

## Testing the Setup

After creating the bucket and policies:

1. Try registering a new member with a profile photo
2. Verify the photo uploads successfully
3. Check that the photo displays in the member directory
4. Confirm that photos are publicly accessible via their URLs
5. Test replacing and removing photos in the edit member modal

## Troubleshooting

**If uploads fail:**
- Verify the bucket name is exactly `member-photos`
- Check that the bucket is set to public
- Ensure all four policies are created and active
- Check browser console for specific error messages

**If photos don't display:**
- Verify the bucket is public
- Check that the public read policy is active
- Verify the stored URL format in the database

## File Naming Convention

Photos are stored with the following naming pattern:
```
20251005-143022-a1b2c3d4.jpg
```

Format breakdown:
- `20251005`: Date (YYYYMMDD)
- `143022`: Time (HHMMSS)
- `a1b2c3d4`: Random 8-character ID
- `.jpg`: Always JPEG format
