import {
  buildActivityObjectKey,
  buildDisplaySeedUrl,
  canAccessActivityMedia,
  corsHeaders,
  getR2Client,
  getR2Config,
  jsonResponse,
  normalizeTransform,
  putActivityOriginal,
  resolveSessionUserId,
} from '../_shared/activity-media-shared.ts';

const ALLOWED_MIMES = new Set(['image/jpeg', 'image/jpg', 'image/png']);
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed' }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ success: false, error: 'Supabase service configuration missing.' }, 500);
    }

    const formData = await request.formData();
    const sessionToken = String(formData.get('session_token') ?? '');
    const activityId = String(formData.get('activity_id') ?? '');
    const mediaKindRaw = String(formData.get('media_kind') ?? '');
    const file = formData.get('file');
    const transform = normalizeTransform(formData.get('transform')?.toString() ?? null);

    if (!sessionToken || !activityId || (mediaKindRaw !== 'cover' && mediaKindRaw !== 'gallery')) {
      return jsonResponse({ success: false, error: 'Missing upload parameters.' }, 400);
    }
    if (!(file instanceof File)) {
      return jsonResponse({ success: false, error: 'File upload is required.' }, 400);
    }
    if (!ALLOWED_MIMES.has(file.type)) {
      return jsonResponse({ success: false, error: 'Only JPG and PNG uploads are supported for Activities media.' }, 400);
    }
    if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
      return jsonResponse({ success: false, error: 'File size must be between 1 byte and 50 MB.' }, 400);
    }

    const actorId = await resolveSessionUserId(supabaseUrl, serviceRoleKey, sessionToken);
    if (!actorId) {
      return jsonResponse({ success: false, error: 'Invalid session.' }, 200);
    }

    const allowed = await canAccessActivityMedia(supabaseUrl, serviceRoleKey, actorId, activityId);
    if (!allowed) {
      return jsonResponse({ success: false, error: 'Not authorized.' }, 200);
    }

    const config = getR2Config();
    const client = getR2Client(config);
    const mediaKind = mediaKindRaw as 'cover' | 'gallery';
    const objectKey = buildActivityObjectKey(activityId, mediaKind, file.name, file.type);
    await putActivityOriginal(client, config, objectKey, file);

    return jsonResponse({
      success: true,
      storage_provider: 'cloudflare_r2',
      original_object_key: objectKey,
      original_filename: file.name,
      mime_type: file.type,
      bytes: file.size,
      width: null,
      height: null,
      display_url_seed: buildDisplaySeedUrl(config.publicBaseUrl, mediaKind, objectKey, transform),
    });
  } catch (error) {
    console.error('[activity-media-upload] unexpected error:', error);
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed.',
    }, 500);
  }
});
