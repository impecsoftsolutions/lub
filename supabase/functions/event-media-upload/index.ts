// =============================================================================
// Edge Function: event-media-upload
// Slice: COD-EVENTS-REGISTRATION-MEDIA-041
//
// Accepts multipart/form-data with:
//   session_token : custom session token (REQUIRED)
//   event_id      : target event UUID (REQUIRED)
//   kind          : 'banner' | 'flyer' | 'gallery' | 'document' (REQUIRED)
//   label         : optional display label (used for documents)
//   file          : the binary File to upload (REQUIRED)
//
// Behavior:
//   - Validates session and that the actor has events.edit_any (or
//     events.edit_own when they own the event).
//   - Validates MIME against allowed sets per kind.
//   - Uploads bytes to the Supabase Storage bucket `event-assets` at
//     events/{event_id}/{kind}/{nanoid}-{safeName}
//   - Calls public.record_event_asset_with_session to register the row
//     (which also replaces existing banner if kind='banner').
//
// Returns (HTTP 200):
//   { success: true, asset_id, public_url, storage_path, kind }
// On failure:
//   { success: false, error, error_code? }
// =============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const IMAGE_MIMES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const DOC_MIMES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg',
  'image/jpg',
  'image/png',
]);

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;     // 8 MB per image
const MAX_DOC_BYTES = 25 * 1024 * 1024;      // 25 MB per document

const VALID_KINDS = new Set(['banner', 'flyer', 'gallery', 'document']);

function safeFilename(name: string): string {
  const cleaned = name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return cleaned || 'file';
}

function nanoid(len = 8): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < len; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

async function rpc(supabaseUrl: string, key: string, fn: string, params: Record<string, unknown>) {
  const resp = await fetch(`${supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(params),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`rpc ${fn} failed: ${resp.status} ${txt}`);
  }
  return await resp.json();
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim() ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() ?? '';
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ success: false, error: 'Service configuration missing.' }, 500);
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return jsonResponse({ success: false, error: 'Invalid multipart payload.' }, 400);
  }

  const sessionToken = String(formData.get('session_token') ?? '').trim();
  const eventId = String(formData.get('event_id') ?? '').trim();
  const kind = String(formData.get('kind') ?? '').trim().toLowerCase();
  const label = String(formData.get('label') ?? '').trim();
  const file = formData.get('file');

  if (!sessionToken) return jsonResponse({ success: false, error: 'Session token required.', error_code: 'session_invalid' });
  if (!eventId) return jsonResponse({ success: false, error: 'event_id required.', error_code: 'invalid_event_id' });
  if (!VALID_KINDS.has(kind)) return jsonResponse({ success: false, error: 'Invalid kind.', error_code: 'invalid_kind' });
  if (!(file instanceof File)) return jsonResponse({ success: false, error: 'A file is required.', error_code: 'file_required' });

  const isDoc = kind === 'document';
  const allowedMimes = isDoc ? DOC_MIMES : IMAGE_MIMES;
  if (!allowedMimes.has(file.type)) {
    return jsonResponse({
      success: false,
      error: isDoc
        ? 'Unsupported document type. Allowed: PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, JPEG, PNG.'
        : 'Unsupported image type. Allowed: JPEG, PNG, WEBP.',
      error_code: 'unsupported_format',
    });
  }

  const sizeLimit = isDoc ? MAX_DOC_BYTES : MAX_IMAGE_BYTES;
  if (file.size <= 0 || file.size > sizeLimit) {
    return jsonResponse({
      success: false,
      error: isDoc ? 'Document size must be between 1 byte and 25 MB.' : 'Image size must be between 1 byte and 8 MB.',
      error_code: 'file_too_large',
    });
  }

  const filenameSafe = safeFilename(file.name || 'upload');
  const objectPath = `events/${eventId}/${kind}/${nanoid()}-${filenameSafe}`;

  // Upload via Supabase Storage REST. Service role bypasses RLS.
  const bytes = new Uint8Array(await file.arrayBuffer());
  const uploadUrl = `${supabaseUrl}/storage/v1/object/event-assets/${objectPath}`;
  const uploadResp = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': file.type,
      'x-upsert': 'true',
      'Cache-Control': '3600',
    },
    body: bytes,
  });
  if (!uploadResp.ok) {
    const errText = await uploadResp.text();
    console.error('[event-media-upload] storage upload failed:', uploadResp.status, errText);
    return jsonResponse({
      success: false,
      error: 'Storage upload failed.',
      error_code: 'storage_upload_failed',
    });
  }

  const publicUrl = `${supabaseUrl}/storage/v1/object/public/event-assets/${objectPath}`;

  let recordResult: { success?: boolean; asset_id?: string; error?: string; error_code?: string } | null = null;
  try {
    recordResult = (await rpc(supabaseUrl, serviceRoleKey, 'record_event_asset_with_session', {
      p_session_token: sessionToken,
      p_event_id: eventId,
      p_kind: kind,
      p_storage_path: objectPath,
      p_public_url: publicUrl,
      p_label: label || null,
      p_byte_size: file.size,
      p_mime_type: file.type,
      p_display_order: 0,
    })) as typeof recordResult;
  } catch (err) {
    console.error('[event-media-upload] record rpc threw:', err);
    // Best-effort cleanup of uploaded object.
    await fetch(`${supabaseUrl}/storage/v1/object/event-assets/${objectPath}`, {
      method: 'DELETE',
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
    });
    return jsonResponse({ success: false, error: 'Failed to register asset.', error_code: 'record_failed' });
  }

  if (!recordResult?.success || !recordResult.asset_id) {
    // Best-effort cleanup if record refused (e.g., permission denied).
    await fetch(`${supabaseUrl}/storage/v1/object/event-assets/${objectPath}`, {
      method: 'DELETE',
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
    });
    return jsonResponse({
      success: false,
      error: recordResult?.error ?? 'Failed to register asset.',
      error_code: recordResult?.error_code ?? 'record_failed',
    });
  }

  return jsonResponse({
    success: true,
    asset_id: recordResult.asset_id,
    public_url: publicUrl,
    storage_path: objectPath,
    kind,
  });
});
