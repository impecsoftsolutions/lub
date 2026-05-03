-- 041 hotfix: avoid direct DELETE on storage.objects from SQL RPC
-- Supabase protects direct table deletes; object deletion must go via Storage API.

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
  END IF;

  RETURN jsonb_build_object('success', true, 'storage_path', v_asset.storage_path);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_event_asset_with_session(text, uuid) TO authenticated, anon;

COMMENT ON FUNCTION public.delete_event_asset_with_session(text, uuid) IS
  'Deletes an event asset row and clears events.banner_* when kind=banner. Returns storage_path for optional async object cleanup via Storage API.';