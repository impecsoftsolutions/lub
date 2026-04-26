interface VariantConfig {
  width: number;
  height?: number;
  quality: number;
  fitWithoutTrim: 'cover' | 'scale-down';
}

interface ImagePipeline {
  transform(options: Record<string, unknown>): ImagePipeline;
  output(options: Record<string, unknown>): Promise<{ response(): Response }>;
}

interface ImagesBinding {
  input(stream: ReadableStream): ImagePipeline;
}

interface Env {
  MEDIA_ORIGINALS: R2Bucket;
  IMAGES: ImagesBinding;
}

const VARIANTS: Record<string, VariantConfig> = {
  'cover-card': { width: 640, height: 360, quality: 82, fitWithoutTrim: 'cover' },
  'cover-hero': { width: 1600, height: 900, quality: 86, fitWithoutTrim: 'cover' },
  'cover-admin': { width: 1200, height: 675, quality: 86, fitWithoutTrim: 'cover' },
  'gallery-grid': { width: 900, height: 900, quality: 84, fitWithoutTrim: 'scale-down' },
  'gallery-lightbox': { width: 1800, height: 1800, quality: 88, fitWithoutTrim: 'scale-down' },
};

function pickOutputFormat(request: Request): string {
  const accept = request.headers.get('accept') ?? '';
  if (accept.includes('image/avif')) return 'image/avif';
  if (accept.includes('image/webp')) return 'image/webp';
  return 'image/jpeg';
}

function parseTrim(url: URL) {
  const values = [
    url.searchParams.get('trim.left'),
    url.searchParams.get('trim.top'),
    url.searchParams.get('trim.width'),
    url.searchParams.get('trim.height'),
  ];
  if (values.some((value) => value === null)) {
    return null;
  }

  const [left, top, width, height] = values.map(Number);
  if ([left, top, width, height].every((value) => Number.isFinite(value) && value >= 0)) {
    return { left, top, width, height };
  }
  return null;
}

function parseRoute(url: URL) {
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length < 4 || parts[0] !== 'v1' || parts[1] !== 'activities') {
    return null;
  }
  const kind = parts[2];
  if (kind !== 'cover' && kind !== 'gallery') {
    return null;
  }
  return {
    kind,
    objectKey: decodeURIComponent(parts.slice(3).join('/')),
  };
}

function variantAllowedForKind(kind: 'cover' | 'gallery', variant: string): boolean {
  return kind === 'cover' ? variant.startsWith('cover-') : variant.startsWith('gallery-');
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405 });
    }

    const url = new URL(request.url);
    const route = parseRoute(url);
    if (!route) {
      return new Response('Not found', { status: 404 });
    }

    const variantName = url.searchParams.get('variant') ?? '';
    if (!variantName) {
      return new Response('Variant is required.', { status: 400 });
    }
    if (!variantAllowedForKind(route.kind, variantName)) {
      return new Response('Variant does not match media kind.', { status: 400 });
    }

    const variant = VARIANTS[variantName];
    if (!variant) {
      return new Response('Unknown variant.', { status: 400 });
    }

    const cache = caches.default;
    const cacheKey = new Request(request.url, request);
    const cached = await cache.match(cacheKey);
    if (cached) {
      return cached;
    }

    const object = await env.MEDIA_ORIGINALS.get(route.objectKey);
    if (!object?.body) {
      return new Response('Image not found.', { status: 404 });
    }

    const trim = parseTrim(url);
    let pipeline = env.IMAGES.input(object.body);
    if (trim) {
      pipeline = pipeline.transform({ trim });
    }

    pipeline = pipeline.transform({
      width: variant.width,
      height: variant.height,
      fit: trim ? 'scale-down' : variant.fitWithoutTrim,
      metadata: 'none',
    });

    const response = (
      await pipeline.output({
        format: pickOutputFormat(request),
        quality: variant.quality,
      })
    ).response();

    response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    response.headers.set('Vary', 'Accept');

    if (response.ok) {
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
    }

    return response;
  },
};
