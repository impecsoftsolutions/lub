import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { customAuth } from '../lib/customAuth';
import { permissionService } from '../lib/permissionService';
import type { ExtendedUser, UserPermission } from '../types/permissions';

/**
 * Permission Context Value Interface
 *
 * Provides user data, permissions, and permission check methods
 * throughout the application.
 */
interface PermissionContextValue {
  /** Current authenticated user with roles and permissions */
  user: ExtendedUser | null;

  /** Array of all permissions the user has */
  permissions: UserPermission[];

  /** Whether permissions are being loaded */
  isLoading: boolean;

  /** Error that occurred during permission loading */
  error: Error | null;

  /** Check if user has a specific permission (sync - checks cached data) */
  hasPermission: (code: string) => boolean;

  /** Check if user has any of the specified permissions (sync) */
  hasAnyPermission: (codes: string[]) => boolean;

  /** Check if user has all of the specified permissions (sync) */
  hasAllPermissions: (codes: string[]) => boolean;

  /** Check if user is a super admin (sync) */
  isSuperAdmin: () => boolean;

  /** Refresh permissions from database (async) */
  refreshPermissions: () => Promise<void>;
}

/**
 * Permission Context
 *
 * React Context for managing and accessing user permissions throughout the app.
 */
const PermissionContext = createContext<PermissionContextValue | undefined>(undefined);

/**
 * usePermission Hook
 *
 * Custom hook to access permission context.
 * Throws error if used outside of PermissionProvider.
 *
 * @example
 * const { hasPermission, isSuperAdmin } = usePermission();
 * if (hasPermission('members.delete')) {
 *   // Show delete button
 * }
 */
export const usePermission = () => {
  const context = useContext(PermissionContext);
  if (!context) {
    throw new Error('usePermission must be used within PermissionProvider');
  }
  return context;
};

/**
 * PermissionProvider Props
 */
interface PermissionProviderProps {
  children: React.ReactNode;
}

/**
 * PermissionProvider Component
 *
 * Wraps the application to provide permission context.
 * Loads user with permissions on mount and provides sync permission check methods.
 *
 * Features:
 * - Loads user with permissions on mount using customAuth.getCurrentUserWithPermissions()
 * - Provides sync permission check methods (check in-memory state)
 * - Handles loading and error states properly
 * - Auto-refreshes on window focus for fresh permissions
 * - Memoizes context value to prevent unnecessary re-renders
 *
 * @example
 * <PermissionProvider>
 *   <App />
 * </PermissionProvider>
 */
export const PermissionProvider: React.FC<PermissionProviderProps> = ({ children }) => {
  const [user, setUser] = useState<ExtendedUser | null>(null);
  const [permissions, setPermissions] = useState<UserPermission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  /**
   * Load user with permissions from database
   */
  const loadUserPermissions = useCallback(async () => {
    try {
      console.log('[PermissionContext] Loading user permissions...');
      setIsLoading(true);
      setError(null);

      // Fetch user with roles and permissions
      const userData = await customAuth.getCurrentUserWithPermissions();

      console.log('[PermissionContext] User data loaded:', userData ? 'Success' : 'No user found');

      if (userData) {
        setUser(userData);
        setPermissions(userData.permissions || []);
        console.log(`[PermissionContext] Loaded ${userData.permissions?.length || 0} permissions`);
      } else {
        setUser(null);
        setPermissions([]);
        console.log('[PermissionContext] No authenticated user');
      }
    } catch (err) {
      console.error('[PermissionContext] Error loading permissions:', err);
      setError(err instanceof Error ? err : new Error('Failed to load permissions'));
      setUser(null);
      setPermissions([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Refresh permissions (async)
   * Clears cache and fetches fresh from database
   */
  const refreshPermissions = useCallback(async () => {
    console.log('[PermissionContext] Refreshing permissions...');

    // Clear cache to force fresh fetch
    permissionService.clearCache();

    // Reload user permissions
    await loadUserPermissions();

    console.log('[PermissionContext] Permissions refreshed');
  }, [loadUserPermissions]);

  /**
   * Check if user has a specific permission (sync)
   * Checks in-memory cached data only
   */
  const hasPermission = useCallback((code: string): boolean => {
    if (!user || !permissions) {
      return false;
    }

    // Super admins have all permissions
    if (user.primaryRole === 'super_admin') {
      return true;
    }

    // Check if permission exists in cached permissions
    const hasIt = permissions.some((perm) => perm.code === code);

    console.log(`[PermissionContext] Permission check: ${code} = ${hasIt}`);

    return hasIt;
  }, [user, permissions]);

  /**
   * Check if user has any of the specified permissions (sync)
   * Returns true if user has at least one of the permissions
   */
  const hasAnyPermission = useCallback((codes: string[]): boolean => {
    if (!user || !permissions || codes.length === 0) {
      return false;
    }

    // Super admins have all permissions
    if (user.primaryRole === 'super_admin') {
      return true;
    }

    // Check if user has at least one permission
    const hasAny = codes.some((code) =>
      permissions.some((perm) => perm.code === code)
    );

    console.log(`[PermissionContext] Any permission check: [${codes.join(', ')}] = ${hasAny}`);

    return hasAny;
  }, [user, permissions]);

  /**
   * Check if user has all of the specified permissions (sync)
   * Returns true only if user has every single permission
   */
  const hasAllPermissions = useCallback((codes: string[]): boolean => {
    if (!user || !permissions || codes.length === 0) {
      return false;
    }

    // Super admins have all permissions
    if (user.primaryRole === 'super_admin') {
      return true;
    }

    // Check if user has every permission
    const hasAll = codes.every((code) =>
      permissions.some((perm) => perm.code === code)
    );

    console.log(`[PermissionContext] All permissions check: [${codes.join(', ')}] = ${hasAll}`);

    return hasAll;
  }, [user, permissions]);

  /**
   * Check if user is a super admin (sync)
   */
  const isSuperAdmin = useCallback((): boolean => {
    if (!user) {
      return false;
    }

    const isSA = user.primaryRole === 'super_admin';

    console.log(`[PermissionContext] Super admin check: ${isSA}`);

    return isSA;
  }, [user]);

  /**
   * Load permissions on mount
   */
  useEffect(() => {
    let mounted = true;

    const initPermissions = async () => {
      if (!mounted) return;

      console.log('[PermissionContext] Initializing permissions...');

      try {
        await loadUserPermissions();
      } catch (err) {
        console.error('[PermissionContext] Failed to initialize permissions:', err);
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    initPermissions();

    return () => {
      mounted = false;
    };
  }, [loadUserPermissions]);

  /**
   * Auto-refresh on window focus (optional enhancement)
   * Ensures permissions are fresh when user returns to tab
   */
  useEffect(() => {
    const handleFocus = () => {
      console.log('[PermissionContext] Window focused, checking for stale permissions...');

      // Only refresh if user is authenticated
      if (user) {
        // Don't await - let it happen in background
        refreshPermissions();
      }
    };

    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [user, refreshPermissions]);

  /**
   * Memoize context value to prevent unnecessary re-renders
   */
  const value: PermissionContextValue = useMemo(
    () => ({
      user,
      permissions,
      isLoading,
      error,
      hasPermission,
      hasAnyPermission,
      hasAllPermissions,
      isSuperAdmin,
      refreshPermissions,
    }),
    [
      user,
      permissions,
      isLoading,
      error,
      hasPermission,
      hasAnyPermission,
      hasAllPermissions,
      isSuperAdmin,
      refreshPermissions,
    ]
  );

  return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>;
};
