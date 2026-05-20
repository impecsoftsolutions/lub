/*
  COD-DESIGNATIONS-ALTERNATE-CONTACT-LEADERSHIP-MOBILE-PHOTO-093y (backfill fix)

  The 093 migration ran its alternate-mobile backfill before any alternate
  assignments existed, so it was a no-op.  Any alternate assignments created
  after 093 was applied (e.g. the first real alternate assignment today) are
  missing alternate_contact_mobile_snapshot even though the member's
  registration DOES have alternate_mobile.

  This migration re-runs the exact same backfill to populate the snapshot for
  all alternate rows that still have a NULL mobile snapshot but whose member
  registration has a non-empty alternate_mobile.

  Safe to run multiple times (WHERE clause guards against overwriting
  already-populated snapshots).
*/

UPDATE public.member_lub_role_assignments a
SET    alternate_contact_mobile_snapshot = NULLIF(trim(mr.alternate_mobile), ''),
       updated_at = now()
FROM   public.member_registrations mr
WHERE  a.member_id                        = mr.id
  AND  a.assignee_kind                    = 'alternate'
  AND  a.alternate_contact_mobile_snapshot IS NULL
  AND  mr.alternate_mobile                IS NOT NULL
  AND  trim(mr.alternate_mobile)          <> '';
