/*
  # Compatibility wrapper for admin_delete_user_and_purge_deleted_members

  - Delegates to public.admin_delete_user_by_id
  - Keeps legacy RPC name working without introducing new audit actions
*/

CREATE OR REPLACE FUNCTION public.admin_delete_user_and_purge_deleted_members(
  p_user_id uuid,
  p_requesting_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.admin_delete_user_by_id(p_user_id, p_requesting_user_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_user_and_purge_deleted_members(uuid, uuid) TO authenticated;
