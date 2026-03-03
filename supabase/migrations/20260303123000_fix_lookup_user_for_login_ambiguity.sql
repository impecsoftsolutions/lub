/*
  # Fix lookup_user_for_login ambiguity

  1. Purpose
    - Resolve Postgres 42702 "column reference is ambiguous" in lookup_user_for_login
    - Preserve the existing RPC name, signature, and return columns

  2. Root Cause
    - RETURNS TABLE output columns are implicit OUT variables in PL/pgSQL
    - Unqualified references like email/account_status/locked_until in the UPDATE predicate
      collide with those OUT variables
*/

CREATE OR REPLACE FUNCTION public.lookup_user_for_login(
  p_email text
)
RETURNS TABLE (
  id uuid,
  email text,
  mobile_number text,
  account_type text,
  account_status text,
  is_active boolean,
  is_frozen boolean,
  last_login_at timestamptz,
  failed_login_attempts integer,
  locked_until timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  full_name text,
  profile_photo_url text,
  company_name text,
  status text,
  member_id text,
  approval_date timestamptz,
  rejection_reason text,
  reapplication_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_email text := lower(trim(p_email));
BEGIN
  IF v_email IS NULL OR v_email = '' THEN
    RETURN;
  END IF;

  -- Qualify predicate-side columns to avoid collisions with RETURNS TABLE OUT params.
  UPDATE users AS u
  SET
    account_status = 'active',
    locked_until = NULL,
    failed_login_attempts = 0,
    updated_at = now()
  WHERE u.email = v_email
    AND u.account_status = 'locked'
    AND u.locked_until IS NOT NULL
    AND u.locked_until <= now();

  RETURN QUERY
  SELECT
    u.id,
    u.email,
    u.mobile_number,
    u.account_type,
    u.account_status,
    u.is_active,
    false::boolean AS is_frozen,
    u.last_login_at,
    COALESCE(u.failed_login_attempts, 0),
    u.locked_until,
    u.created_at,
    u.updated_at,
    mr.full_name,
    mr.profile_photo_url,
    mr.company_name,
    mr.status,
    mr.member_id,
    mr.approval_date,
    mr.rejection_reason,
    COALESCE(mr.reapplication_count, 0)
  FROM users u
  LEFT JOIN LATERAL (
    SELECT
      m.full_name,
      m.profile_photo_url,
      m.company_name,
      m.status,
      m.member_id,
      m.approval_date,
      m.rejection_reason,
      m.reapplication_count
    FROM member_registrations m
    WHERE m.user_id = u.id
       OR (m.user_id IS NULL AND m.email = u.email)
    ORDER BY
      CASE WHEN m.user_id = u.id THEN 0 ELSE 1 END,
      m.created_at DESC
    LIMIT 1
  ) mr ON true
  WHERE u.email = v_email
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_user_for_login(text) TO public;
