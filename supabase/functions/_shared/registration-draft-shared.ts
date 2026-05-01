// Shared helpers for registration-draft-* Edge Functions.
// Keeps Supabase service-role client + session resolution + storage
// path conventions in one place so individual functions stay thin.

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

export const REGISTRATION_DRAFTS_BUCKET = 'registration-drafts';

export const ALLOWED_DOC_TYPES = new Set([
  'gst_certificate',
  'udyam_certificate',
  'pan_card',
  'aadhaar_card',
  'payment_proof',
]);

export const EXTRACT_ONLY_TYPES = new Set(['pan_card', 'aadhaar_card']);

export const STORABLE_DOC_TYPES = new Set([
  'gst_certificate',
  'udyam_certificate',
  'payment_proof',
]);

export const MAX_DRAFT_UPLOAD_BYTES = 25 * 1024 * 1024;

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function getServiceConfig(): { supabaseUrl: string; serviceRoleKey: string } {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase service configuration missing.');
  }
  return { supabaseUrl, serviceRoleKey };
}

export async function resolveSessionUserId(
  supabaseUrl: string,
  serviceRoleKey: string,
  sessionToken: string,
): Promise<string | null> {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/resolve_custom_session_user_id`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ p_session_token: sessionToken }),
  });
  if (!response.ok) {
    console.warn('[registration-draft] resolve_custom_session_user_id failed:', response.status);
    return null;
  }
  const value = await response.json();
  if (typeof value === 'string' && value.length > 0) return value;
  return null;
}

export interface SaveDocumentParams {
  expectedDocType: string;
  status: string;
  detectedDocType?: string | null;
  reasonCode?: string | null;
  isExtractOnly: boolean;
  storagePath?: string | null;
  fileMime?: string | null;
  fileSizeBytes?: number | null;
  originalFilename?: string | null;
  extractedFields?: Record<string, unknown>;
  fieldOptions?: Record<string, unknown>;
  selectedOptions?: Record<string, unknown>;
}

export async function saveDraftDocumentRpc(
  supabaseUrl: string,
  serviceRoleKey: string,
  sessionToken: string,
  params: SaveDocumentParams,
): Promise<Record<string, unknown> | null> {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/rpc/save_registration_draft_document_with_session`,
    {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        p_session_token: sessionToken,
        p_expected_doc_type: params.expectedDocType,
        p_status: params.status,
        p_detected_doc_type: params.detectedDocType ?? null,
        p_reason_code: params.reasonCode ?? null,
        p_is_extract_only: params.isExtractOnly,
        p_storage_path: params.storagePath ?? null,
        p_file_mime: params.fileMime ?? null,
        p_file_size_bytes: params.fileSizeBytes ?? null,
        p_original_filename: params.originalFilename ?? null,
        p_extracted_fields: params.extractedFields ?? {},
        p_field_options: params.fieldOptions ?? {},
        p_selected_options: params.selectedOptions ?? {},
      }),
    },
  );
  if (!response.ok) {
    console.warn('[registration-draft] save_registration_draft_document_with_session failed:', response.status, await response.text());
    return null;
  }
  return (await response.json()) as Record<string, unknown>;
}

export function guessExtension(fileName: string, mimeType: string): string {
  const fromName = fileName.split('.').pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  switch (mimeType) {
    case 'application/pdf': return 'pdf';
    case 'image/png': return 'png';
    case 'image/jpeg':
    case 'image/jpg': return 'jpg';
    case 'image/webp': return 'webp';
    default: return 'bin';
  }
}

export function buildDraftStoragePath(
  userId: string,
  docType: string,
  fileName: string,
  mimeType: string,
): string {
  const ext = guessExtension(fileName, mimeType);
  return `${userId}/${docType}/${crypto.randomUUID()}.${ext}`;
}

export async function uploadToDraftBucket(
  supabaseUrl: string,
  serviceRoleKey: string,
  storagePath: string,
  file: File,
): Promise<{ ok: boolean; status: number; error?: string }> {
  const url = `${supabaseUrl}/storage/v1/object/${REGISTRATION_DRAFTS_BUCKET}/${storagePath}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': file.type || 'application/octet-stream',
      'x-upsert': 'true',
    },
    body: file,
  });
  if (!response.ok) {
    const text = await response.text();
    console.warn('[registration-draft] storage upload failed:', response.status, text);
    return { ok: false, status: response.status, error: text };
  }
  return { ok: true, status: response.status };
}

export async function deleteFromDraftBucket(
  supabaseUrl: string,
  serviceRoleKey: string,
  storagePath: string,
): Promise<{ ok: boolean; status: number }> {
  const url = `${supabaseUrl}/storage/v1/object/${REGISTRATION_DRAFTS_BUCKET}/${storagePath}`;
  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });
  if (!response.ok && response.status !== 404) {
    const text = await response.text();
    console.warn('[registration-draft] storage delete failed:', response.status, text);
    return { ok: false, status: response.status };
  }
  return { ok: true, status: response.status };
}

export async function deleteDraftDocumentRpc(
  supabaseUrl: string,
  serviceRoleKey: string,
  sessionToken: string,
  documentId: string,
): Promise<{ success: boolean; released_storage_path: string | null }> {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/rpc/delete_registration_draft_document_with_session`,
    {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        p_session_token: sessionToken,
        p_document_id: documentId,
      }),
    },
  );
  if (!response.ok) {
    console.warn('[registration-draft] delete RPC failed:', response.status, await response.text());
    return { success: false, released_storage_path: null };
  }
  const data = (await response.json()) as { success?: boolean; released_storage_path?: string | null };
  return {
    success: Boolean(data.success),
    released_storage_path: data.released_storage_path ?? null,
  };
}
