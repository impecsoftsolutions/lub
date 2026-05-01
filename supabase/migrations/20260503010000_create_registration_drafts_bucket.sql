/*
  # Create registration-drafts storage bucket

  Purpose:
  - Back Smart Upload temporary draft file persistence.
  - Keep bucket private; files are accessed via edge functions using service-role.

  Notes:
  - No public storage.objects policies are created for this bucket.
  - File size limit matches registration-draft-upload edge function guard (25 MB).
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'registration-drafts',
  'registration-drafts',
  false,
  26214400,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

