-- Keep named Gender and Meal Preference buckets ahead of the Not specified
-- bucket, regardless of response count. The function signature stays intact.

CREATE OR REPLACE FUNCTION public.get_public_event_report_rows(
  p_view_token text,
  p_field_keys text[] DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_sort_key text DEFAULT NULL,
  p_sort_direction text DEFAULT 'asc'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_event_id uuid;
  v_report public.event_public_reports%ROWTYPE;
  v_current_keys text[];
  v_effective_keys text[];
  v_current_fields jsonb;
  v_rows jsonb;
  v_total bigint := 0;
  v_fetch_limit integer;
  v_truncated boolean := false;
  v_summaries jsonb := '[]'::jsonb;
  v_sort_key text := NULLIF(lower(btrim(COALESCE(p_sort_key, ''))), '');
  v_sort_direction text := lower(btrim(COALESCE(p_sort_direction, 'asc')));
BEGIN
  SELECT s.event_id
  INTO v_event_id
  FROM public.event_public_report_view_sessions s
  WHERE s.view_token = lower(btrim(COALESCE(p_view_token, '')))
    AND s.expires_at > now();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'view_session_invalid', 'error', 'Report session expired');
  END IF;

  SELECT * INTO v_report
  FROM public.event_public_reports
  WHERE event_id = v_event_id;

  IF NOT FOUND OR NOT v_report.is_enabled THEN
    DELETE FROM public.event_public_report_view_sessions
    WHERE view_token = lower(btrim(COALESCE(p_view_token, '')));
    RETURN jsonb_build_object('success', false, 'error_code', 'report_disabled', 'error', 'This report is not currently available');
  END IF;

  SELECT
    array_agg(f.field_key ORDER BY f.display_order),
    COALESCE(
      jsonb_agg(jsonb_build_object('key', f.field_key, 'label', f.label) ORDER BY f.display_order),
      '[]'::jsonb
    )
  INTO v_current_keys, v_current_fields
  FROM public.event_report_available_fields(v_event_id) f
  WHERE f.is_available
    AND f.field_key = ANY(v_report.fields);

  IF COALESCE(cardinality(v_current_keys), 0) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'fields_unavailable', 'error', 'No report fields are currently available');
  END IF;

  IF p_field_keys IS NULL THEN
    v_effective_keys := v_current_keys;
  ELSE
    IF cardinality(p_field_keys) = 0 OR EXISTS (SELECT 1 FROM unnest(p_field_keys) k WHERE k IS NULL) THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'fields_required', 'error', 'Select at least one report field');
    END IF;

    IF EXISTS (
      SELECT 1
      FROM unnest(p_field_keys) requested(field_key)
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.event_report_available_fields(v_event_id) catalog
        WHERE catalog.field_key = requested.field_key
      )
    ) THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'invalid_fields', 'error', 'Invalid report field');
    END IF;

    IF EXISTS (
      SELECT 1
      FROM unnest(p_field_keys) requested(field_key)
      WHERE NOT (requested.field_key = ANY(v_current_keys))
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'fields_changed',
        'error', 'The available report fields changed',
        'data', jsonb_build_object('fields', v_current_fields)
      );
    END IF;

    SELECT array_agg(f.field_key ORDER BY f.display_order)
    INTO v_effective_keys
    FROM public.event_report_available_fields(v_event_id) f
    WHERE f.field_key = ANY(p_field_keys);
  END IF;

  IF p_limit IS NOT NULL AND p_limit NOT IN (25, 50, 100) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_limit', 'error', 'Page size must be 25, 50, 100, or All');
  END IF;
  IF COALESCE(p_offset, 0) < 0 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_offset', 'error', 'Page offset cannot be negative');
  END IF;
  IF v_sort_direction NOT IN ('asc', 'desc') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_sort_direction', 'error', 'Sort direction must be ascending or descending');
  END IF;
  IF v_sort_key IS NOT NULL AND NOT (v_sort_key = ANY(v_effective_keys)) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_sort_key', 'error', 'Sort field is not available in this report view');
  END IF;

  v_fetch_limit := COALESCE(p_limit, 10000);

  WITH base AS MATERIALIZED (
    SELECT
      r.id,
      r.created_at,
      jsonb_build_object(
        'full_name', r.full_name,
        'email', r.email,
        'phone', r.phone,
        'company', r.company,
        'gender', r.gender,
        'meal_preference', r.meal_preference,
        'profession', r.profession,
        'designation', r.designation,
        'notes', r.notes,
        'visit_date', CASE
          WHEN COALESCE(r.visit_all_days, false) THEN 'All days'
          WHEN r.visit_date IS NOT NULL THEN r.visit_date::text
          ELSE NULL
        END,
        'badge_code', badge.badge_code
      ) AS full_row,
      NULLIF(lower(btrim(CASE v_sort_key
        WHEN 'full_name' THEN r.full_name
        WHEN 'email' THEN r.email
        WHEN 'phone' THEN r.phone
        WHEN 'company' THEN r.company
        WHEN 'gender' THEN r.gender
        WHEN 'meal_preference' THEN r.meal_preference
        WHEN 'profession' THEN r.profession
        WHEN 'designation' THEN r.designation
        WHEN 'notes' THEN r.notes
        WHEN 'visit_date' THEN CASE
          WHEN COALESCE(r.visit_all_days, false) THEN 'All days'
          WHEN r.visit_date IS NOT NULL THEN r.visit_date::text
          ELSE NULL
        END
        WHEN 'badge_code' THEN badge.badge_code
        ELSE NULL
      END)), '') AS sort_text,
      COUNT(*) OVER () AS total_count
    FROM public.event_rsvps r
    LEFT JOIN LATERAL (
      SELECT b.badge_code
      FROM public.event_badges b
      WHERE b.rsvp_id = r.id
      ORDER BY b.issued_at DESC, b.id DESC
      LIMIT 1
    ) badge ON true
    WHERE r.event_id = v_event_id
      AND r.status IN ('confirmed', 'pending', 'waitlisted')
  ), page_rows AS (
    SELECT *
    FROM base
    ORDER BY
      CASE WHEN v_sort_key IS NOT NULL AND v_sort_direction = 'asc' THEN sort_text END ASC NULLS LAST,
      CASE WHEN v_sort_key IS NOT NULL AND v_sort_direction = 'desc' THEN sort_text END DESC NULLS LAST,
      created_at ASC,
      id ASC
    LIMIT v_fetch_limit
    OFFSET COALESCE(p_offset, 0)
  )
  SELECT
    COALESCE(
      jsonb_agg(
        (
          SELECT COALESCE(jsonb_object_agg(item.key, item.value), '{}'::jsonb)
          FROM jsonb_each(page_rows.full_row) item
          WHERE item.key = ANY(v_effective_keys)
        )
        ORDER BY
          CASE WHEN v_sort_key IS NOT NULL AND v_sort_direction = 'asc' THEN page_rows.sort_text END ASC NULLS LAST,
          CASE WHEN v_sort_key IS NOT NULL AND v_sort_direction = 'desc' THEN page_rows.sort_text END DESC NULLS LAST,
          page_rows.created_at ASC,
          page_rows.id ASC
      ),
      '[]'::jsonb
    ),
    COALESCE(MAX(page_rows.total_count), (SELECT COUNT(*) FROM base))
  INTO v_rows, v_total
  FROM page_rows;

  v_truncated := p_limit IS NULL AND v_total > 10000;

  WITH summary_fields AS (
    SELECT f.field_key, f.label, f.display_order
    FROM public.event_report_available_fields(v_event_id) f
    WHERE f.is_available
      AND f.field_key = ANY(v_current_keys)
      AND f.field_key IN ('gender', 'meal_preference')
  ), summary_counts AS (
    SELECT
      'gender'::text AS field_key,
      NULLIF(lower(btrim(r.gender)), '') AS normalized_value,
      COUNT(*) AS response_count
    FROM public.event_rsvps r
    WHERE r.event_id = v_event_id
      AND r.status IN ('confirmed', 'pending', 'waitlisted')
      AND 'gender' = ANY(v_current_keys)
    GROUP BY NULLIF(lower(btrim(r.gender)), '')

    UNION ALL

    SELECT
      'meal_preference'::text AS field_key,
      NULLIF(lower(btrim(r.meal_preference)), '') AS normalized_value,
      COUNT(*) AS response_count
    FROM public.event_rsvps r
    WHERE r.event_id = v_event_id
      AND r.status IN ('confirmed', 'pending', 'waitlisted')
      AND 'meal_preference' = ANY(v_current_keys)
    GROUP BY NULLIF(lower(btrim(r.meal_preference)), '')
  ), summary_payload AS (
    SELECT
      sf.field_key,
      sf.label,
      sf.display_order,
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'value', counts.normalized_value,
              'count', counts.response_count
            )
            ORDER BY
              (counts.normalized_value IS NULL) ASC,
              counts.response_count DESC,
              counts.normalized_value ASC
          )
          FROM summary_counts counts
          WHERE counts.field_key = sf.field_key
        ),
        '[]'::jsonb
      ) AS items
    FROM summary_fields sf
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'key', payload.field_key,
        'label', payload.label,
        'items', payload.items
      )
      ORDER BY payload.display_order
    ),
    '[]'::jsonb
  )
  INTO v_summaries
  FROM summary_payload payload;

  RETURN jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'fields', (
        SELECT COALESCE(
          jsonb_agg(jsonb_build_object('key', f.field_key, 'label', f.label) ORDER BY f.display_order),
          '[]'::jsonb
        )
        FROM public.event_report_available_fields(v_event_id) f
        WHERE f.field_key = ANY(v_effective_keys)
      ),
      'rows', v_rows,
      'summaries', v_summaries,
      'total', v_total,
      'limit', p_limit,
      'offset', COALESCE(p_offset, 0),
      'sort_key', v_sort_key,
      'sort_direction', v_sort_direction,
      'truncated', v_truncated
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_event_report_rows(text, text[], integer, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_event_report_rows(text, text[], integer, integer, text, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
