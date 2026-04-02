/*
  # Create storage buckets for shared uploads

  1. Buckets
    - `public-files` for QR codes, logos, certificates, and payment proofs
    - `member-photos` for profile photo uploads

  2. Policies
    - Public read access for both buckets
    - Public insert access for both buckets because the app uses custom auth,
      not Supabase Auth JWTs, for browser uploads
    - Public delete access for `member-photos` so profile photo replacement works
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'public-files',
  'public-files',
  true,
  52428800,
  ARRAY[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'application/pdf'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'member-photos',
  'member-photos',
  true,
  5242880,
  ARRAY[
    'image/jpeg',
    'image/jpg',
    'image/png'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public can view public-files objects" ON storage.objects;
CREATE POLICY "Public can view public-files objects"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'public-files');

DROP POLICY IF EXISTS "Public can upload public-files objects" ON storage.objects;
CREATE POLICY "Public can upload public-files objects"
ON storage.objects
FOR INSERT
TO public
WITH CHECK (bucket_id = 'public-files');

DROP POLICY IF EXISTS "Public can view member-photos objects" ON storage.objects;
CREATE POLICY "Public can view member-photos objects"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'member-photos');

DROP POLICY IF EXISTS "Public can upload member-photos objects" ON storage.objects;
CREATE POLICY "Public can upload member-photos objects"
ON storage.objects
FOR INSERT
TO public
WITH CHECK (bucket_id = 'member-photos');

DROP POLICY IF EXISTS "Public can delete member-photos objects" ON storage.objects;
CREATE POLICY "Public can delete member-photos objects"
ON storage.objects
FOR DELETE
TO public
USING (bucket_id = 'member-photos');
