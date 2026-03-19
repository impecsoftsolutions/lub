import { supabase } from './supabase';
import {
  User,
  AuthResult,
  SessionData,
  SessionValidation,
  AccountStatus,
  PasswordChangeResult,
  AuthErrorCode,
} from '../types/auth.types';
import { permissionService } from './permissionService';
import type { ExtendedUser } from '../types/permissions';
import type { UserRole } from './supabase';
export {
  AUTH_VALIDATION_MESSAGES,
  isEmail,
  isMobileNumber,
  normalizeEmail,
  normalizeMobileNumber,
  validateEmailInput,
  validateMobileNumberInput
} from './credentialValidation';
import {
  isEmail,
  isMobileNumber,
  normalizeEmail,
  normalizeMobileNumber
} from './credentialValidation';

const mapAuthErrorCode = (value?: string): AuthErrorCode | undefined => {
  if (!value) {
    return undefined;
  }

  return Object.values(AuthErrorCode).includes(value as AuthErrorCode)
    ? (value as AuthErrorCode)
    : undefined;
};

export const customAuth = {
  async signIn(
    email: string,
    mobileNumber: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<AuthResult> {
    try {
      const normalizedEmail = normalizeEmail(email);
      const normalizedMobile = normalizeMobileNumber(mobileNumber);
      console.log('[customAuth] Sign in attempt for:', normalizedEmail.substring(0, 3) + '***');

      if (!isEmail(normalizedEmail) || !isMobileNumber(normalizedMobile)) {
        return {
          success: false,
          error: 'Invalid credentials',
          errorCode: AuthErrorCode.INVALID_CREDENTIALS,
        };
      }

      const { data: userRows, error: fetchError } = await supabase.rpc(
        'lookup_user_for_login',
        { p_email: normalizedEmail }
      );

      if (fetchError) {
        console.error('[customAuth] Database error:', fetchError);
        return {
          success: false,
          error: 'An error occurred. Please try again.',
          errorCode: AuthErrorCode.NETWORK_ERROR,
        };
      }

      const user = Array.isArray(userRows) ? userRows[0] : null;

      if (!user) {
        console.log('[customAuth] User not found');
        return {
          success: false,
          error: 'Invalid credentials',
          errorCode: AuthErrorCode.INVALID_CREDENTIALS,
        };
      }

      if (user.account_status === 'locked' && user.locked_until) {
        const lockedUntil = new Date(user.locked_until);
        const now = new Date();

        if (now < lockedUntil) {
          const minutesLeft = Math.ceil((lockedUntil.getTime() - now.getTime()) / (1000 * 60));
          return {
            success: false,
            error: `Account is locked due to too many failed login attempts. Please try again in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}.`,
            errorCode: AuthErrorCode.ACCOUNT_LOCKED,
            accountStatus: 'locked',
            lockedUntil: user.locked_until,
          };
        }
      }

      if (user.account_status === 'suspended' || user.is_active === false) {
        return {
          success: false,
          error: 'Your account has been suspended. Please contact support.',
          errorCode: AuthErrorCode.ACCOUNT_SUSPENDED,
          accountStatus: 'suspended',
        };
      }

      if (user.is_frozen) {
        return {
          success: false,
          error: 'Your account has been frozen. Please contact administrator.',
          errorCode: AuthErrorCode.ACCOUNT_FROZEN,
        };
      }

      if (user.member_can_login === false) {
        return {
          success: false,
          error: user.member_login_reason || 'Your LUB member account is deactivated. Please contact admin.',
          errorCode: AuthErrorCode.ACCOUNT_FROZEN,
        };
      }

      if (normalizeMobileNumber(user.mobile_number || '') !== normalizedMobile) {
        const { data: failedAttemptData, error: failedAttemptError } = await supabase.rpc(
          'record_failed_login_attempt',
          { p_user_id: user.id }
        );

        if (failedAttemptError) {
          console.error('[customAuth] Failed login attempt update error:', failedAttemptError);
        }

        const failedAttemptResult = Array.isArray(failedAttemptData)
          ? failedAttemptData[0]
          : failedAttemptData;

        if (failedAttemptResult?.isLocked) {
          return {
            success: false,
            error: 'Too many failed login attempts. Your account has been locked for 30 minutes.',
            errorCode: AuthErrorCode.ACCOUNT_LOCKED,
            accountStatus: 'locked',
            lockedUntil: failedAttemptResult.lockedUntil,
          };
        }

        return {
          success: false,
          error: 'Invalid credentials',
          errorCode: AuthErrorCode.INVALID_CREDENTIALS,
        };
      }

      const sessionData = await this.createSession(user.id, ipAddress, userAgent);
      const { error: loginSuccessError } = await supabase.rpc('mark_user_login_success', {
        p_user_id: user.id,
      });

      if (loginSuccessError) {
        console.error('[customAuth] Failed to mark successful login:', loginSuccessError);
      }

      const authenticatedUser = {
        ...user,
        last_login_at: new Date().toISOString(),
        failed_login_attempts: 0,
        locked_until: null,
      };

      console.log('[customAuth] Sign in successful for user:', user.id);

      return {
        success: true,
        sessionToken: sessionData.sessionToken,
        user: authenticatedUser as User,
      };
    } catch (error) {
      console.error('[customAuth] Sign in error:', error);
      return {
        success: false,
        error: 'An unexpected error occurred. Please try again.',
        errorCode: AuthErrorCode.NETWORK_ERROR,
      };
    }
  },

  async createSession(
    userId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<SessionData> {
    try {
      const { data: sessionToken, error: tokenError } = await supabase.rpc(
        'generate_session_token'
      );

      if (tokenError || !sessionToken) {
        throw new Error('Failed to generate session token');
      }

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const { error: insertError } = await supabase
        .from('auth_sessions')
        .insert({
          user_id: userId,
          session_token: sessionToken,
          ip_address: ipAddress || null,
          user_agent: userAgent || null,
          expires_at: expiresAt.toISOString(),
          last_activity_at: new Date().toISOString(),
        });

      if (insertError) {
        console.error('[customAuth] Session creation error:', insertError);
        throw new Error('Failed to create session');
      }

      return {
        sessionToken,
        expiresAt: expiresAt.toISOString(),
        userId,
      };
    } catch (error) {
      console.error('[customAuth] Create session error:', error);
      throw error;
    }
  },

  async validateSession(sessionToken: string): Promise<SessionValidation> {
    try {
      if (!sessionToken) {
        return {
          isValid: false,
          error: 'No session token provided',
          errorCode: AuthErrorCode.SESSION_INVALID,
        };
      }

      const { data, error: sessionError } = await supabase.rpc(
        'get_session_user_by_token',
        { p_session_token: sessionToken }
      );

      if (sessionError) {
        console.error('[customAuth] Session validation error:', sessionError);
        return {
          isValid: false,
          error: 'Session validation failed',
          errorCode: AuthErrorCode.SESSION_INVALID,
        };
      }

      const validation = Array.isArray(data) ? data[0] : data;

      if (!validation?.isValid) {
        return {
          isValid: false,
          error: validation?.error || 'Invalid session',
          errorCode: mapAuthErrorCode(validation?.errorCode) || AuthErrorCode.SESSION_INVALID,
        };
      }

      return {
        isValid: true,
        user: validation.user as User,
      };
    } catch (error) {
      console.error('[customAuth] Validate session error:', error);
      return {
        isValid: false,
        error: 'An unexpected error occurred',
        errorCode: AuthErrorCode.NETWORK_ERROR,
      };
    }
  },

  async refreshSession(sessionToken: string): Promise<boolean> {
    try {
      if (!sessionToken) {
        return false;
      }

      const { data, error } = await supabase.rpc('refresh_session_by_token', {
        p_session_token: sessionToken,
      });

      if (error) {
        console.error('[customAuth] Session refresh error:', error);
        return false;
      }

      const result = Array.isArray(data) ? data[0] : data;
      return Boolean(result?.success);
    } catch (error) {
      console.error('[customAuth] Refresh session error:', error);
      return false;
    }
  },

  async signOut(sessionToken: string): Promise<void> {
    try {
      if (!sessionToken) {
        return;
      }

      const { error } = await supabase.rpc('delete_session_by_token', {
        p_session_token: sessionToken,
      });

      if (error) {
        console.error('[customAuth] Sign out error:', error);
      }

      permissionService.clearCache();
      console.log('[customAuth] Permission cache cleared on logout');
      console.log('[customAuth] Sign out successful');
    } catch (error) {
      console.error('[customAuth] Sign out error:', error);
    }
  },

  async getCurrentUser(sessionToken: string): Promise<User | null> {
    try {
      const validation = await this.validateSession(sessionToken);

      if (!validation.isValid || !validation.user) {
        return null;
      }

      return validation.user;
    } catch (error) {
      console.error('[customAuth] Get current user error:', error);
      return null;
    }
  },

  async changePassword(): Promise<PasswordChangeResult> {
    return {
      success: false,
      error: 'Password-based authentication is no longer supported.',
      errorCode: AuthErrorCode.INVALID_CREDENTIALS,
    };
  },

  async checkAccountStatus(): Promise<AccountStatus> {
    return {
      status: 'active',
      isLocked: false,
      failedAttempts: 0,
    };
  },

  async setUserContext(userId: string): Promise<boolean> {
    console.warn('[customAuth] setUserContext is deprecated and no longer used', userId);
    return true;
  },

  async getCurrentUserFromSession(): Promise<User | null> {
    try {
      const sessionManager = await import('./sessionManager');
      const sessionToken = sessionManager.sessionManager.getSessionToken();

      if (!sessionToken) {
        console.log('[customAuth] No session token found');
        return null;
      }

      const user = await this.getCurrentUser(sessionToken);
      return user;
    } catch (error) {
      console.error('[customAuth] Get current user from session error:', error);
      return null;
    }
  },

  async isAdmin(): Promise<boolean> {
    try {
      const user = await this.getCurrentUserFromSession();

      if (!user) {
        console.log('[customAuth] No authenticated user - not admin');
        return false;
      }

      const hasAdminAccess = user.account_type === 'admin' || user.account_type === 'both';
      console.log('[customAuth] User account_type:', user.account_type, '- hasAdminAccess:', hasAdminAccess);

      return hasAdminAccess;
    } catch (error) {
      console.error('[customAuth] isAdmin check error:', error);
      return false;
    }
  },

  async isMember(): Promise<boolean> {
    try {
      const user = await this.getCurrentUserFromSession();

      if (!user) {
        console.log('[customAuth] No authenticated user - not member');
        return false;
      }

      const hasMemberAccess =
        user.account_type === 'member' ||
        user.account_type === 'both' ||
        user.account_type === 'general_user';
      console.log('[customAuth] User account_type:', user.account_type, '- hasMemberAccess:', hasMemberAccess);

      return hasMemberAccess;
    } catch (error) {
      console.error('[customAuth] isMember check error:', error);
      return false;
    }
  },

  /**
   * Gets current user with their roles and permissions.
   *
   * This extends the base User object with permission data.
   *
   * @returns Promise resolving to ExtendedUser or null
   *
   * @example
   * const user = await customAuth.getCurrentUserWithPermissions();
   * if (user) {
   *   console.log('Primary role:', user.primaryRole);
   *   console.log('Permissions:', user.permissions);
   * }
   */
  async getCurrentUserWithPermissions(): Promise<ExtendedUser | null> {
    try {
      const user = await this.getCurrentUserFromSession();

      if (!user) {
        console.log('[customAuth] No authenticated user found');
        return null;
      }

      console.log('[customAuth] Fetching permissions for user:', user.id);

      const [roles, permissions] = await Promise.all([
        permissionService.getUserRoles(user.id),
        permissionService.getUserPermissions(user.id),
      ]);

      const calculatePrimaryRole = (
        userRoles: UserRole[]
      ): 'super_admin' | 'admin' | 'editor' | 'viewer' | null => {
        if (!userRoles || userRoles.length === 0) return null;

        const priority: Record<string, number> = {
          super_admin: 4,
          admin: 3,
          editor: 2,
          viewer: 1,
        };

        const sorted = [...userRoles].sort((a, b) => {
          const priorityA = priority[a.role] || 0;
          const priorityB = priority[b.role] || 0;
          return priorityB - priorityA;
        });

        return sorted[0].role;
      };

      const primaryRole = calculatePrimaryRole(roles);

      console.log(
        `[customAuth] User ${user.id} has ${roles.length} roles, ${permissions.length} permissions, primary role: ${primaryRole}`
      );

      const extendedUser: ExtendedUser = {
        ...user,
        roles,
        permissions,
        primaryRole,
      };

      return extendedUser;
    } catch (error) {
      console.error('[customAuth] getCurrentUserWithPermissions error:', error);
      return null;
    }
  },

  /**
   * Checks if a user is a super admin.
   *
   * @param userId - Optional user ID. If not provided, checks current user.
   * @returns Promise resolving to boolean
   *
   * @example
   * const isSuperAdmin = await customAuth.isUserSuperAdmin();
   */
  async isUserSuperAdmin(userId?: string): Promise<boolean> {
    try {
      let targetUserId = userId;

      if (!targetUserId) {
        const user = await this.getCurrentUserFromSession();
        if (!user) {
          console.log('[customAuth] No authenticated user found');
          return false;
        }
        targetUserId = user.id;
      }

      console.log('[customAuth] Checking super admin status for user:', targetUserId);

      const roles = await permissionService.getUserRoles(targetUserId);
      const isSuperAdmin = roles.some((role) => role.role === 'super_admin');

      console.log(`[customAuth] User ${targetUserId} is super admin: ${isSuperAdmin}`);

      return isSuperAdmin;
    } catch (error) {
      console.error('[customAuth] isUserSuperAdmin error:', error);
      return false;
    }
  },

  /**
   * Gets all roles for a user.
   *
   * Convenience wrapper around permissionService.getUserRoles()
   * to maintain consistency with customAuth API pattern.
   *
   * @param userId - User ID to fetch roles for
   * @returns Promise resolving to array of roles
   */
  async getUserRoles(userId: string): Promise<UserRole[]> {
    try {
      if (!userId) {
        console.error('[customAuth] getUserRoles: userId is required');
        return [];
      }

      console.log('[customAuth] Fetching roles for user:', userId);

      const roles = await permissionService.getUserRoles(userId);

      console.log(`[customAuth] Fetched ${roles.length} roles for user ${userId}`);

      return roles;
    } catch (error) {
      console.error('[customAuth] getUserRoles error:', error);
      return [];
    }
  },
};
