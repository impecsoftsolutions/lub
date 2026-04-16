/*
  # Extend approved members export RPC with optional checkbox fields

  1. Purpose
    - Preserve the existing approved-members-only export scope
    - Add optional XLSX columns for UI-side selection without changing permissions
    - Keep the same session-wrapped admin RPC contract name
*/

CREATE OR REPLACE FUNCTION public.get_admin_approved_members_export_with_session(
  p_session_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
BEGIN
  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);

  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT (
    public.has_permission(v_actor_user_id, 'members.view')
    OR public.has_permission(v_actor_user_id, 'members.view_approved')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'data', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'company_name', COALESCE(NULLIF(trim(mr.company_name), ''), '—'),
            'member_name', COALESCE(NULLIF(trim(mr.full_name), ''), '—'),
            'city', COALESCE(
              NULLIF(trim(
                CASE
                  WHEN COALESCE(mr.is_custom_city, false) THEN COALESCE(mr.other_city_name, mr.city)
                  ELSE mr.city
                END
              ), ''),
              '—'
            ),
            'district', COALESCE(NULLIF(trim(mr.district), ''), '—'),
            'mobile_number', COALESCE(NULLIF(trim(mr.mobile_number), ''), '—'),
            'email', COALESCE(NULLIF(trim(mr.email), ''), '—'),
            'member_id', COALESCE(NULLIF(trim(mr.member_id), ''), '—'),
            'company_address', COALESCE(NULLIF(trim(mr.company_address), ''), '—'),
            'gender', COALESCE(NULLIF(trim(mr.gender), ''), '—')
          )
          ORDER BY lower(COALESCE(mr.company_name, '')), lower(COALESCE(mr.full_name, ''))
        )
        FROM public.member_registrations mr
        WHERE mr.status = 'approved'
      ),
      '[]'::jsonb
    )
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_approved_members_export_with_session(text) TO PUBLIC;

COMMENT ON FUNCTION public.get_admin_approved_members_export_with_session(text) IS
  'Session-wrapped admin export contract for approved members list download with optional contact and membership fields.';
