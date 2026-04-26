import {
  canDownloadActivityOriginal,
  corsHeaders,
  createOriginalDownloadUrl,
  getR2Client,
  getR2Config,
  jsonResponse,
  resolveSessionUserId,
  restSelect,
} from '../_shared/activity-media-shared.ts';

interface CoverRow {
  cover_original_object_key: string | null;
  cover_original_filename: string | null;
}

interface MediaRow {
  activity_id: string;
  original_object_key: string | null;
  original_filename: string | null;
}

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

    const body = await request.json().catch(() => ({}));
    const sessionToken = String(body?.session_token ?? '');
    const activityId = String(body?.activity_id ?? '');
    const mediaId = typeof body?.media_id === 'string' && body.media_id.trim() ? String(body.media_id) : null;

    if (!sessionToken || !activityId) {
      return jsonResponse({ success: false, error: 'Missing download parameters.' }, 400);
    }

    const actorId = await resolveSessionUserId(supabaseUrl, serviceRoleKey, sessionToken);
    if (!actorId) {
      return jsonResponse({ success: false, error: 'Invalid session.' }, 200);
    }

    const allowed = await canDownloadActivityOriginal(supabaseUrl, serviceRoleKey, actorId, activityId);
    if (!allowed) {
      return jsonResponse({ success: false, error: 'Not authorized.' }, 200);
    }

    let objectKey: string | null = null;
    let fileName: string | null = null;

    if (mediaId) {
      const rows = await restSelect<MediaRow>(
        supabaseUrl,
        serviceRoleKey,
        `activity_media?id=eq.${encodeURIComponent(mediaId)}&select=activity_id,original_object_key,original_filename&limit=1`
      );
      if (!rows || rows.length === 0 || rows[0].activity_id !== activityId) {
        return jsonResponse({ success: false, error: 'Media not found.' }, 200);
      }
      objectKey = rows[0].original_object_key;
      fileName = rows[0].original_filename;
    } else {
      const rows = await restSelect<CoverRow>(
        supabaseUrl,
        serviceRoleKey,
        `activities?id=eq.${encodeURIComponent(activityId)}&select=cover_original_object_key,cover_original_filename&limit=1`
      );
      if (!rows || rows.length === 0) {
        return jsonResponse({ success: false, error: 'Activity not found.' }, 200);
      }
      objectKey = rows[0].cover_original_object_key;
      fileName = rows[0].cover_original_filename;
    }

    if (!objectKey) {
      return jsonResponse({ success: false, error: 'Original file not available for this image.' }, 200);
    }

    const config = getR2Config();
    const client = getR2Client(config);
    const url = await createOriginalDownloadUrl(client, config, objectKey, fileName);

    return jsonResponse({ success: true, url, filename: fileName });
  } catch (error) {
    console.error('[activity-media-original-download] unexpected error:', error);
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : 'Download link failed.',
    }, 500);
  }
});
