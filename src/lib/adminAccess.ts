// =============================================================================
// COD-ADMIN-ACCESS-ENTRYPOINT-FOR-PERMISSIONED-NON-ADMINS-056
//
// Single source of truth for "should this user see/enter the Admin Panel?".
// Used by both the public Header user menu (link visibility) and the
// AdminLayout route gate so the two never drift.
//
// IMPORTANT: this is purely about discoverability/admission. Backend
// `_with_session` RPCs and per-page <PermissionGate> components are still
// the authoritative checks for what a user can actually do once inside.
// =============================================================================

export interface AdminAccessPermission {
  code: string;
}

// Permission codes that, on their own, do NOT justify showing the admin
// entrypoint. Today every permission in this codebase is admin-domain so
// the list is empty; keep the hook in place for future member-portal
// permissions (e.g. `member.profile.edit`) that an admin might grant
// without intending to surface the admin shell.
const NON_ADMIN_PERMISSION_CODES: ReadonlySet<string> = new Set<string>([
  // intentionally empty
]);

/**
 * Returns true when the user has at least one permission that maps to
 * an admin-domain capability (anything not in NON_ADMIN_PERMISSION_CODES).
 * Fails closed on null / empty input.
 */
export function hasAnyAdminPermission(
  permissions: ReadonlyArray<AdminAccessPermission> | null | undefined,
): boolean {
  if (!permissions || permissions.length === 0) return false;
  return permissions.some(
    (p) => typeof p?.code === 'string' && p.code.length > 0 && !NON_ADMIN_PERMISSION_CODES.has(p.code),
  );
}

/**
 * Combined gate used by Header link visibility and AdminLayout admission.
 * - admin / both account types → always allowed (existing behavior).
 * - any other account type → allowed when the user has at least one
 *   admin-domain permission via role or override.
 */
export function hasAdminPanelAccess(
  accountType: string | null | undefined,
  permissions: ReadonlyArray<AdminAccessPermission> | null | undefined,
): boolean {
  if (accountType === 'admin' || accountType === 'both') return true;
  return hasAnyAdminPermission(permissions);
}
