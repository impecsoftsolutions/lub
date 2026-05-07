-- COD-EVENTS-BADGE-DESIGN-AND-LIVE-RENDER-063A
-- Keep badge sample analysis metadata coherent when badge reference assets change.

CREATE OR REPLACE FUNCTION public.record_event_asset_with_session(
  p_session_token text,
  p_event_id uuid,
  p_kind text,
  p_storage_path text,
  p_public_url text,
  p_label text DEFAULT NULL,
  p_byte_size integer DEFAULT NULL,
  p_mime_type text DEFAULT NULL,
  p_display_order integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
  v_event public.events%ROWTYPE;
  v_id uuid;
  v_existing uuid;
  v_meta jsonb;
BEGIN
  v_actor := public.resolve_custom_session_user_id(p_session_token);
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_session', 'error', 'Invalid session');
  END IF;

  SELECT * INTO v_event FROM public.events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'event_not_found', 'error', 'Event not found');
  END IF;

  IF NOT public.has_permission(v_actor, 'events.edit_any') THEN
    IF NOT public.has_permission(v_actor, 'events.edit_own') THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'permission_denied', 'error', 'Not authorized');
    END IF;
    IF v_event.created_by <> v_actor THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'permission_denied', 'error', 'Not authorized');
    END IF;
  END IF;

  IF p_kind NOT IN ('banner','flyer','gallery','document','badge_template','badge_sample') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_kind', 'error', 'Invalid asset kind');
  END IF;

  -- Singleton kinds (partial-unique) replace the existing row.
  IF p_kind IN ('banner','badge_template','badge_sample') THEN
    SELECT id INTO v_existing
    FROM public.event_assets
    WHERE event_id = p_event_id AND kind = p_kind
    LIMIT 1;

    IF v_existing IS NOT NULL THEN
      DELETE FROM public.event_assets WHERE id = v_existing;
    END IF;

    IF p_kind = 'banner' THEN
      UPDATE public.events
      SET banner_image_url = p_public_url,
          banner_object_key = p_storage_path,
          updated_at = now()
      WHERE id = p_event_id;
    END IF;
  END IF;

  INSERT INTO public.event_assets (
    event_id, kind, storage_path, public_url, label, byte_size, mime_type, display_order, created_by
  ) VALUES (
    p_event_id, p_kind, p_storage_path, p_public_url,
    NULLIF(trim(COALESCE(p_label, '')), ''),
    p_byte_size, p_mime_type, COALESCE(p_display_order, 0),
    v_actor
  )
  RETURNING id INTO v_id;

  IF p_kind = 'badge_sample' THEN
    v_meta := COALESCE(v_event.ai_metadata, '{}'::jsonb)
      - 'badge_design_analysis'
      - 'badge_design_analysis_error'
      - 'badge_design_analysis_updated_at';
    v_meta := jsonb_set(v_meta, '{badge_design_analysis_status}', to_jsonb('pending'::text), true);
    v_meta := jsonb_set(v_meta, '{badge_design_analysis_source_asset_id}', to_jsonb(v_id::text), true);
    UPDATE public.events
    SET ai_metadata = v_meta,
        updated_at = now()
    WHERE id = p_event_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'asset_id', v_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error_code', 'unexpected_error', 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_event_asset_with_session(text, uuid, text, text, text, text, integer, text, integer) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.delete_event_asset_with_session(
  p_session_token text,
  p_asset_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
  v_asset public.event_assets%ROWTYPE;
  v_event public.events%ROWTYPE;
  v_meta jsonb;
BEGIN
  v_actor := public.resolve_custom_session_user_id(p_session_token);
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_session', 'error', 'Invalid session');
  END IF;

  SELECT * INTO v_asset FROM public.event_assets WHERE id = p_asset_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'asset_not_found', 'error', 'Asset not found');
  END IF;

  SELECT * INTO v_event FROM public.events WHERE id = v_asset.event_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'event_not_found', 'error', 'Event not found');
  END IF;

  IF NOT public.has_permission(v_actor, 'events.edit_any') THEN
    IF NOT public.has_permission(v_actor, 'events.edit_own') THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'permission_denied', 'error', 'Not authorized');
    END IF;
    IF v_event.created_by <> v_actor THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'permission_denied', 'error', 'Not authorized');
    END IF;
  END IF;

  DELETE FROM public.event_assets WHERE id = p_asset_id;

  IF v_asset.kind = 'banner' THEN
    UPDATE public.events
    SET banner_image_url = NULL, banner_object_key = NULL, updated_at = now()
    WHERE id = v_asset.event_id;
  ELSIF v_asset.kind = 'badge_sample' THEN
    v_meta := COALESCE(v_event.ai_metadata, '{}'::jsonb)
      - 'badge_design_analysis'
      - 'badge_design_analysis_status'
      - 'badge_design_analysis_error'
      - 'badge_design_analysis_updated_at'
      - 'badge_design_analysis_source_asset_id';
    UPDATE public.events
    SET ai_metadata = v_meta,
        updated_at = now()
    WHERE id = v_asset.event_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'storage_path', v_asset.storage_path);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_event_asset_with_session(text, uuid) TO authenticated, anon;

COMMENT ON FUNCTION public.record_event_asset_with_session(text, uuid, text, text, text, text, integer, text, integer) IS
  'Registers an event asset. Badge sample uploads reset badge_design_analysis metadata to pending for analyzer follow-up.';
COMMENT ON FUNCTION public.delete_event_asset_with_session(text, uuid) IS
  'Deletes an event asset row and clears related event pointers/analysis metadata. Returns storage_path for optional async object cleanup.';

NOTIFY pgrst, 'reload schema';
