/*
  # COD-EVENTS-BANNER-PUBLIC-COMPRESS-046
  - Surface events.banner_image_url in the public listing RPC so the
    Events listing card can render the uploaded banner.
  - Additive only; no schema changes.
*/

CREATE OR REPLACE FUNCTION public.get_published_events(
  p_limit integer DEFAULT 12,
  p_offset integer DEFAULT 0,
  p_session_token text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_include_member_only boolean := false;
  v_rows jsonb;
  v_total integer;
BEGIN
  IF p_session_token IS NOT NULL AND length(trim(p_session_token)) > 0 THEN
    v_actor_id := public.resolve_custom_session_user_id(p_session_token);
    IF v_actor_id IS NOT NULL THEN
      v_include_member_only := public.is_member_or_both_account(v_actor_id);
    END IF;
  END IF;

  SELECT COUNT(*)::integer
  INTO v_total
  FROM public.events e
  WHERE e.status = 'published'
    AND (e.visibility = 'public' OR (v_include_member_only AND e.visibility = 'member_only'));

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      e.id,
      e.slug,
      e.title,
      e.excerpt,
      e.description,
      e.event_type,
      e.visibility,
      e.start_at,
      e.end_at,
      e.location,
      e.is_featured,
      e.published_at,
      e.show_agenda_publicly,
      e.banner_image_url
    FROM public.events e
    WHERE e.status = 'published'
      AND (e.visibility = 'public' OR (v_include_member_only AND e.visibility = 'member_only'))
    ORDER BY e.is_featured DESC, e.start_at ASC NULLS LAST, e.published_at DESC
    LIMIT GREATEST(p_limit, 0)
    OFFSET GREATEST(p_offset, 0)
  ) t;

  RETURN jsonb_build_object(
    'success', true,
    'data', v_rows,
    'total', v_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_published_events(integer, integer, text)
  TO anon, authenticated;
