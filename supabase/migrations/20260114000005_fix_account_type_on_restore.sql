/*
  # Ensure account_type updates on approved registrations and restores

  - Updates users.account_type to member when an approved registration is inserted/updated
  - Updates users.account_type to member when an approved deleted_member is restored (row deleted)
  - Includes a one-time backfill for approved registrations
*/

CREATE OR REPLACE FUNCTION public.trg_set_user_account_type_member_on_approved_registration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved' AND NEW.user_id IS NOT NULL THEN
    UPDATE public.users
    SET account_type = 'member',
        updated_at = now()
    WHERE id = NEW.user_id
      AND account_type = 'general_user';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_user_account_type_member_on_approved_registration ON public.member_registrations;

CREATE TRIGGER set_user_account_type_member_on_approved_registration
AFTER INSERT OR UPDATE ON public.member_registrations
FOR EACH ROW
EXECUTE FUNCTION public.trg_set_user_account_type_member_on_approved_registration();

CREATE OR REPLACE FUNCTION public.trg_set_user_account_type_member_on_restore_deleted_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'approved' AND OLD.user_id IS NOT NULL THEN
    UPDATE public.users
    SET account_type = 'member',
        updated_at = now()
    WHERE id = OLD.user_id
      AND account_type = 'general_user';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS set_user_account_type_member_on_restore_deleted_member ON public.deleted_members;

CREATE TRIGGER set_user_account_type_member_on_restore_deleted_member
BEFORE DELETE ON public.deleted_members
FOR EACH ROW
EXECUTE FUNCTION public.trg_set_user_account_type_member_on_restore_deleted_member();

-- One-time backfill for approved registrations
UPDATE public.users u
SET account_type = 'member',
    updated_at = now()
FROM public.member_registrations mr
WHERE mr.user_id = u.id
  AND mr.status = 'approved'
  AND u.account_type = 'general_user';
