# LUB media Worker (`media.lub.org.in`)

This Worker serves public display variants for Activities media while keeping the original files private in R2.

## Bindings

- `MEDIA_ORIGINALS` -> private R2 bucket `lub-media-originals`
- `IMAGES` -> Cloudflare Images binding for Worker-side transformations

## URL contract

Stored DB seed URLs look like:

- `https://media.lub.org.in/v1/activities/cover/<encoded-object-key>?trim.left=...&trim.top=...&trim.width=...&trim.height=...`
- `https://media.lub.org.in/v1/activities/gallery/<encoded-object-key>?trim.left=...&trim.top=...&trim.width=...&trim.height=...`

The app appends a required `variant` query parameter at render time:

- `cover-card`
- `cover-hero`
- `cover-admin`
- `gallery-grid`
- `gallery-lightbox`

Requests without `variant` are rejected so the original object is never served publicly.

## Dev notes

- Use `wrangler dev --remote` to exercise the Images binding accurately.
- The Worker preview in the dashboard does not emulate image transformations.
- Configure the real custom domain / route in Cloudflare after creating `media.lub.org.in`.
