// =============================================================================
// Edge Function: showcase-photo-upload
//
// Accepts a multipart form upload with:
//   session_token — custom auth session token
//   file          — image file (JPEG, PNG, WebP; max 5 MB)
//   listing_id    — optional: existing listing id (for replacement)
//
// Validates the custom member session, confirms the member is approved,
// uploads the image to Supabase Storage under showcase-photos/<userId>/<uuid>.<ext>,
// and returns the public URL. The AI API key is never exposed; no Supabase JWT
// is needed from the browser.
// =============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const BUCKET = 'showcase-photos';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function toStringValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function guessExtension(mimeType: string): string {
  switch (mimeType) {
    case 'image/png':  return 'png';
    case 'image/webp': return 'webp';
    default:           return 'jpg';
  }
}

async function rpcCall<T>(
  supabaseUrl: string,
  serviceRoleKey: string,
  fnName: string,
  params: Record<string, unknown>,
): Promise<T | null> {
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/${fnName}`, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      console.warn(`[showcase-photo-upload] rpc ${fnName} ${res.status}: ${await res.text()}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`[showcase-photo-upload] rpc ${fnName} exception:`, err);
    return null;
  }
}

interface ApprovedCheckRow {
  status: string;
  is_active: boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed' }, 405);
  }

  const supabaseUrl    = Deno.env.get('SUPABASE_URL')?.trim();
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[showcase-photo-upload] Missing env vars');
    return jsonResponse({ success: false, error: 'Service not configured.' }, 500);
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return jsonResponse({ success: false, error: 'Invalid form data.' }, 400);
  }

  const sessionToken = toStringValue(formData.get('session_token'));
  const file = formData.get('file');

  if (!sessionToken) {
    return jsonResponse({ success: false, error: 'session_token is required.', error_code: 'session_invalid' });
  }
  if (!(file instanceof File)) {
    return jsonResponse({ success: false, error: 'file is required.' }, 400);
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return jsonResponse({ success: false, error: 'Only JPEG, PNG, and WebP images are allowed.' }, 400);
  }
  if (file.size <= 0 || file.size > MAX_BYTES) {
    return jsonResponse({ success: false, error: 'File must be between 1 byte and 5 MB.' }, 400);
  }

  // Validate session
  const userId = await rpcCall<string | null>(
    supabaseUrl, serviceRoleKey,
    'resolve_custom_session_user_id',
    { p_session_token: sessionToken },
  );
  if (!userId || typeof userId !== 'string') {
    return jsonResponse({ success: false, error: 'Session invalid or expired.', error_code: 'session_invalid' });
  }

  // Check member is approved
  const registrationRows = await (async () => {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/member_registrations?member_id=eq.${encodeURIComponent(userId)}&select=status,is_active&order=created_at.desc&limit=1`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          Accept: 'application/json',
        },
      },
    );
    if (!res.ok) return null;
    return (await res.json()) as ApprovedCheckRow[];
  })();

  const isApproved = Array.isArray(registrationRows)
    && registrationRows.length > 0
    && registrationRows[0].status === 'approved'
    && registrationRows[0].is_active === true;

  if (!isApproved) {
    return jsonResponse({
      success: false,
      error: 'Only approved paid LUB members can upload showcase photos.',
      error_code: 'not_approved_member',
    });
  }

  // Upload to Supabase Storage
  const ext         = guessExtension(file.type);
  const objectPath  = `${userId}/${crypto.randomUUID()}.${ext}`;
  const body        = await file.arrayBuffer();

  const uploadRes = await fetch(
    `${supabaseUrl}/storage/v1/object/${BUCKET}/${objectPath}`,
    {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': file.type,
        'x-upsert': 'false',
      },
      body,
    },
  );

  if (!uploadRes.ok) {
    const errBody = await uploadRes.text();
    console.error('[showcase-photo-upload] storage upload failed:', uploadRes.status, errBody);
    return jsonResponse({ success: false, error: 'Photo upload failed. Please try again.' }, 500);
  }

  const publicUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${objectPath}`;

  return jsonResponse({ success: true, url: publicUrl });
});
