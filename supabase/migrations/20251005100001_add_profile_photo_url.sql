/*
  # Add Profile Photo URL to Member Registrations

  1. Schema Changes
    - Add `profile_photo_url` column to `member_registrations` table
      - Type: text (nullable)
      - Purpose: Store the Supabase Storage URL for member profile photos
      - Optional field - members can register without a photo

  2. Details
    - Profile photos are stored in Supabase Storage bucket 'member-photos'
    - Photos are processed client-side: cropped to 3:4 aspect ratio, resized to 900x1200px, compressed to 200-500KB
    - Format: JPEG
    - This field is optional for both new registrations and existing member updates

  3. Migration Safety
    - Uses IF NOT EXISTS to prevent errors if column already exists
    - Existing records will have NULL for this field until photos are uploaded
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'member_registrations' AND column_name = 'profile_photo_url'
  ) THEN
    ALTER TABLE member_registrations ADD COLUMN profile_photo_url text;
  END IF;
END $$;
