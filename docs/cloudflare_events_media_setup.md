# Cloudflare Events & Activities Media Setup

This project now expects Events / Activities originals to live in a private Cloudflare R2 bucket and public display variants to be served through a Worker on `media.lub.org.in`.

## 1. Create the private R2 bucket

In Cloudflare Dashboard:

1. Go to `R2`.
2. Create bucket: `lub`
3. Keep it **private**.
4. Do **not** enable `r2.dev`.
5. Do **not** attach a public bucket custom domain.

We do not create folders manually. Object prefixes are created automatically by uploads:

- `activities/originals/cover/<activityId>/<uuid>.<ext>`
- `activities/originals/gallery/<activityId>/<uuid>.<ext>`

## 2. Create bucket-scoped R2 credentials

Create API credentials limited to bucket `lub` with:

- Object Read
- Object Write
- Object Delete

Record:

- `CF_ACCOUNT_ID`
- `CF_R2_BUCKET=lub`
- `CF_R2_ACCESS_KEY_ID`
- `CF_R2_SECRET_ACCESS_KEY`
- `CF_R2_S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com`

## 3. Enable image transformations for `lub.org.in`

In Cloudflare Dashboard:

1. Open zone `lub.org.in`
2. Go to `Images` -> `Transformations`
3. Enable transformations for the zone

This is required because public display images are transformed on demand.

## 4. Media Worker

Worker scaffold is in:

- [cloudflare/lub-media/README.md](C:/webprojects/lub/cloudflare/lub-media/README.md)
- [cloudflare/lub-media/wrangler.toml.example](C:/webprojects/lub/cloudflare/lub-media/wrangler.toml.example)
- [cloudflare/lub-media/src/index.ts](C:/webprojects/lub/cloudflare/lub-media/src/index.ts)

The Worker has been deployed with:

- R2 binding: `MEDIA_ORIGINALS` -> `lub`
- Images binding: `IMAGES`
- Route: `media.lub.org.in/*`
- Custom domain: `media.lub.org.in`

Current repo config:

- [cloudflare/lub-media/wrangler.toml](C:/webprojects/lub/cloudflare/lub-media/wrangler.toml)

Deploy command:

```bash
cd cloudflare/lub-media
npx wrangler deploy --domain media.lub.org.in
```

Verified behavior:

- A request with a valid `variant` for an existing private R2 object returns a transformed public image.
- A request without `variant` returns `400 Variant is required`.
- A request for an invalid route returns `404 Not found`.

Important:

- The Worker rejects requests without a `variant` query param.
- This is intentional so the untouched original is never served publicly.

## 5. Set Supabase Edge Function secrets

Set these in Supabase project secrets:

- `CF_ACCOUNT_ID`
- `CF_R2_BUCKET`
- `CF_R2_ACCESS_KEY_ID`
- `CF_R2_SECRET_ACCESS_KEY`
- `CF_R2_S3_ENDPOINT`
- `CF_MEDIA_PUBLIC_BASE_URL=https://media.lub.org.in`

These are used by:

- `activity-media-upload`
- `activity-media-original-download`
- `activity-media-delete`

## 6. Apply the DB migration

New migration:

- [20260420130000_activities_cloudflare_media_support.sql](C:/webprojects/lub/supabase/migrations/20260420130000_activities_cloudflare_media_support.sql)

Apply only after your local / target Supabase environment is ready.

## 7. Deploy the Supabase edge functions

Deploy:

- `activity-media-upload`
- `activity-media-original-download`
- `activity-media-delete`

## 8. What the app now expects

Activities media now works like this:

1. Admin selects an image.
2. Browser keeps local crop preview only.
3. Original file uploads to private R2 through `activity-media-upload`.
4. DB stores:
   - original object key + metadata
   - Cloudflare Worker seed URL in `cover_image_url` / `storage_url`
5. Public/admin pages append a render-time `variant` to that seed URL.
6. Admin/editor can request a short-lived original download URL.

## 9. Validation checklist

After setup:

1. Upload a new cover image in Activities admin.
2. Upload gallery images.
3. Confirm page HTML points at `media.lub.org.in` URLs.
4. Confirm admin `Download Original` works for cover and gallery.
5. Confirm original R2 objects are private.
6. Confirm `/events` and `/events/:slug` render images normally.
