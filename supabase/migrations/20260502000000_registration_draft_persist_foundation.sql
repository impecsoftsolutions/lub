/*
  # Registration Draft Persistence Foundation

  Purpose
    Add temporary server-side draft storage for the `/join` Smart Upload
    guided flow. A draft is keyed by `user_id` (not session token) so it
    survives browser refresh / session-token rotation.

  Scope of this migration
    - New tables: registration_drafts, registration_draft_documents
    - _with_session RPC wrappers (read / upsert / delete one document)
    - RLS: deny direct browser writes; access only via SECURITY DEFINER RPCs

  Out-of-scope (deferred to follow-up slices)
    - Form snapshot persistence
    - Finalize/promote on submit
    - TTL cron cleanup
    - Storage bucket policies (configured separately)

  Storage
    Document files are written by the registration-draft-upload Edge
    Function into a private Supabase Storage bucket `registration-drafts`.
    PAN and Aadhaar are extract-only (no file persisted, only JSON).
*/

-- ============================================================
-- Tables
-- ============================================================

CREATE TABLE IF NOT EXISTS public.registration_drafts (
  id                                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                            uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status                             text NOT NULL DEFAULT 'in_progress'
                                       CHECK (status IN ('in_progress', 'finalized', 'expired')),
  last_activity_at                   timestamptz NOT NULL DEFAULT now(),
  expires_at                         timestamptz NOT NULL DEFAULT now() + interval '7 days',
  created_at                         timestamptz NOT NULL DEFAULT now(),
  updated_at                         timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS registration_drafts_user_id_active_uidx
  ON public.registration_drafts (user_id)
  WHERE status = 'in_progress';

CREATE INDEX IF NOT EXISTS registration_drafts_status_expires_at_idx
  ON public.registration_drafts (status, expires_at);

CREATE TABLE IF NOT EXISTS public.registration_draft_documents (
  id                                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id                           uuid NOT NULL REFERENCES public.registration_drafts(id) ON DELETE CASCADE,
  user_id                            uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  expected_doc_type                  text NOT NULL
                                       CHECK (expected_doc_type IN
                                         ('gst_certificate','udyam_certificate',
                                          'pan_card','aadhaar_card','payment_proof')),
  detected_doc_type                  text NULL,
  status                             text NOT NULL DEFAULT 'pending'
                                       CHECK (status IN
                                         ('pending','extracting','extracted',
                                          'unreadable','failed','skipped','no_document')),
  reason_code                        text NULL,
  is_extract_only                    boolean NOT NULL DEFAULT false,
  storage_path                       text NULL,
  file_mime                          text NULL,
  file_size_bytes                    integer NULL,
  original_filename                  text NULL,
  extracted_fields                   jsonb NOT NULL DEFAULT '{}'::jsonb,
  field_options                      jsonb NOT NULL DEFAULT '{}'::jsonb,
  selected_options                   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at                         timestamptz NOT NULL DEFAULT now(),
  updated_at                         timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS registration_draft_documents_draft_doc_type_uidx
  ON public.registration_draft_documents (draft_id, expected_doc_type);

CREATE INDEX IF NOT EXISTS registration_draft_documents_user_id_idx
  ON public.registration_draft_documents (user_id);

-- updated_at trigger helper (idempotent)
CREATE OR REPLACE FUNCTION public.tg_registration_drafts_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS registration_drafts_set_updated_at ON public.registration_drafts;
CREATE TRIGGER registration_drafts_set_updated_at
  BEFORE UPDATE ON public.registration_drafts
  FOR EACH ROW EXECUTE FUNCTION public.tg_registration_drafts_set_updated_at();

DROP TRIGGER IF EXISTS registration_draft_documents_set_updated_at ON public.registration_draft_documents;
CREATE TRIGGER registration_draft_documents_set_updated_at
  BEFORE UPDATE ON public.registration_draft_documents
  FOR EACH ROW EXECUTE FUNCTION public.tg_registration_drafts_set_updated_at();

-- ============================================================
-- RLS — deny direct browser access; route everything through
-- _with_session SECURITY DEFINER wrappers.
-- ============================================================

ALTER TABLE public.registration_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registration_draft_documents ENABLE ROW LEVEL SECURITY;

-- No policies = effectively deny-all for non-service callers.
-- The wrappers below use SECURITY DEFINER and bypass RLS.

-- ============================================================
-- Helper: ensure-active-draft for a user (internal)
-- ============================================================

CREATE OR REPLACE FUNCTION public.ensure_active_registration_draft(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_draft_id uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required';
  END IF;

  SELECT id INTO v_draft_id
  FROM public.registration_drafts
  WHERE user_id = p_user_id AND status = 'in_progress'
  LIMIT 1;

  IF v_draft_id IS NULL THEN
    INSERT INTO public.registration_drafts (user_id)
    VALUES (p_user_id)
    RETURNING id INTO v_draft_id;
  ELSE
    UPDATE public.registration_drafts
    SET last_activity_at = now(),
        expires_at = now() + interval '7 days'
    WHERE id = v_draft_id;
  END IF;

  RETURN v_draft_id;
END;
$$;

-- ============================================================
-- get_registration_draft_with_session
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_registration_draft_with_session(
  p_session_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_draft   public.registration_drafts;
  v_documents jsonb;
BEGIN
  v_user_id := public.resolve_custom_session_user_id(p_session_token);

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'global_error_code', 'invalid_session',
      'global_error', 'Invalid session'
    );
  END IF;

  SELECT * INTO v_draft
  FROM public.registration_drafts
  WHERE user_id = v_user_id AND status = 'in_progress'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'draft', NULL,
      'documents', '[]'::jsonb
    );
  END IF;

  SELECT COALESCE(jsonb_agg(d ORDER BY d.created_at), '[]'::jsonb) INTO v_documents
  FROM (
    SELECT
      id,
      expected_doc_type,
      detected_doc_type,
      status,
      reason_code,
      is_extract_only,
      storage_path,
      file_mime,
      file_size_bytes,
      original_filename,
      extracted_fields,
      field_options,
      selected_options,
      created_at,
      updated_at
    FROM public.registration_draft_documents
    WHERE draft_id = v_draft.id
    ORDER BY created_at
  ) d;

  RETURN jsonb_build_object(
    'success', true,
    'draft', jsonb_build_object(
      'id', v_draft.id,
      'status', v_draft.status,
      'last_activity_at', v_draft.last_activity_at,
      'expires_at', v_draft.expires_at,
      'created_at', v_draft.created_at,
      'updated_at', v_draft.updated_at
    ),
    'documents', v_documents
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_registration_draft_with_session(text) TO PUBLIC;

-- ============================================================
-- save_registration_draft_document_with_session (upsert)
-- ============================================================

CREATE OR REPLACE FUNCTION public.save_registration_draft_document_with_session(
  p_session_token       text,
  p_expected_doc_type   text,
  p_status              text,
  p_detected_doc_type   text    DEFAULT NULL,
  p_reason_code         text    DEFAULT NULL,
  p_is_extract_only     boolean DEFAULT false,
  p_storage_path        text    DEFAULT NULL,
  p_file_mime           text    DEFAULT NULL,
  p_file_size_bytes     integer DEFAULT NULL,
  p_original_filename   text    DEFAULT NULL,
  p_extracted_fields    jsonb   DEFAULT '{}'::jsonb,
  p_field_options       jsonb   DEFAULT '{}'::jsonb,
  p_selected_options    jsonb   DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id    uuid;
  v_draft_id   uuid;
  v_document_id uuid;
  v_expires_at timestamptz;
BEGIN
  v_user_id := public.resolve_custom_session_user_id(p_session_token);

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'global_error_code', 'invalid_session',
      'global_error', 'Invalid session'
    );
  END IF;

  IF p_expected_doc_type IS NULL OR p_expected_doc_type NOT IN
       ('gst_certificate','udyam_certificate','pan_card','aadhaar_card','payment_proof') THEN
    RETURN jsonb_build_object(
      'success', false,
      'global_error_code', 'invalid_doc_type',
      'global_error', 'Unsupported expected_doc_type'
    );
  END IF;

  IF p_status IS NULL OR p_status NOT IN
       ('pending','extracting','extracted','unreadable','failed','skipped','no_document') THEN
    RETURN jsonb_build_object(
      'success', false,
      'global_error_code', 'invalid_status',
      'global_error', 'Unsupported status'
    );
  END IF;

  v_draft_id := public.ensure_active_registration_draft(v_user_id);

  INSERT INTO public.registration_draft_documents (
    draft_id, user_id, expected_doc_type, detected_doc_type, status,
    reason_code, is_extract_only, storage_path, file_mime,
    file_size_bytes, original_filename, extracted_fields,
    field_options, selected_options
  )
  VALUES (
    v_draft_id, v_user_id, p_expected_doc_type, p_detected_doc_type, p_status,
    p_reason_code, COALESCE(p_is_extract_only, false), p_storage_path, p_file_mime,
    p_file_size_bytes, p_original_filename, COALESCE(p_extracted_fields, '{}'::jsonb),
    COALESCE(p_field_options, '{}'::jsonb), COALESCE(p_selected_options, '{}'::jsonb)
  )
  ON CONFLICT (draft_id, expected_doc_type) DO UPDATE
    SET detected_doc_type = EXCLUDED.detected_doc_type,
        status            = EXCLUDED.status,
        reason_code       = EXCLUDED.reason_code,
        is_extract_only   = EXCLUDED.is_extract_only,
        storage_path      = EXCLUDED.storage_path,
        file_mime         = EXCLUDED.file_mime,
        file_size_bytes   = EXCLUDED.file_size_bytes,
        original_filename = EXCLUDED.original_filename,
        extracted_fields  = EXCLUDED.extracted_fields,
        field_options     = EXCLUDED.field_options,
        selected_options  = EXCLUDED.selected_options,
        updated_at        = now()
  RETURNING id INTO v_document_id;

  UPDATE public.registration_drafts
  SET last_activity_at = now(),
      expires_at = now() + interval '7 days'
  WHERE id = v_draft_id
  RETURNING expires_at INTO v_expires_at;

  RETURN jsonb_build_object(
    'success', true,
    'draft_id', v_draft_id,
    'document_id', v_document_id,
    'expires_at', v_expires_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_registration_draft_document_with_session(
  text, text, text, text, text, boolean, text, text, integer, text, jsonb, jsonb, jsonb
) TO PUBLIC;

-- ============================================================
-- delete_registration_draft_document_with_session
-- ============================================================

CREATE OR REPLACE FUNCTION public.delete_registration_draft_document_with_session(
  p_session_token text,
  p_document_id   uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id      uuid;
  v_storage_path text;
  v_deleted      boolean := false;
BEGIN
  v_user_id := public.resolve_custom_session_user_id(p_session_token);

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'global_error_code', 'invalid_session',
      'global_error', 'Invalid session'
    );
  END IF;

  IF p_document_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'global_error_code', 'invalid_request',
      'global_error', 'document_id is required'
    );
  END IF;

  SELECT storage_path INTO v_storage_path
  FROM public.registration_draft_documents
  WHERE id = p_document_id AND user_id = v_user_id;

  IF NOT FOUND THEN
    -- Idempotent: treat missing as success.
    RETURN jsonb_build_object(
      'success', true,
      'released_storage_path', NULL,
      'deleted', false
    );
  END IF;

  DELETE FROM public.registration_draft_documents
  WHERE id = p_document_id AND user_id = v_user_id;

  v_deleted := FOUND;

  -- Refresh draft activity even on delete so the user's session
  -- "stays warm".
  UPDATE public.registration_drafts d
  SET last_activity_at = now()
  WHERE d.user_id = v_user_id AND d.status = 'in_progress';

  RETURN jsonb_build_object(
    'success', true,
    'released_storage_path', v_storage_path,
    'deleted', v_deleted
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_registration_draft_document_with_session(text, uuid) TO PUBLIC;

COMMENT ON FUNCTION public.get_registration_draft_with_session(text) IS
  'Read the active registration draft + its documents for the user resolved from the custom session token.';
COMMENT ON FUNCTION public.save_registration_draft_document_with_session(text, text, text, text, text, boolean, text, text, integer, text, jsonb, jsonb, jsonb) IS
  'Upsert a single registration draft document (one row per expected_doc_type per draft). Auto-creates the active draft if missing.';
COMMENT ON FUNCTION public.delete_registration_draft_document_with_session(text, uuid) IS
  'Delete a single registration draft document for the resolved user. Idempotent. Returns storage_path so caller can clean up storage objects.';
