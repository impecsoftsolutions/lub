/*
  COD-DASHBOARD-GENDER-UNITS-CITIES-LEADERSHIP-094

  New server-side RPC: get_admin_dashboard_metrics_with_session

  Replaces the 8 parallel direct-table reads in useDashboardData.ts with a
  single authenticated call.  Using resolve_custom_session_user_id + has_permission
  means the pending_registrations count matches the sidebar badge (both now go
  through the same auth path).

  Metrics returned
  ─────────────────
  approved_members          – member_registrations WHERE status='approved'
  pending_registrations     – member_registrations WHERE status='pending'  (matches sidebar)
  male_members              – approved + gender='male'
  female_members            – approved + gender='female'
  active_admin_users        – users with admin/both account_type, active + not frozen
  pending_cities            – cities_master WHERE status='pending'
  active_district_units     – distinct normalised districts in live lub-role assignments at level='district'
  active_cities             – distinct normalised cities across approved member_registrations
  active_states             – states_master WHERE is_active=true
  total_designations        – company_designations (all rows)
  form_fields_configured    – form_field_configurations (all rows)
  last_updated              – now() at query time

  Permission required: dashboard.view  (same gate used by the PermissionGate in AdminDashboardOverview)
  Falls back gracefully: if the caller lacks the permission they receive
  { success: false, error: "not authorized" }
*/

-- ═══════════════════════════════════════════════════════════════════════════════
-- Drop old version if it exists (signature may have changed during dev)
-- ═══════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.get_admin_dashboard_metrics_with_session(text);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Create function
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE FUNCTION public.get_admin_dashboard_metrics_with_session(
  p_session_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id                uuid;
  v_approved_members       bigint := 0;
  v_pending_registrations  bigint := 0;
  v_male_members           bigint := 0;
  v_female_members         bigint := 0;
  v_active_admin_users     bigint := 0;
  v_pending_cities         bigint := 0;
  v_active_district_units  bigint := 0;
  v_active_cities          bigint := 0;
  v_active_states          bigint := 0;
  v_total_designations     bigint := 0;
  v_form_fields            bigint := 0;
BEGIN
  -- ── Resolve session ──────────────────────────────────────────────────────────
  v_user_id := public.resolve_custom_session_user_id(p_session_token);

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired session');
  END IF;

  -- ── Permission check ─────────────────────────────────────────────────────────
  IF NOT public.has_permission(v_user_id, 'dashboard.view') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  -- ── Member registration counts ───────────────────────────────────────────────
  SELECT
    COUNT(*) FILTER (WHERE status = 'approved'),
    COUNT(*) FILTER (WHERE status = 'pending'),
    COUNT(*) FILTER (WHERE status = 'approved' AND lower(trim(gender)) = 'male'),
    COUNT(*) FILTER (WHERE status = 'approved' AND lower(trim(gender)) = 'female')
  INTO
    v_approved_members,
    v_pending_registrations,
    v_male_members,
    v_female_members
  FROM public.member_registrations
  WHERE is_active IS NULL OR is_active = true;

  -- ── Active admin users ───────────────────────────────────────────────────────
  SELECT COUNT(*)
  INTO v_active_admin_users
  FROM public.users
  WHERE account_type IN ('admin', 'super_admin', 'both')
    AND account_status = 'active'
    AND is_active  = true
    AND is_frozen  = false;

  -- ── Pending cities ───────────────────────────────────────────────────────────
  SELECT COUNT(*)
  INTO v_pending_cities
  FROM public.cities_master
  WHERE status = 'pending';

  -- ── Active district units (distinct normalised districts with a live LUB role) ─
  SELECT COUNT(DISTINCT lower(regexp_replace(trim(a.district), '\s+', ' ', 'g')))
  INTO v_active_district_units
  FROM public.member_lub_role_assignments a
  WHERE a.level    = 'district'
    AND a.district IS NOT NULL
    AND trim(a.district) <> ''
    AND (a.role_end_date IS NULL OR a.role_end_date >= CURRENT_DATE);

  -- ── Active cities (distinct normalised cities across approved members) ─────────
  SELECT COUNT(DISTINCT lower(regexp_replace(trim(mr.city), '\s+', ' ', 'g')))
  INTO v_active_cities
  FROM public.member_registrations mr
  WHERE mr.status = 'approved'
    AND mr.city   IS NOT NULL
    AND trim(mr.city) <> ''
    AND (mr.is_active IS NULL OR mr.is_active = true);

  -- ── Active states ─────────────────────────────────────────────────────────────
  SELECT COUNT(*)
  INTO v_active_states
  FROM public.states_master
  WHERE is_active = true;

  -- ── Total designations ────────────────────────────────────────────────────────
  SELECT COUNT(*)
  INTO v_total_designations
  FROM public.company_designations;

  -- ── Form fields configured ────────────────────────────────────────────────────
  SELECT COUNT(*)
  INTO v_form_fields
  FROM public.form_field_configurations;

  RETURN jsonb_build_object(
    'success',               true,
    'approved_members',      v_approved_members,
    'pending_registrations', v_pending_registrations,
    'male_members',          v_male_members,
    'female_members',        v_female_members,
    'active_admin_users',    v_active_admin_users,
    'pending_cities',        v_pending_cities,
    'active_district_units', v_active_district_units,
    'active_cities',         v_active_cities,
    'active_states',         v_active_states,
    'total_designations',    v_total_designations,
    'form_fields_configured',v_form_fields,
    'last_updated',          now()
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'get_admin_dashboard_metrics_with_session error: % %', SQLERRM, SQLSTATE;
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_metrics_with_session(text) TO authenticated, anon;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Reload PostgREST schema cache
-- ═══════════════════════════════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';
