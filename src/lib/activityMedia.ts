export type ActivityMediaVariant =
  | 'cover-card'
  | 'cover-hero'
  | 'cover-admin'
  | 'gallery-grid'
  | 'gallery-lightbox';

function isHttpUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://');
}

export function isActivityCloudflareSeedUrl(value: string | null | undefined): boolean {
  if (!value || !isHttpUrl(value)) return false;
  try {
    const url = new URL(value);
    return url.pathname.startsWith('/v1/activities/');
  } catch {
    return false;
  }
}

export function buildActivityMediaUrl(
  seedUrl: string | null | undefined,
  variant: ActivityMediaVariant
): string | null {
  if (!seedUrl) return null;
  if (!isActivityCloudflareSeedUrl(seedUrl)) return seedUrl;

  try {
    const url = new URL(seedUrl);
    if (variant.startsWith('cover-') && url.pathname.startsWith('/v1/activities/gallery/')) {
      url.pathname = url.pathname.replace('/v1/activities/gallery/', '/v1/activities/cover/');
    }
    url.searchParams.set('variant', variant);
    return url.toString();
  } catch {
    return seedUrl;
  }
}
