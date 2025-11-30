/**
 * Permission Service
 *
 * Centralized service for managing user permissions and roles.
 * Provides caching, permission checks, and integration with database permission functions.
 *
 * Singleton pattern matching customAuth service.
 *
 * @example
 * // Check if current user has permission
 * const canDelete = await permissionService.checkCurrentUserPermission('members.delete');
 *
 * @example
 * // Get all permissions for a user
 * const permissions = await permissionService.getUserPermissions(userId);
 *
 * @example
 * // Check if current user is super admin
 * const isSuperAdmin = await permissionService.isCurrentUserSuperAdmin();
 */

import { supabase } from './supabase';
import { customAuth } from './customAuth';
import type { UserRole } from './supabase';
import {
  UserPermission,
  PermissionCache,
  PermissionCacheStore,
  PermissionError,
  PermissionErrorCode,
} from '../types/permissions';

// Cache configuration
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

// In-memory cache storage (NOT localStorage to avoid stale data)
const cache: PermissionCacheStore = {};

/**
 * Calculates primary role from roles array based on priority.
 *
 * Priority order: super_admin > admin > editor > viewer
 *
 * @param roles - Array of user roles
 * @returns Highest priority role or null if no roles
 *
 * @example
 * const primaryRole = calculatePrimaryRole([
 *   { role: 'viewer', ... },
 *   { role: 'admin', ... }
 * ]); // Returns 'admin'
 */
function calculatePrimaryRole(
  roles: UserRole[]
): 'super_admin' | 'admin' | 'editor' | 'viewer' | null {
  if (!roles || roles.length === 0) return null;

  const priority: Record<string, number> = {
    super_admin: 4,
    admin: 3,
    editor: 2,
    viewer: 1,
  };

  const sorted = [...roles].sort((a, b) => {
    const priorityA = priority[a.role] || 0;
    const priorityB = priority[b.role] || 0;
    return priorityB - priorityA;
  });

  return sorted[0].role;
}

/**
 * Permission Service singleton
 */
export const permissionService = {
  /**
   * Gets all permissions for a specific user.
   *
   * Flow:
   * 1. Check cache first
   * 2. If cache miss or expired, query database function get_user_permissions()
   * 3. Also fetch roles from user_roles table
   * 4. Cache results for 5 minutes
   * 5. Return permissions array
   *
   * @param userId - UUID of the user
   * @returns Promise resolving to array of permissions
   *
   * @example
   * const permissions = await permissionService.getUserPermissions('user-uuid-123');
   * console.log(permissions); // [{ code: 'members.view', name: 'View Members', ... }]
   */
  async getUserPermissions(userId: string): Promise<UserPermission[]> {
    try {
      if (!userId) {
        console.error('[permissionService] getUserPermissions: userId is required');
        return [];
      }

      // Check cache first
      const cached = this.getCachedPermissions(userId);
      if (cached) {
        console.log(`[permissionService] Cache hit for user: ${userId}`);
        return cached;
      }

      console.log(`[permissionService] Cache miss for user: ${userId}, fetching from database`);

      // Fetch permissions from database function
      const { data: permissions, error: permError } = await supabase.rpc(
        'get_user_permissions',
        { p_user_id: userId }
      );

      if (permError) {
        console.error('[permissionService] Error fetching permissions:', permError);
        throw new PermissionError(
          PermissionErrorCode.DATABASE_ERROR,
          'Failed to fetch user permissions',
          permError,
          { userId }
        );
      }

      // Fetch roles using RPC function (bypasses RLS)
      const { data: roles, error: roleError } = await supabase
        .rpc('get_user_roles', { p_user_id: userId });

      if (roleError) {
        console.error('[permissionService] Error fetching roles:', roleError);
        throw new PermissionError(
          PermissionErrorCode.DATABASE_ERROR,
          'Failed to fetch user roles',
          roleError,
          { userId }
        );
      }

      const permissionsArray: UserPermission[] = permissions || [];
      const rolesArray: UserRole[] = roles || [];

      // Cache the results
      this.cachePermissions(userId, permissionsArray, rolesArray);

      console.log(`[permissionService] Fetched ${permissionsArray.length} permissions for user: ${userId}`);

      return permissionsArray;
    } catch (error) {
      console.error('[permissionService] getUserPermissions error:', error);
      // Fail closed - return empty array on error
      return [];
    }
  },

  /**
   * Checks if a user has a specific permission.
   *
   * Calls database function has_permission(user_id, permission_code).
   * This function handles super_admin logic (super admins have all permissions).
   *
   * @param userId - UUID of the user
   * @param permissionCode - Permission code to check (e.g., 'members.delete')
   * @returns Promise resolving to boolean
   *
   * @example
   * const canDelete = await permissionService.hasPermission(userId, 'members.delete');
   * if (canDelete) {
   *   // Show delete button
   * }
   */
  async hasPermission(userId: string, permissionCode: string): Promise<boolean> {
    try {
      if (!userId || !permissionCode) {
        console.error('[permissionService] hasPermission: userId and permissionCode are required');
        return false;
      }

      // Call database function for permission check
      const { data, error } = await supabase.rpc('has_permission', {
        p_user_id: userId,
        p_permission_code: permissionCode,
      });

      if (error) {
        console.error('[permissionService] Error checking permission:', error);
        throw new PermissionError(
          PermissionErrorCode.DATABASE_ERROR,
          `Failed to check permission: ${permissionCode}`,
          error,
          { userId, permissionCode }
        );
      }

      const hasPermission = data === true;

      console.log(
        `[permissionService] Permission check: user=${userId}, permission=${permissionCode}, result=${hasPermission}`
      );

      return hasPermission;
    } catch (error) {
      console.error('[permissionService] hasPermission error:', error);
      // Fail closed - return false on error
      return false;
    }
  },

  /**
   * Checks if the currently logged-in user has a specific permission.
   *
   * This is the most commonly used method in components.
   *
   * @param permissionCode - Permission code to check
   * @returns Promise resolving to boolean
   *
   * @example
   * const canEdit = await permissionService.checkCurrentUserPermission('members.edit');
   */
  async checkCurrentUserPermission(permissionCode: string): Promise<boolean> {
    try {
      // Get current user from session
      const user = await customAuth.getCurrentUserFromSession();

      if (!user) {
        console.log('[permissionService] No authenticated user found');
        return false;
      }

      // Check permission for current user
      return await this.hasPermission(user.id, permissionCode);
    } catch (error) {
      console.error('[permissionService] checkCurrentUserPermission error:', error);
      // Fail closed - return false on error
      return false;
    }
  },

  /**
   * Gets all roles for a specific user.
   *
   * @param userId - UUID of the user
   * @returns Promise resolving to array of roles
   *
   * @example
   * const roles = await permissionService.getUserRoles(userId);
   */
  async getUserRoles(userId: string): Promise<UserRole[]> {
    try {
      if (!userId) {
        console.error('[permissionService] getUserRoles: userId is required');
        return [];
      }

      // Check cache first
      const cached = this.getCachedRoles(userId);
      if (cached) {
        console.log(`[permissionService] Cache hit for user roles: ${userId}`);
        return cached;
      }

      console.log(`[permissionService] Fetching roles for user: ${userId}`);

      // Fetch roles from database using RPC function (bypasses RLS)
      const { data: roles, error } = await supabase
        .rpc('get_user_roles', { p_user_id: userId });

      if (error) {
        console.error('[permissionService] Error fetching roles:', error);
        throw new PermissionError(
          PermissionErrorCode.DATABASE_ERROR,
          'Failed to fetch user roles',
          error,
          { userId }
        );
      }

      const rolesArray: UserRole[] = roles || [];

      console.log(`[permissionService] Fetched ${rolesArray.length} roles for user: ${userId}`);

      return rolesArray;
    } catch (error) {
      console.error('[permissionService] getUserRoles error:', error);
      // Fail closed - return empty array on error
      return [];
    }
  },

  /**
   * Gets the primary (highest priority) role for the current user.
   *
   * Priority: super_admin > admin > editor > viewer
   *
   * @returns Promise resolving to role name or null
   *
   * @example
   * const role = await permissionService.getCurrentUserRole();
   * if (role === 'super_admin') {
   *   // Show all features
   * }
   */
  async getCurrentUserRole(): Promise<'super_admin' | 'admin' | 'editor' | 'viewer' | null> {
    try {
      // Get current user from session
      const user = await customAuth.getCurrentUserFromSession();

      if (!user) {
        console.log('[permissionService] No authenticated user found');
        return null;
      }

      // Get user's roles
      const roles = await this.getUserRoles(user.id);

      if (!roles || roles.length === 0) {
        console.log(`[permissionService] No roles found for user: ${user.id}`);
        return null;
      }

      // Calculate primary role
      const primaryRole = calculatePrimaryRole(roles);

      console.log(`[permissionService] Primary role for user ${user.id}: ${primaryRole}`);

      return primaryRole;
    } catch (error) {
      console.error('[permissionService] getCurrentUserRole error:', error);
      return null;
    }
  },

  /**
   * Checks if current user is a super admin.
   *
   * @returns Promise resolving to boolean
   *
   * @example
   * if (await permissionService.isCurrentUserSuperAdmin()) {
   *   // Show system settings
   * }
   */
  async isCurrentUserSuperAdmin(): Promise<boolean> {
    try {
      // Get current user from session
      const user = await customAuth.getCurrentUserFromSession();

      if (!user) {
        console.log('[permissionService] No authenticated user found');
        return false;
      }

      // Get user's roles
      const roles = await this.getUserRoles(user.id);

      // Check if any role is super_admin
      const isSuperAdmin = roles.some((role) => role.role === 'super_admin');

      console.log(`[permissionService] User ${user.id} is super admin: ${isSuperAdmin}`);

      return isSuperAdmin;
    } catch (error) {
      console.error('[permissionService] isCurrentUserSuperAdmin error:', error);
      // Fail closed - return false on error
      return false;
    }
  },

  /**
   * Caches permissions and roles for a user.
   *
   * @param userId - UUID of the user
   * @param permissions - Permissions to cache
   * @param roles - Roles to cache
   *
   * @example
   * permissionService.cachePermissions(userId, permissions, roles);
   */
  cachePermissions(userId: string, permissions: UserPermission[], roles: UserRole[]): void {
    try {
      if (!userId) {
        console.error('[permissionService] cachePermissions: userId is required');
        return;
      }

      const now = Date.now();
      cache[userId] = {
        userId,
        permissions,
        roles,
        cachedAt: now,
        expiresAt: now + CACHE_TTL,
      };

      console.log(
        `[permissionService] Cached ${permissions.length} permissions and ${roles.length} roles for user: ${userId}`
      );
    } catch (error) {
      console.error('[permissionService] cachePermissions error:', error);
    }
  },

  /**
   * Retrieves cached permissions for a user.
   *
   * @param userId - UUID of the user
   * @returns Cached permissions or null if not found/expired
   *
   * @example
   * const cached = permissionService.getCachedPermissions(userId);
   * if (cached) {
   *   // Use cached data
   * }
   */
  getCachedPermissions(userId: string): UserPermission[] | null {
    try {
      if (!userId) {
        return null;
      }

      const entry = cache[userId];

      if (!entry) {
        return null;
      }

      // Check if cache has expired
      if (Date.now() > entry.expiresAt) {
        console.log(`[permissionService] Cache expired for user: ${userId}`);
        delete cache[userId];
        return null;
      }

      return entry.permissions;
    } catch (error) {
      console.error('[permissionService] getCachedPermissions error:', error);
      return null;
    }
  },

  /**
   * Retrieves cached roles for a user.
   *
   * @param userId - UUID of the user
   * @returns Cached roles or null if not found/expired
   *
   * @example
   * const cached = permissionService.getCachedRoles(userId);
   * if (cached) {
   *   // Use cached data
   * }
   */
  getCachedRoles(userId: string): UserRole[] | null {
    try {
      if (!userId) {
        return null;
      }

      const entry = cache[userId];

      if (!entry) {
        return null;
      }

      // Check if cache has expired
      if (Date.now() > entry.expiresAt) {
        console.log(`[permissionService] Cache expired for user: ${userId}`);
        delete cache[userId];
        return null;
      }

      return entry.roles;
    } catch (error) {
      console.error('[permissionService] getCachedRoles error:', error);
      return null;
    }
  },

  /**
   * Clears permission cache.
   *
   * @param userId - Optional user ID. If provided, clear only that user. If not, clear all.
   *
   * @example
   * // Clear specific user
   * permissionService.clearCache(userId);
   *
   * @example
   * // Clear all (on logout)
   * permissionService.clearCache();
   */
  clearCache(userId?: string): void {
    try {
      if (userId) {
        delete cache[userId];
        console.log(`[permissionService] Cache cleared for user: ${userId}`);
      } else {
        Object.keys(cache).forEach((key) => delete cache[key]);
        console.log('[permissionService] Cache cleared (all users)');
      }
    } catch (error) {
      console.error('[permissionService] clearCache error:', error);
    }
  },

  /**
   * Refreshes permissions for the current user.
   * Bypasses cache and fetches fresh from database.
   *
   * @returns Promise resolving to fresh permissions
   *
   * @example
   * await permissionService.refreshCurrentUserPermissions();
   */
  async refreshCurrentUserPermissions(): Promise<UserPermission[]> {
    try {
      // Get current user from session
      const user = await customAuth.getCurrentUserFromSession();

      if (!user) {
        console.log('[permissionService] No authenticated user found');
        return [];
      }

      console.log(`[permissionService] Refreshing permissions for user: ${user.id}`);

      // Clear cache for this user
      this.clearCache(user.id);

      // Fetch fresh permissions
      const permissions = await this.getUserPermissions(user.id);

      console.log(`[permissionService] Refreshed ${permissions.length} permissions`);

      return permissions;
    } catch (error) {
      console.error('[permissionService] refreshCurrentUserPermissions error:', error);
      return [];
    }
  },
};
