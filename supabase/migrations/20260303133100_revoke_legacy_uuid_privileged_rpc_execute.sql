/*
  # Revoke execute on legacy UUID-based privileged RPCs

  1. Purpose
    - Disable the insecure browser-facing RPC signatures that trust caller-supplied actor UUIDs
    - Keep function definitions in place for safe rollback while closing the execution surface

  2. Rollout
    - Apply after the frontend has been deployed to the new *_with_session RPCs
*/

REVOKE EXECUTE ON FUNCTION public.get_admin_member_registrations(uuid, text, text, text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_admin_member_registration_by_id(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_member_registration_status(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_soft_delete_member(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_deleted_members(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_block_unblock_user(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_delete_user_by_id(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_list_custom_city_pending(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_assign_custom_city(uuid, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_add_city_approved(uuid, text, uuid, uuid, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_delete_city(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_form_field_configuration(text, boolean, boolean, uuid) FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF to_regprocedure('public.admin_restore_deleted_member(uuid, uuid)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.admin_restore_deleted_member(uuid, uuid) FROM PUBLIC, anon, authenticated';
  END IF;
END;
$$;
