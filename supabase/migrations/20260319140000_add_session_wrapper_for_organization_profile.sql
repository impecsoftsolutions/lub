/*
  # Add session-token wrapper for organization profile mutation

  1. Purpose
    - Remove remaining privileged browser upsert on organization_profile
    - Derive acting user from custom session token
    - Enforce authorization with has_permission(...) server-side
*/

-- =============================================
-- Organization profile upsert (session-token secured)
-- =============================================

CREATE OR REPLACE FUNCTION public.update_organization_profile_with_session(
  p_session_token text,
  p_profile jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
  v_profile_id uuid;
  v_existing_profile public.organization_profile%ROWTYPE;
  v_profile_row public.organization_profile%ROWTYPE;
BEGIN
  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);

  IF v_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
  END IF;

  IF NOT public.has_permission(v_actor_user_id, 'organization.profile.edit') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  IF p_profile IS NULL OR p_profile = '{}'::jsonb THEN
    RETURN jsonb_build_object('success', false, 'error', 'Profile payload is required');
  END IF;

  v_profile_id := COALESCE(
    NULLIF(p_profile->>'id', '')::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid
  );

  SELECT *
  INTO v_existing_profile
  FROM public.organization_profile
  WHERE id = v_profile_id;

  INSERT INTO public.organization_profile (
    id,
    organization_name,
    organization_logo_url,
    contact_number,
    email_address,
    address,
    social_media_handles,
    updated_at
  )
  VALUES (
    v_profile_id,
    COALESCE(NULLIF(p_profile->>'organization_name', ''), v_existing_profile.organization_name, 'Laghu Udyog Bharati'),
    COALESCE(p_profile->>'organization_logo_url', v_existing_profile.organization_logo_url),
    COALESCE(p_profile->>'contact_number', v_existing_profile.contact_number),
    COALESCE(p_profile->>'email_address', v_existing_profile.email_address),
    COALESCE(p_profile->>'address', v_existing_profile.address),
    COALESCE(p_profile->'social_media_handles', v_existing_profile.social_media_handles, '[]'::jsonb),
    now()
  )
  ON CONFLICT (id)
  DO UPDATE SET
    organization_name = COALESCE(NULLIF(p_profile->>'organization_name', ''), public.organization_profile.organization_name),
    organization_logo_url = COALESCE(p_profile->>'organization_logo_url', public.organization_profile.organization_logo_url),
    contact_number = COALESCE(p_profile->>'contact_number', public.organization_profile.contact_number),
    email_address = COALESCE(p_profile->>'email_address', public.organization_profile.email_address),
    address = COALESCE(p_profile->>'address', public.organization_profile.address),
    social_media_handles = COALESCE(p_profile->'social_media_handles', public.organization_profile.social_media_handles),
    updated_at = now()
  RETURNING *
  INTO v_profile_row;

  RETURN jsonb_build_object(
    'success', true,
    'profile', to_jsonb(v_profile_row)
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_organization_profile_with_session(text, jsonb) TO PUBLIC;
