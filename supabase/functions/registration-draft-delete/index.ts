import {
  corsHeaders,
  deleteDraftDocumentRpc,
  deleteFromDraftBucket,
  getServiceConfig,
  jsonResponse,
  resolveSessionUserId,
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

    const body = await request.json().catch(() => null) as
      | { session_token?: string; document_id?: string }
      | null;

    const sessionToken = String(body?.session_token ?? '');
    const documentId = String(body?.document_id ?? '');

    if (!sessionToken) {
      return jsonResponse({ success: false, error: 'Missing session token.' }, 400);
    }
    if (!documentId) {
      return jsonResponse({ success: false, error: 'Missing document_id.' }, 400);
    }

    const userId = await resolveSessionUserId(supabaseUrl, serviceRoleKey, sessionToken);
    if (!userId) {
      return jsonResponse({ success: false, error_code: 'invalid_session', error: 'Invalid session.' }, 200);
    }

    const rpc = await deleteDraftDocumentRpc(supabaseUrl, serviceRoleKey, sessionToken, documentId);
    if (!rpc.success) {
      return jsonResponse({ success: false, error: 'Failed to delete draft document.' }, 500);
    }

    let storageDeleted = false;
    if (rpc.released_storage_path) {
      const storage = await deleteFromDraftBucket(supabaseUrl, serviceRoleKey, rpc.released_storage_path);
      storageDeleted = storage.ok;
    }

    return jsonResponse({
      success: true,
      released_storage_path: rpc.released_storage_path,
      storage_deleted: storageDeleted,
    });
  } catch (error) {
    console.error('[registration-draft-delete] unexpected error:', error);
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : 'Delete failed.',
    }, 500);
  }
});
