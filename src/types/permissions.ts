/**
 * Permission System Type Definitions
 *
 * This file contains all type definitions for the LUB permission system.
 * It extends the base User type from auth.types.ts with role and permission data.
 */

import { User } from './auth.types';
import { UserRole } from '../lib/supabase';

/**
 * Permission granted to a user through their role(s).
 *
 * This data structure matches the return value from the database function
 * get_user_permissions(user_id).
 *
 * @example
 * {
 *   code: 'members.view',
 *   name: 'View Members',
 *   description: 'Allows viewing member registration list and details',
 *   category: 'members',
 *   granted_at: '2024-01-15T10:30:00Z'
 * }
 */
export interface UserPermission {
  /**
   * Unique permission code in format: category.action
   * Used for programmatic permission checks.
   *
   * @example 'members.view', 'members.create', 'settings.edit', 'system.admin'
   */
  code: string;

  /**
   * Human-readable permission name
   * Used for displaying in UI.
   *
   * @example 'View Members', 'Create Member', 'Edit Settings'
   */
  name: string;

  /**
   * Detailed description of what this permission allows
   * Helps admins understand what they're granting.
   *
   * @example 'Allows viewing member registration list and details'
   */
  description: string;

  /**
   * Category for grouping related permissions
   * Used for organizing permissions in UI.
   *
   * @example 'members', 'settings', 'system', 'registrations', 'users'
   */
  category: string;

  /**
   * When this permission was granted to the user (via role assignment)
   * ISO 8601 timestamp.
   *
   * @example '2024-01-15T10:30:00Z'
   */
  granted_at: string;
}

/**
 * Extended User type that includes roles and permissions.
 *
 * This extends the base User type from auth.types.ts without modifying it,
 * ensuring backward compatibility with existing code.
 *
 * Use this type when you need both user authentication data and permission data.
 *
 * @example
 * const user: ExtendedUser = await customAuth.getCurrentUserWithPermissions();
 * console.log(user.email); // From base User
 * console.log(user.primaryRole); // From ExtendedUser
 * console.log(user.permissions); // From ExtendedUser
 */
export interface ExtendedUser extends User {
  /**
   * All roles assigned to this user from the user_roles table.
   *
   * Array because a user could theoretically have multiple roles
   * (though typically they have one primary role).
   *
   * @example [{ id: '...', user_id: '...', role: 'admin', ... }]
   */
  roles: UserRole[];

  /**
   * All permissions this user has across all their roles.
   *
   * This is a deduplicated list aggregated from the role_permissions table
   * for all roles the user has. If multiple roles grant the same permission,
   * it appears only once in this array.
   *
   * @example [{ code: 'members.view', name: 'View Members', ... }]
   */
  permissions: UserPermission[];

  /**
   * Primary role (highest priority) for quick access.
   *
   * Priority order: super_admin > admin > editor > viewer
   *
   * Null if user has no roles assigned (which shouldn't happen for admin users
   * but could happen during account setup).
   *
   * @example 'super_admin', 'admin', 'editor', 'viewer', or null
   */
  primaryRole: 'super_admin' | 'admin' | 'manager' | 'editor' | 'viewer' | null;
}

/**
 * In-memory cache entry for user permissions.
 *
 * Stores permissions and roles with expiration timestamp.
 * Used by permissionService to avoid repeated database queries.
 *
 * Note: Stored in memory only (not localStorage) to avoid stale data issues
 * when roles/permissions are changed by admins.
 */
export interface PermissionCache {
  /**
   * User ID this cache entry belongs to
   *
   * @example 'abc123-def456-ghi789'
   */
  userId: string;

  /**
   * Cached permissions array
   * Full UserPermission objects with all fields.
   */
  permissions: UserPermission[];

  /**
   * Cached roles array
   * Full UserRole objects from user_roles table.
   */
  roles: UserRole[];

  /**
   * When this cache entry was created
   * Unix timestamp in milliseconds (from Date.now()).
   *
   * @example 1704038400000
   */
  cachedAt: number;

  /**
   * When this cache entry expires
   * Unix timestamp in milliseconds.
   * Calculated as: cachedAt + TTL (5 minutes).
   *
   * After this time, cache is considered stale and will be invalidated.
   *
   * @example 1704038700000 (5 minutes after cachedAt)
   */
  expiresAt: number;
}

/**
 * In-memory cache storage structure.
 *
 * Maps userId to PermissionCache entry.
 * Used internally by permissionService for fast permission lookups.
 *
 * @example
 * {
 *   'user-abc-123': { userId: 'user-abc-123', permissions: [...], ... },
 *   'user-def-456': { userId: 'user-def-456', permissions: [...], ... }
 * }
 */
export interface PermissionCacheStore {
  [userId: string]: PermissionCache;
}

/**
 * Permission error codes for specific error scenarios.
 * Used by permissionService to provide detailed error information.
 */
export enum PermissionErrorCode {
  /** User is not authenticated */
  NOT_AUTHENTICATED = 'not_authenticated',

  /** User has no roles assigned */
  NO_ROLES_ASSIGNED = 'no_roles_assigned',

  /** Database query failed */
  DATABASE_ERROR = 'database_error',

  /** Network request failed */
  NETWORK_ERROR = 'network_error',

  /** Invalid permission code format */
  INVALID_PERMISSION_CODE = 'invalid_permission_code',

  /** Permission check timed out */
  TIMEOUT_ERROR = 'timeout_error',
}

/**
 * Custom error class for permission-related errors.
 * Extends Error with additional context fields.
 */
export class PermissionError extends Error {
  /** Error code from PermissionErrorCode enum */
  code: PermissionErrorCode;

  /** Original error that caused this PermissionError (if any) */
  originalError?: Error;

  /** User ID involved in the error (if applicable) */
  userId?: string;

  /** Permission code involved in the error (if applicable) */
  permissionCode?: string;

  /**
   * Creates a new PermissionError
   *
   * @param code - Error code from PermissionErrorCode enum
   * @param message - Human-readable error message
   * @param originalError - Original error that caused this (optional)
   * @param context - Additional context (userId, permissionCode)
   *
   * @example
   * throw new PermissionError(
   *   PermissionErrorCode.DATABASE_ERROR,
   *   'Failed to fetch user permissions',
   *   error,
   *   { userId: 'abc-123' }
   * );
   */
  constructor(
    code: PermissionErrorCode,
    message: string,
    originalError?: Error,
    context?: { userId?: string; permissionCode?: string }
  ) {
    super(message);
    this.name = 'PermissionError';
    this.code = code;
    this.originalError = originalError;
    this.userId = context?.userId;
    this.permissionCode = context?.permissionCode;

    // Maintains proper stack trace for where error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PermissionError);
    }
  }
}
