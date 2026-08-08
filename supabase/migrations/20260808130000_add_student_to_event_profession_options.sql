-- Add Student to saved event RSVP profession option lists.
-- New events receive Student from the frontend default list; this backfill keeps
-- existing configured events consistent with that default and with validation.

UPDATE public.events AS e
SET ai_metadata = jsonb_set(
  COALESCE(e.ai_metadata, '{}'::jsonb),
  '{rsvp_profession_options}',
  COALESCE(e.ai_metadata->'rsvp_profession_options', '[]'::jsonb) || jsonb_build_array('Student'),
  true
)
WHERE jsonb_typeof(e.ai_metadata->'rsvp_profession_options') = 'array'
  AND jsonb_array_length(e.ai_metadata->'rsvp_profession_options') > 0
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(e.ai_metadata->'rsvp_profession_options') AS option_item(value)
    WHERE lower(
      CASE jsonb_typeof(option_item.value)
        WHEN 'string' THEN trim(both '"' from option_item.value::text)
        WHEN 'object' THEN COALESCE(
          NULLIF(trim(option_item.value->>'label'), ''),
          NULLIF(trim(option_item.value->>'value'), '')
        )
        ELSE ''
      END
    ) = 'student'
  );
