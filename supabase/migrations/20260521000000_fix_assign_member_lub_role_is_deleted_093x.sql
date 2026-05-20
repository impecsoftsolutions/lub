/*
  COD-DESIGNATIONS-ALTERNATE-CONTACT-LEADERSHIP-MOBILE-PHOTO-093x (hotfix)

  The admin_assign_member_lub_role function referenced column "is_deleted" on
  member_registrations, but that column does not exist. The table uses "is_active"
  (boolean) for soft-delete state.  This caused every Add Assignment attempt to
  fail with "column 'is_deleted' does not exist".

  Fix: replace the WHERE clause predicate
    (is_deleted IS NULL OR is_deleted = false)
  with
    (is_active IS NULL OR is_active = true)

  No schema changes. Only the base assign function and its session wrapper are
  recreated (the wrapper body is unchanged; it just re-declares the signature so
  PostgreSQL doesn't retain a stale cached plan).
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- Recreate admin_assign_member_lub_role (fix is_deleted → is_active)
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.admin_assign_member_lub_role(uuid, uuid, uuid, text, text, text, date, date, text, text, text, text, text);

CREATE FUNCTION public.admin_assign_member_lub_role(
  p_requesting_user_id     uuid,
  p_member_id              uuid,
  p_role_id                uuid,
  p_level                  text,
  p_state                  text    DEFAULT NULL,
  p_district               text    DEFAULT NULL,
  p_role_start_date        date    DEFAULT NULL,
  p_role_end_date          date    DEFAULT NULL,
  p_committee_year         text    DEFAULT NULL,
  p_assignee_kind          text    DEFAULT 'main',
  p_alternate_contact_name text    DEFAULT NULL,
  p_alternate_mobile       text    DEFAULT NULL,
  p_alternate_photo_url    text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_record   RECORD;
  v_member_record RECORD;
  v_role_record   RECORD;
  v_is_authorized boolean := false;
  v_assignment_id uuid;
  v_kind          text;
BEGIN
  -- ── Validate required params ───────────────────────────────────────────────
  IF p_requesting_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User ID is required');
  END IF;
  IF p_member_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Member ID is required');
  END IF;
  IF p_role_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'LUB role ID is required');
  END IF;
  IF p_level IS NULL OR p_level NOT IN ('national','state','district','city') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Level must be one of national/state/district/city');
  END IF;
  IF p_committee_year IS NOT NULL AND p_committee_year !~ '^[0-9]{4}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Committee year must be a 4-digit year (e.g., 2025)');
  END IF;
  IF p_role_start_date IS NOT NULL AND p_role_end_date IS NOT NULL THEN
    IF p_role_end_date < p_role_start_date THEN
      RETURN jsonb_build_object('success', false, 'error', 'role_end_date cannot be before role_start_date');
    END IF;
  END IF;

  -- Normalise + validate assignee_kind
  v_kind := COALESCE(p_assignee_kind, 'main');
  IF v_kind NOT IN ('main', 'alternate') THEN
    RETURN jsonb_build_object('success', false, 'error', 'assignee_kind must be main or alternate');
  END IF;
  IF v_kind = 'alternate'
     AND (p_alternate_contact_name IS NULL OR trim(p_alternate_contact_name) = '')
  THEN
    RETURN jsonb_build_object('success', false, 'error', 'alternate_contact_name is required for alternate assignments');
  END IF;

  -- ── Authenticate requester ─────────────────────────────────────────────────
  SELECT * INTO v_user_record
  FROM users
  WHERE id = p_requesting_user_id AND account_status = 'active';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found or inactive');
  END IF;

  -- ── Authorise ─────────────────────────────────────────────────────────────
  IF v_user_record.account_type IN ('admin','super_admin','both') THEN
    v_is_authorized := true;
  ELSIF EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = p_requesting_user_id
      AND ur.role IN ('super_admin','admin','editor')
  ) THEN
    v_is_authorized := true;
  END IF;

  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object('success', false, 'error', 'authorization: insufficient permissions');
  END IF;

  -- ── Validate member (FIXED: use is_active, not is_deleted) ────────────────
  SELECT * INTO v_member_record
  FROM member_registrations
  WHERE id = p_member_id AND (is_active IS NULL OR is_active = true);

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Member registration not found');
  END IF;

  -- ── Validate role ──────────────────────────────────────────────────────────
  SELECT * INTO v_role_record
  FROM lub_roles_master
  WHERE id = p_role_id AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'LUB role not found or inactive');
  END IF;

  -- ── Duplicate check (per assignee_kind) ───────────────────────────────────
  IF EXISTS (
    SELECT 1
    FROM member_lub_role_assignments a
    WHERE a.member_id     = p_member_id
      AND a.role_id       = p_role_id
      AND a.level         = p_level
      AND COALESCE(a.state, '')          = COALESCE(p_state, '')
      AND COALESCE(a.district, '')       = COALESCE(p_district, '')
      AND COALESCE(a.committee_year, '') = COALESCE(p_committee_year, '')
      AND a.assignee_kind = v_kind
      AND (
        (a.role_start_date IS NULL AND p_role_start_date IS NULL)
        OR (a.role_start_date = p_role_start_date)
      )
      AND (
        (a.role_end_date IS NULL AND p_role_end_date IS NULL)
        OR (a.role_end_date = p_role_end_date)
      )
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'An identical role assignment already exists for this member');
  END IF;

  -- ── Insert ────────────────────────────────────────────────────────────────
  INSERT INTO member_lub_role_assignments (
    member_id, role_id, level, state, district,
    role_start_date, role_end_date, committee_year,
    assignee_kind,
    alternate_contact_name_snapshot,
    alternate_contact_mobile_snapshot,
    alternate_contact_photo_url_snapshot,
    created_at, updated_at
  ) VALUES (
    p_member_id, p_role_id, p_level, p_state, p_district,
    p_role_start_date, p_role_end_date, p_committee_year,
    v_kind,
    CASE WHEN v_kind = 'alternate' THEN trim(p_alternate_contact_name) ELSE NULL END,
    CASE WHEN v_kind = 'alternate' THEN
      COALESCE(
        NULLIF(trim(p_alternate_mobile), ''),
        NULLIF(trim(COALESCE(v_member_record.alternate_mobile, '')), '')
      )
    ELSE NULL END,
    CASE WHEN v_kind = 'alternate' THEN NULLIF(trim(COALESCE(p_alternate_photo_url, '')), '')
    ELSE NULL END,
    now(), now()
  )
  RETURNING id INTO v_assignment_id;

  -- ── Audit ─────────────────────────────────────────────────────────────────
  INSERT INTO member_audit_history (member_id, action_type, changed_by, change_reason)
  VALUES (
    p_member_id,
    'assign_lub_role',
    p_requesting_user_id,
    format(
      'Assigned LUB role %s at level %s (%s)%s%s',
      v_role_record.role_name,
      p_level,
      v_kind,
      CASE WHEN p_committee_year IS NOT NULL THEN ' for year ' || p_committee_year ELSE '' END,
      CASE
        WHEN p_role_start_date IS NOT NULL AND p_role_end_date IS NOT NULL
          THEN ' (' || p_role_start_date::text || ' - ' || p_role_end_date::text || ')'
        WHEN p_role_start_date IS NOT NULL
          THEN ' (from ' || p_role_start_date::text || ')'
        WHEN p_role_end_date IS NOT NULL
          THEN ' (until ' || p_role_end_date::text || ')'
        ELSE ''
      END
    )
  );

  RETURN jsonb_build_object('success', true, 'assignment_id', v_assignment_id);

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'admin_assign_member_lub_role error: % %', SQLERRM, SQLSTATE;
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_assign_member_lub_role(uuid, uuid, uuid, text, text, text, date, date, text, text, text, text, text) TO authenticated, anon;

-- ═══════════════════════════════════════════════════════════════════════════
-- Re-grant the session wrapper (unchanged logic, re-declared for clarity)
-- ═══════════════════════════════════════════════════════════════════════════

GRANT EXECUTE ON FUNCTION public.admin_assign_member_lub_role_with_session(text, uuid, uuid, text, text, text, date, date, text, text, text, text, text) TO PUBLIC;

-- ═══════════════════════════════════════════════════════════════════════════
-- Reload PostgREST schema cache
-- ═══════════════════════════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';
