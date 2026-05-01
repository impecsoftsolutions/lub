import {
  ALLOWED_DOC_TYPES,
  EXTRACT_ONLY_TYPES,
  STORABLE_DOC_TYPES,
  MAX_DRAFT_UPLOAD_BYTES,
  buildDraftStoragePath,
  corsHeaders,
  deleteFromDraftBucket,
  getServiceConfig,
  jsonResponse,
  resolveSessionUserId,
  saveDraftDocumentRpc,
  uploadToDraftBucket,
} from '../_shared/registration-draft-shared.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed' }, 405);
  }

  try {
    const { supabaseUrl, serviceRoleKey } = getServiceConfig();

    const formData = await request.formData();
    const sessionToken = String(formData.get('session_token') ?? '');
    const expectedDocType = String(formData.get('expected_doc_type') ?? '');
    const file = formData.get('file');

    if (!sessionToken) {
      return jsonResponse({ success: false, error: 'Missing session token.' }, 400);
    }
    if (!ALLOWED_DOC_TYPES.has(expectedDocType)) {
      return jsonResponse({ success: false, error: 'Unsupported expected_doc_type.' }, 400);
    }
    if (EXTRACT_ONLY_TYPES.has(expectedDocType)) {
      return jsonResponse({
        success: false,
        error_code: 'extract_only',
        error: 'This document type is extract-only and is not stored.',
      }, 400);
    }
    if (!STORABLE_DOC_TYPES.has(expectedDocType)) {
      return jsonResponse({ success: false, error: 'Doc type not storable.' }, 400);
    }
    if (!(file instanceof File)) {
      return jsonResponse({ success: false, error: 'File upload is required.' }, 400);
    }
    if (file.size <= 0 || file.size > MAX_DRAFT_UPLOAD_BYTES) {
      return jsonResponse({ success: false, error: 'File size out of bounds.' }, 400);
    }

    const userId = await resolveSessionUserId(supabaseUrl, serviceRoleKey, sessionToken);
    if (!userId) {
      return jsonResponse({ success: false, error_code: 'invalid_session', error: 'Invalid session.' }, 200);
    }

    const storagePath = buildDraftStoragePath(userId, expectedDocType, file.name, file.type);
    const upload = await uploadToDraftBucket(supabaseUrl, serviceRoleKey, storagePath, file);
    if (!upload.ok) {
      return jsonResponse({ success: false, error: 'Failed to upload draft document.' }, 500);
    }

    // Persist a pending row so a partial failure (e.g. extraction not yet
    // started) still leaves a recoverable draft document linked to storage.
    const saved = await saveDraftDocumentRpc(supabaseUrl, serviceRoleKey, sessionToken, {
      expectedDocType,
      status: 'pending',
      isExtractOnly: false,
      storagePath,
      fileMime: file.type || null,
      fileSizeBytes: file.size,
      originalFilename: file.name,
    });

    if (!saved || saved.success !== true) {
      // Roll back the storage object so we don't leak orphans on RPC failure.
      await deleteFromDraftBucket(supabaseUrl, serviceRoleKey, storagePath);
      return jsonResponse({ success: false, error: 'Failed to save draft document row.' }, 500);
    }

    return jsonResponse({
      success: true,
      draft_id: saved.draft_id ?? null,
      document_id: saved.document_id ?? null,
      expires_at: saved.expires_at ?? null,
      storage_path: storagePath,
      file_mime: file.type || null,
      file_size_bytes: file.size,
      original_filename: file.name,
    });
  } catch (error) {
    console.error('[registration-draft-upload] unexpected error:', error);
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed.',
    }, 500);
  }
});
