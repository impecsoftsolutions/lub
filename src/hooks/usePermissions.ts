/**
 * Permission Hooks
 *
 * Convenient React hooks for components to easily check permissions.
 * All hooks use the usePermission() context hook internally and provide
 * type-safe, convenient access to permission functionality.
 *
 * Features:
 * - Type-safe permission checks
 * - Automatic loading state handling
 * - Fail-closed security (returns false when not loaded)
 * - JSDoc comments for IDE intellisense
 * - Optimized with useMemo for performance
 */

import { useMemo } from 'react';
import { usePermission } from '../contexts/usePermission';
import type { ExtendedUser, UserPermission } from '../types/permissions';

/**
 * Hook to get all permissions data and methods from context
 *
 * This is a re-export of the main usePermission hook from PermissionContext.
 * Use this when you need access to multiple permission features.
 *
 * @returns Complete permission context value
 *
 * @example
 * const { user, permissions, hasPermission, isLoading } = usePermissions();
 * if (isLoading) return <Spinner />;
 * if (hasPermission('members.delete')) {
 *   return <DeleteButton />;
 * }
 */
export const usePermissions = () => {
  return usePermission();
};

/**
 * Hook to check if user has a specific permission
 *
 * Returns a boolean indicating whether the current user has the specified permission.
 * Fails closed: returns false when permissions are loading or user is not authenticated.
 *
 * @param code - Permission code to check (e.g., 'members.view', 'settings.edit')
 * @returns True if user has the permission, false otherwise
 *
 * @example
 * const canDelete = useHasPermission('members.delete');
 * return canDelete ? <DeleteButton /> : null;
 *
 * @example
 * const canEdit = useHasPermission('settings.edit');
 * if (canEdit) {
 *   // Show edit form
 * }
 */
export const useHasPermission = (code: string): boolean => {
  const { hasPermission, isLoading } = usePermission();

  return useMemo(() => {
    // Fail closed: return false if still loading
    if (isLoading) {
      return false;
    }

    return hasPermission(code);
  }, [code, hasPermission, isLoading]);
};

/**
 * Hook to check if user has any of the specified permissions
 *
 * Returns true if the user has at least one of the provided permissions.
 * Useful for showing UI elements that require one of several permissions.
 * Fails closed: returns false when permissions are loading or user is not authenticated.
 *
 * @param codes - Array of permission codes to check
 * @returns True if user has at least one permission, false otherwise
 *
 * @example
 * const canManageMembers = useHasAnyPermission(['members.create', 'members.edit', 'members.delete']);
 * if (canManageMembers) {
 *   return <MemberManagementPanel />;
 * }
 *
 * @example
 * // Show admin panel if user can manage users OR settings
 * const showAdminPanel = useHasAnyPermission(['users.manage', 'settings.edit']);
 */
export const useHasAnyPermission = (codes: string[]): boolean => {
  const { hasAnyPermission, isLoading } = usePermission();

  return useMemo(() => {
    // Fail closed: return false if still loading
    if (isLoading) {
      return false;
    }

    // Return false for empty array
    if (codes.length === 0) {
      return false;
    }

    return hasAnyPermission(codes);
  }, [codes, hasAnyPermission, isLoading]);
};

/**
 * Hook to check if user has all of the specified permissions
 *
 * Returns true only if the user has every single one of the provided permissions.
 * Useful for restricting access to features that require multiple permissions.
 * Fails closed: returns false when permissions are loading or user is not authenticated.
 *
 * @param codes - Array of permission codes to check
 * @returns True if user has all permissions, false otherwise
 *
 * @example
 * const canFullyManageMembers = useHasAllPermissions([
 *   'members.view',
 *   'members.create',
 *   'members.edit',
 *   'members.delete'
 * ]);
 * if (canFullyManageMembers) {
 *   return <FullMemberManagementUI />;
 * }
 *
 * @example
 * // Only show sensitive settings if user has both permissions
 * const canEditSensitiveSettings = useHasAllPermissions([
 *   'settings.edit',
 *   'settings.sensitive'
 * ]);
 */
export const useHasAllPermissions = (codes: string[]): boolean => {
  const { hasAllPermissions, isLoading } = usePermission();

  return useMemo(() => {
    // Fail closed: return false if still loading
    if (isLoading) {
      return false;
    }

    // Return false for empty array
    if (codes.length === 0) {
      return false;
    }

    return hasAllPermissions(codes);
  }, [codes, hasAllPermissions, isLoading]);
};

/**
 * Hook to check if current user is a super admin
 *
 * Returns true if the user's primary role is 'super_admin'.
 * Super admins bypass all permission checks and have full system access.
 * Fails closed: returns false when permissions are loading or user is not authenticated.
 *
 * @returns True if user is a super admin, false otherwise
 *
 * @example
 * const isSuperAdmin = useIsSuperAdmin();
 * if (isSuperAdmin) {
 *   return <SuperAdminDashboard />;
 * }
 *
 * @example
 * const isSuperAdmin = useIsSuperAdmin();
 * return (
 *   <div>
 *     {isSuperAdmin && <DangerZone />}
 *     <RegularContent />
 *   </div>
 * );
 */
export const useIsSuperAdmin = (): boolean => {
  const { isSuperAdmin, isLoading } = usePermission();

  return useMemo(() => {
    // Fail closed: return false if still loading
    if (isLoading) {
      return false;
    }

    return isSuperAdmin();
  }, [isSuperAdmin, isLoading]);
};

/**
 * Hook to get the current authenticated user with roles and permissions
 *
 * Returns the ExtendedUser object with full role and permission data,
 * or null if not authenticated or still loading.
 * Fails closed: returns null when permissions are loading.
 *
 * @returns ExtendedUser object or null
 *
 * @example
 * const user = useCurrentUser();
 * if (user) {
 *   console.log(`Welcome ${user.email}`);
 *   console.log(`Role: ${user.primaryRole}`);
 *   console.log(`Permissions: ${user.permissions.length}`);
 * }
 *
 * @example
 * const user = useCurrentUser();
 * const userName = user?.email || 'Guest';
 * return <Header userName={userName} />;
 */
export const useCurrentUser = (): ExtendedUser | null => {
  const { user, isLoading } = usePermission();

  return useMemo(() => {
    // Fail closed: return null if still loading
    if (isLoading) {
      return null;
    }

    return user;
  }, [user, isLoading]);
};

/**
 * Hook to get the user's primary role
 *
 * Returns the primary role string ('super_admin', 'admin', 'editor', 'viewer')
 * or null if not authenticated or no role assigned.
 * Fails closed: returns null when permissions are loading.
 *
 * Primary role is determined by priority:
 * super_admin > admin > editor > viewer
 *
 * @returns Primary role string or null
 *
 * @example
 * const role = useRole();
 * if (role === 'super_admin') {
 *   return <SuperAdminTools />;
 * } else if (role === 'admin') {
 *   return <AdminTools />;
 * }
 *
 * @example
 * const role = useRole();
 * return (
 *   <Badge>
 *     {role ? role.toUpperCase() : 'GUEST'}
 *   </Badge>
 * );
 */
export const useRole = (): 'super_admin' | 'admin' | 'editor' | 'viewer' | null => {
  const { user, isLoading } = usePermission();

  return useMemo(() => {
    // Fail closed: return null if still loading
    if (isLoading) {
      return null;
    }

    return user?.primaryRole || null;
  }, [user, isLoading]);
};

/**
 * Hook to get all permission objects for the current user
 *
 * Returns an array of UserPermission objects with full details
 * (code, name, description, category, granted_at).
 * Useful for displaying permission lists in UI.
 * Fails closed: returns empty array when loading.
 *
 * @returns Array of UserPermission objects (empty if not authenticated or loading)
 *
 * @example
 * const permissions = useUserPermissions();
 * return (
 *   <ul>
 *     {permissions.map(perm => (
 *       <li key={perm.code}>
 *         <strong>{perm.name}</strong>: {perm.description}
 *       </li>
 *     ))}
 *   </ul>
 * );
 *
 * @example
 * const permissions = useUserPermissions();
 * const permissionCount = permissions.length;
 * return <Badge>{permissionCount} permissions</Badge>;
 */
export const useUserPermissions = (): UserPermission[] => {
  const { permissions, isLoading } = usePermission();

  return useMemo(() => {
    // Fail closed: return empty array if still loading
    if (isLoading) {
      return [];
    }

    return permissions;
  }, [permissions, isLoading]);
};
