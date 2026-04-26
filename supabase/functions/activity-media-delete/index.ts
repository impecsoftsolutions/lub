import {
  canAccessActivityMedia,
  corsHeaders,
  deleteActivityOriginal,
  getR2Client,
  getR2Config,
  isObjectKeyOwnedByActivity,
  jsonResponse,
  resolveSessionUserId,
} from '../_shared/activity-media-shared.ts';

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
    const objectKey = String(body?.object_key ?? '');

    if (!sessionToken || !activityId || !objectKey) {
      return jsonResponse({ success: false, error: 'Missing delete parameters.' }, 400);
    }

    const actorId = await resolveSessionUserId(supabaseUrl, serviceRoleKey, sessionToken);
    if (!actorId) {
      return jsonResponse({ success: false, error: 'Invalid session.' }, 200);
    }

    const allowed = await canAccessActivityMedia(supabaseUrl, serviceRoleKey, actorId, activityId);
    if (!allowed || !isObjectKeyOwnedByActivity(objectKey, activityId)) {
      return jsonResponse({ success: false, error: 'Not authorized.' }, 200);
    }

    const config = getR2Config();
    const client = getR2Client(config);
    await deleteActivityOriginal(client, config, objectKey);

    return jsonResponse({ success: true });
  } catch (error) {
    console.error('[activity-media-delete] unexpected error:', error);
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : 'Delete failed.',
    }, 500);
  }
});
