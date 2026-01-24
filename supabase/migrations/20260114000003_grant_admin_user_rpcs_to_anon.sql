/*
  # Grant admin user RPCs to anon

  - Custom auth uses anon role; RPCs validate admin privileges internally.
*/

GRANT EXECUTE ON FUNCTION public.admin_block_unblock_user(uuid, uuid, boolean) TO anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_user_by_id(uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_user_and_purge_deleted_members(uuid, uuid) TO anon;
