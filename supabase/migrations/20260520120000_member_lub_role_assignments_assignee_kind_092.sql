/*
  COD-DESIGNATIONS-ALTERNATE-CONTACT-ROLE-ASSIGNMENT-092

  Enable role assignment to the alternate contact of an approved member, in addition
  to the member themselves (the "main" assignee).

  Schema changes
  ──────────────
  member_lub_role_assignments:
  • assignee_kind  text NOT NULL DEFAULT 'main' CHECK ('main'|'alternate')
  • alternate_contact_name_snapshot  text (nullable; populated for alternate rows)
  • Old UNIQUE (member_id, role_id, level, state, district) → replaced by unique index
    that includes assignee_kind so main+alternate of the same member can coexist.

  Existing rows: assignee_kind defaults to 'main', snapshot stays NULL. ✓

  RPC changes  (all via DROP + CREATE because RETURNS TABLE columns change)
  ──────────────────────────────────────────────────────────────────────────
  • admin_assign_member_lub_role           — add p_assignee_kind, p_alternate_contact_name
  • admin_assign_member_lub_role_with_session — pass-through for new params
  • admin_get_member_lub_role_assignments  — add assignee_kind + alternate_contact_name_snapshot to output
  • admin_get_member_lub_role_assignments_with_session — same
  • get_public_leadership_assignments      — add assignee_kind + alternate_contact_name_snapshot to output

  No new tables. NOTIFY pgrst at end.
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Add columns
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.member_lub_role_assignments
  ADD COLUMN IF NOT EXISTS assignee_kind text NOT NULL DEFAULT 'main'
    CONSTRAINT member_lub_role_assignments_assignee_kind_check
    CHECK (assignee_kind IN ('main', 'alternate')),
  ADD COLUMN IF NOT EXISTS alternate_contact_name_snapshot text;

-- Existing rows already get assignee_kind='main' via the DEFAULT — no UPDATE needed.

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Replace UNIQUE constraint
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop old auto-named constraint (created by original migration).
-- IF EXISTS makes this safe if the name differs or was already dropped.
ALTER TABLE public.member_lub_role_assignments
  DROP CONSTRAINT IF EXISTS
    member_lub_role_assignments_member_id_role_id_level_state_district_key;

-- New unique index: state/district use COALESCE so NULLs compare equal.
-- assignee_kind is NOT NULL, so main+alternate of the same member can hold
-- the same role at the same level/location/year.
CREATE UNIQUE INDEX IF NOT EXISTS member_lub_role_assignments_unique_per_kind
  ON public.member_lub_role_assignments
  (member_id, role_id, level, COALESCE(state, ''), COALESCE(district, ''), assignee_kind);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Recreate admin_assign_member_lub_role
--    Old 9-arg signature (uuid,uuid,uuid,text,text,text,date,date,text).
--    New: two extra trailing optional params.
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.admin_assign_member_lub_role(uuid, uuid, uuid, text, text, text, date, date, text);

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
  p_alternate_contact_name text    DEFAULT NULL
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

  -- ── Validate member ────────────────────────────────────────────────────────
  SELECT * INTO v_member_record
  FROM member_registrations
  WHERE id = p_member_id AND (is_deleted IS NULL OR is_deleted = false);

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
    assignee_kind, alternate_contact_name_snapshot,
    created_at, updated_at
  ) VALUES (
    p_member_id, p_role_id, p_level, p_state, p_district,
    p_role_start_date, p_role_end_date, p_committee_year,
    v_kind,
    CASE WHEN v_kind = 'alternate' THEN trim(p_alternate_contact_name) ELSE NULL END,
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

GRANT EXECUTE ON FUNCTION public.admin_assign_member_lub_role(uuid, uuid, uuid, text, text, text, date, date, text, text, text) TO authenticated, anon;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Recreate admin_assign_member_lub_role_with_session
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.admin_assign_member_lub_role_with_session(text, uuid, uuid, text, text, text, date, date, text);

CREATE FUNCTION public.admin_assign_member_lub_role_with_session(
  p_session_token          text,
  p_member_id              uuid,
  p_role_id                uuid,
  p_level                  text,
  p_state                  text    DEFAULT NULL,
  p_district               text    DEFAULT NULL,
  p_role_start_date        date    DEFAULT NULL,
  p_role_end_date          date    DEFAULT NULL,
  p_committee_year         text    DEFAULT NULL,
  p_assignee_kind          text    DEFAULT 'main',
  p_alternate_contact_name text    DEFAULT NULL
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

  IF NOT public.has_permission(v_actor_user_id, 'organization.designations.manage') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  RETURN public.admin_assign_member_lub_role(
    v_actor_user_id,
    p_member_id,
    p_role_id,
    p_level,
    p_state,
    p_district,
    p_role_start_date,
    p_role_end_date,
    p_committee_year,
    p_assignee_kind,
    p_alternate_contact_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_assign_member_lub_role_with_session(text, uuid, uuid, text, text, text, date, date, text, text, text) TO PUBLIC;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Recreate admin_get_member_lub_role_assignments
--    Drop first (RETURNS TABLE change requires full replace).
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.admin_get_member_lub_role_assignments(uuid, text);

CREATE FUNCTION public.admin_get_member_lub_role_assignments(
  p_requesting_user_id uuid,
  p_search             text DEFAULT NULL
)
RETURNS TABLE (
  assignment_id                   uuid,
  member_id                       uuid,
  lub_role_id                     uuid,
  level                           text,
  state                           text,
  district                        text,
  committee_year                  text,
  role_start_date                 date,
  role_end_date                   date,
  created_at                      timestamptz,
  updated_at                      timestamptz,
  member_full_name                text,
  member_email                    text,
  member_mobile_number            text,
  member_company_name             text,
  member_city                     text,
  member_district                 text,
  member_gender                   text,
  member_profile_photo_url        text,
  lub_role_name                   text,
  lub_role_display_order          integer,
  assignee_kind                   text,
  alternate_contact_name_snapshot text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_authorized boolean := false;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = p_requesting_user_id
      AND u.account_status = 'active'
      AND (
        u.account_type IN ('admin', 'both', 'super_admin')
        OR EXISTS (
          SELECT 1 FROM user_roles ur
          WHERE ur.user_id = u.id
            AND ur.role IN ('super_admin', 'admin', 'editor')
        )
      )
  ) INTO v_is_authorized;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'authorization: not authorized to view member LUB role assignments';
  END IF;

  RETURN QUERY
  SELECT
    a.id                              AS assignment_id,
    a.member_id                       AS member_id,
    a.role_id                         AS lub_role_id,
    a.level                           AS level,
    a.state                           AS state,
    a.district                        AS district,
    a.committee_year                  AS committee_year,
    a.role_start_date                 AS role_start_date,
    a.role_end_date                   AS role_end_date,
    a.created_at                      AS created_at,
    a.updated_at                      AS updated_at,
    mr.full_name                      AS member_full_name,
    mr.email                          AS member_email,
    mr.mobile_number                  AS member_mobile_number,
    mr.company_name                   AS member_company_name,
    mr.city                           AS member_city,
    mr.district                       AS member_district,
    mr.gender                         AS member_gender,
    mr.profile_photo_url              AS member_profile_photo_url,
    r.role_name                       AS lub_role_name,
    r.display_order                   AS lub_role_display_order,
    a.assignee_kind                   AS assignee_kind,
    a.alternate_contact_name_snapshot AS alternate_contact_name_snapshot
  FROM member_lub_role_assignments a
  JOIN member_registrations mr ON mr.id = a.member_id
  JOIN lub_roles_master r      ON r.id  = a.role_id
  WHERE
    mr.status    = 'approved'
    AND mr.is_active = TRUE
    AND (
      p_search IS NULL
      OR p_search = ''
      OR mr.full_name  ILIKE '%' || p_search || '%'
      OR mr.email      ILIKE '%' || p_search || '%'
      OR r.role_name   ILIKE '%' || p_search || '%'
      OR COALESCE(a.alternate_contact_name_snapshot, '') ILIKE '%' || p_search || '%'
    )
  ORDER BY
    r.display_order ASC,
    r.role_name     ASC,
    mr.full_name    ASC,
    a.created_at    DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_member_lub_role_assignments(uuid, text) TO anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Recreate admin_get_member_lub_role_assignments_with_session
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.admin_get_member_lub_role_assignments_with_session(text, text);

CREATE FUNCTION public.admin_get_member_lub_role_assignments_with_session(
  p_session_token text,
  p_search        text DEFAULT NULL
)
RETURNS TABLE (
  assignment_id                   uuid,
  member_id                       uuid,
  lub_role_id                     uuid,
  level                           text,
  state                           text,
  district                        text,
  committee_year                  text,
  role_start_date                 date,
  role_end_date                   date,
  created_at                      timestamptz,
  updated_at                      timestamptz,
  member_full_name                text,
  member_email                    text,
  member_mobile_number            text,
  member_company_name             text,
  member_city                     text,
  member_district                 text,
  member_gender                   text,
  member_profile_photo_url        text,
  lub_role_name                   text,
  lub_role_display_order          integer,
  assignee_kind                   text,
  alternate_contact_name_snapshot text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_user_id uuid;
BEGIN
  v_actor_user_id := public.resolve_custom_session_user_id(p_session_token);

  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Invalid session';
  END IF;

  IF NOT (
    public.has_permission(v_actor_user_id, 'organization.designations.view')
    OR public.has_permission(v_actor_user_id, 'organization.designations.manage')
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  SELECT * FROM public.admin_get_member_lub_role_assignments(v_actor_user_id, p_search);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_member_lub_role_assignments_with_session(text, text) TO PUBLIC;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Recreate get_public_leadership_assignments
--    Adds assignee_kind + alternate_contact_name_snapshot to output.
--    Leadership page uses alternate name (not main photo) for alternate rows.
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.get_public_leadership_assignments(text, text, text, date, text);

CREATE FUNCTION public.get_public_leadership_assignments(
  p_level          text,
  p_state          text    DEFAULT NULL,
  p_district       text    DEFAULT NULL,
  p_as_of_date     date    DEFAULT CURRENT_DATE,
  p_committee_year text    DEFAULT NULL
)
RETURNS TABLE (
  assignment_id                   uuid,
  member_id                       uuid,
  member_full_name                text,
  member_email                    text,
  member_mobile_number            text,
  member_company_name             text,
  member_city                     text,
  member_district                 text,
  member_gender                   text,
  member_profile_photo_url        text,
  lub_role_id                     uuid,
  lub_role_name                   text,
  level                           text,
  state                           text,
  district                        text,
  committee_year                  text,
  role_start_date                 date,
  role_end_date                   date,
  assignee_kind                   text,
  alternate_contact_name_snapshot text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF p_level IS NULL OR p_level NOT IN ('national','state','district','city') THEN
    RAISE EXCEPTION 'Invalid level. Must be one of national/state/district/city';
  END IF;
  IF p_level = 'state' AND p_state IS NULL THEN
    RAISE EXCEPTION 'State is required when level = state';
  END IF;
  IF p_level IN ('district','city') AND (p_state IS NULL OR p_district IS NULL) THEN
    RAISE EXCEPTION 'State and district are required when level = district or city';
  END IF;
  IF p_committee_year IS NOT NULL AND p_committee_year !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'Committee year must be a 4-digit year (e.g., 2025)';
  END IF;

  RETURN QUERY
  SELECT
    a.id                              AS assignment_id,
    a.member_id,
    mr.full_name                      AS member_full_name,
    mr.email                          AS member_email,
    mr.mobile_number                  AS member_mobile_number,
    mr.company_name                   AS member_company_name,
    mr.city                           AS member_city,
    mr.district                       AS member_district,
    mr.gender                         AS member_gender,
    mr.profile_photo_url              AS member_profile_photo_url,
    a.role_id                         AS lub_role_id,
    r.role_name                       AS lub_role_name,
    a.level,
    a.state,
    a.district,
    a.committee_year,
    a.role_start_date,
    a.role_end_date,
    a.assignee_kind,
    a.alternate_contact_name_snapshot
  FROM member_lub_role_assignments a
  INNER JOIN member_registrations mr ON mr.id = a.member_id
  INNER JOIN lub_roles_master r      ON r.id  = a.role_id
  WHERE
    (
      CASE
        WHEN p_level = 'national' THEN
          a.level = 'national'
        WHEN p_level = 'state' THEN
          a.level = 'state'
          AND LOWER(TRIM(COALESCE(a.state, ''))) = LOWER(TRIM(COALESCE(p_state, '')))
        WHEN p_level = 'district' THEN
          a.level = 'district'
          AND LOWER(TRIM(COALESCE(a.state, '')))    = LOWER(TRIM(COALESCE(p_state, '')))
          AND LOWER(TRIM(COALESCE(a.district, ''))) = LOWER(TRIM(COALESCE(p_district, '')))
        WHEN p_level = 'city' THEN
          a.level = 'city'
          AND LOWER(TRIM(COALESCE(a.state, '')))    = LOWER(TRIM(COALESCE(p_state, '')))
          AND LOWER(TRIM(COALESCE(a.district, ''))) = LOWER(TRIM(COALESCE(p_district, '')))
        ELSE FALSE
      END
    )
    AND (p_committee_year IS NULL OR a.committee_year = p_committee_year)
    AND (a.role_start_date IS NULL OR a.role_start_date <= p_as_of_date)
    AND (a.role_end_date   IS NULL OR a.role_end_date   >= p_as_of_date)
    AND r.is_active  = true
    AND mr.status    = 'approved'
    AND mr.is_active = true
  ORDER BY
    COALESCE(r.display_order, 999999) ASC,
    r.role_name  ASC,
    mr.full_name ASC,
    a.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_leadership_assignments(text, text, text, date, text) TO anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- Reload PostgREST schema cache
-- ═══════════════════════════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';
