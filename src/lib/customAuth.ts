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

export const isEmail = (input: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(input);
};

export const isMobileNumber = (input: string): boolean => {
  const mobileRegex = /^[1-9][0-9]{9}$/;
  return mobileRegex.test(input.replace(/\D/g, ''));
};

export const customAuth = {
  async signIn(
    identifier: string,
    password: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<AuthResult> {
    try {
      console.log('[customAuth] Sign in attempt for:', identifier.substring(0, 3) + '***');

      const isEmailInput = isEmail(identifier);
      const isMobileInput = isMobileNumber(identifier);

      if (!isEmailInput && !isMobileInput) {
        return {
          success: false,
          error: 'Please enter a valid email address or 10-digit mobile number',
          errorCode: AuthErrorCode.INVALID_CREDENTIALS,
        };
      }

      let query = supabase
        .from('users')
        .select('*');

      if (isEmailInput) {
        query = query.eq('email', identifier.toLowerCase());
      } else {
        const cleanMobile = identifier.replace(/\D/g, '');
        query = query.eq('mobile_number', cleanMobile);
      }

      const { data: user, error: fetchError } = await query.maybeSingle();

      if (fetchError) {
        console.error('[customAuth] Database error:', fetchError);
        return {
          success: false,
          error: 'An error occurred. Please try again.',
          errorCode: AuthErrorCode.NETWORK_ERROR,
        };
      }

      if (!user) {
        console.log('[customAuth] User not found');
        return {
          success: false,
          error: 'Invalid email/mobile number or password',
          errorCode: AuthErrorCode.INVALID_CREDENTIALS,
        };
      }

      const accountStatus = await this.checkAccountStatus(user.id);

      if (accountStatus.isLocked) {
        const lockedUntil = new Date(accountStatus.lockedUntil!);
        const now = new Date();

        if (now < lockedUntil) {
          const minutesLeft = Math.ceil((lockedUntil.getTime() - now.getTime()) / (1000 * 60));
          return {
            success: false,
            error: `Account is locked due to too many failed login attempts. Please try again in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}.`,
            errorCode: AuthErrorCode.ACCOUNT_LOCKED,
            accountStatus: 'locked',
            lockedUntil: accountStatus.lockedUntil,
          };
        } else {
          await supabase
            .from('users')
            .update({
              account_status: 'active',
              locked_until: null,
              failed_login_attempts: 0,
            })
            .eq('id', user.id);
        }
      }

      if (user.account_status === 'suspended') {
        return {
          success: false,
          error: 'Your account has been suspended. Please contact support.',
          errorCode: AuthErrorCode.ACCOUNT_SUSPENDED,
          accountStatus: 'suspended',
        };
      }

      const { data: passwordValid, error: verifyError } = await supabase.rpc(
        'verify_password',
        {
          password: password,
          password_hash: user.password_hash,
        }
      );

      if (verifyError) {
        console.error('[customAuth] Password verification error:', verifyError);
        return {
          success: false,
          error: 'An error occurred. Please try again.',
          errorCode: AuthErrorCode.NETWORK_ERROR,
        };
      }

      if (!passwordValid) {
        console.log('[customAuth] Invalid password');

        const newFailedAttempts = (user.failed_login_attempts || 0) + 1;
        const updateData: any = {
          failed_login_attempts: newFailedAttempts,
        };

        if (newFailedAttempts >= 5) {
          const lockUntil = new Date();
          lockUntil.setMinutes(lockUntil.getMinutes() + 30);

          updateData.account_status = 'locked';
          updateData.locked_until = lockUntil.toISOString();

          await supabase
            .from('users')
            .update(updateData)
            .eq('id', user.id);

          return {
            success: false,
            error: 'Too many failed login attempts. Your account has been locked for 30 minutes.',
            errorCode: AuthErrorCode.ACCOUNT_LOCKED,
            accountStatus: 'locked',
            lockedUntil: updateData.locked_until,
          };
        }

        await supabase
          .from('users')
          .update(updateData)
          .eq('id', user.id);

        const attemptsLeft = 5 - newFailedAttempts;
        return {
          success: false,
          error: `Invalid email/mobile number or password. ${attemptsLeft} attempt${attemptsLeft !== 1 ? 's' : ''} remaining.`,
          errorCode: AuthErrorCode.INVALID_CREDENTIALS,
        };
      }

      if (user.is_frozen) {
        return {
          success: false,
          error: 'Your account has been frozen. Please contact administrator.',
          errorCode: AuthErrorCode.ACCOUNT_FROZEN,
        };
      }

      if (user.account_status === 'password_pending') {
        console.log('[customAuth] User needs to set password (legacy member)');
        return {
          success: false,
          error: 'Please use "Forgot Password" to set your password for the first time.',
          errorCode: AuthErrorCode.PASSWORD_PENDING,
          accountStatus: 'password_pending',
        };
      }

      try {
        const { data: loginStatus, error: loginCheckError } = await supabase.rpc('get_member_login_status', {
          p_user_id: user.id,
        });

        if (!loginCheckError && loginStatus && loginStatus.can_login === false) {
          return {
            success: false,
            error: loginStatus.reason || 'Your LUB member account is deactivated. Please contact admin.',
            errorCode: AuthErrorCode.ACCOUNT_FROZEN,
          };
        }
      } catch (e) {
        console.error('[customAuth] get_member_login_status failed:', e);
      }

      const sessionData = await this.createSession(user.id, ipAddress, userAgent);

      // ✅ FIX: Conditional update - only include locked_until if it was actually set
      const updateData: any = {
        last_login_at: new Date().toISOString(),
        failed_login_attempts: 0,
      };

      // Only reset locked_until if the user was actually locked
      if (user.locked_until) {
        updateData.locked_until = null;
      }

      await supabase
        .from('users')
        .update(updateData)
        .eq('id', user.id);

     console.log('[customAuth] Sign in successful for user:', user.id);

// ✅ NEW: Fetch member registration data to get full_name and profile_photo_url
const { data: memberReg, error: memberError } = await supabase
  .from('member_registrations')
  .select('full_name, profile_photo_url, company_name, status, member_id, approval_date, rejection_reason, reapplication_count, created_at')
  .eq('email', user.email)
  .maybeSingle();

if (memberError) {
  console.error('[customAuth] Error fetching member registration:', memberError);
}

// ✅ NEW: Combine user data with member registration data
const combinedUser = {
  ...user,
  full_name: memberReg?.full_name || '',
  profile_photo_url: memberReg?.profile_photo_url || null,
  company_name: memberReg?.company_name || '',
  status: memberReg?.status || 'pending',
  member_id: memberReg?.member_id || null,
  approval_date: memberReg?.approval_date || null,
  rejection_reason: memberReg?.rejection_reason || null,
  reapplication_count: memberReg?.reapplication_count || 0,
};

console.log('[customAuth] Combined user data with full_name:', combinedUser.full_name);

return {
  success: true,
  sessionToken: sessionData.sessionToken,
  user: combinedUser as User,
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

      const { data: session, error: sessionError } = await supabase
        .from('auth_sessions')
        .select('*, users(*)')
        .eq('session_token', sessionToken)
        .maybeSingle();

      if (sessionError) {
        console.error('[customAuth] Session validation error:', sessionError);
        return {
          isValid: false,
          error: 'Session validation failed',
          errorCode: AuthErrorCode.SESSION_INVALID,
        };
      }

      if (!session) {
        return {
          isValid: false,
          error: 'Invalid session',
          errorCode: AuthErrorCode.SESSION_INVALID,
        };
      }

      const expiresAt = new Date(session.expires_at);
      const now = new Date();

      if (now >= expiresAt) {
        await supabase
          .from('auth_sessions')
          .delete()
          .eq('session_token', sessionToken);

        return {
          isValid: false,
          error: 'Session expired',
          errorCode: AuthErrorCode.SESSION_EXPIRED,
        };
      }

      const user = Array.isArray(session.users) ? session.users[0] : session.users;

      if (!user) {
        return {
          isValid: false,
          error: 'User not found',
          errorCode: AuthErrorCode.USER_NOT_FOUND,
        };
      }

      return {
        isValid: true,
        user,
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

      const now = new Date();
      const newExpiresAt = new Date();
      newExpiresAt.setDate(newExpiresAt.getDate() + 7);

      const { error } = await supabase
        .from('auth_sessions')
        .update({
          last_activity_at: now.toISOString(),
          expires_at: newExpiresAt.toISOString(),
        })
        .eq('session_token', sessionToken);

      if (error) {
        console.error('[customAuth] Session refresh error:', error);
        return false;
      }

      return true;
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

      await supabase
        .from('auth_sessions')
        .delete()
        .eq('session_token', sessionToken);

      // Clear permission cache
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

  async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string
  ): Promise<PasswordChangeResult> {
    try {
      const { data: user, error: fetchError } = await supabase
        .from('users')
        .select('password_hash')
        .eq('id', userId)
        .maybeSingle();

      if (fetchError || !user) {
        return {
          success: false,
          error: 'User not found',
          errorCode: AuthErrorCode.USER_NOT_FOUND,
        };
      }

      const { data: oldPasswordValid, error: verifyError } = await supabase.rpc(
        'verify_password',
        {
          password: oldPassword,
          password_hash: user.password_hash,
        }
      );

      if (verifyError || !oldPasswordValid) {
        return {
          success: false,
          error: 'Current password is incorrect',
          errorCode: AuthErrorCode.INVALID_CREDENTIALS,
        };
      }

      if (newPassword.length < 8) {
        return {
          success: false,
          error: 'Password must be at least 8 characters long',
          errorCode: AuthErrorCode.WEAK_PASSWORD,
        };
      }

      if (!/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
        return {
          success: false,
          error: 'Password must contain uppercase, lowercase, and numbers',
          errorCode: AuthErrorCode.WEAK_PASSWORD,
        };
      }

      const { data: newPasswordHash, error: hashError } = await supabase.rpc(
        'hash_password',
        { password: newPassword }
      );

      if (hashError || !newPasswordHash) {
        return {
          success: false,
          error: 'Failed to hash password',
          errorCode: AuthErrorCode.NETWORK_ERROR,
        };
      }

      const { error: updateError } = await supabase
        .from('users')
        .update({
          password_hash: newPasswordHash,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

      if (updateError) {
        console.error('[customAuth] Password update error:', updateError);
        return {
          success: false,
          error: 'Failed to update password',
          errorCode: AuthErrorCode.NETWORK_ERROR,
        };
      }

      await supabase
        .from('auth_sessions')
        .delete()
        .eq('user_id', userId);

      return {
        success: true,
      };
    } catch (error) {
      console.error('[customAuth] Change password error:', error);
      return {
        success: false,
        error: 'An unexpected error occurred',
        errorCode: AuthErrorCode.NETWORK_ERROR,
      };
    }
  },

  async checkAccountStatus(userId: string): Promise<AccountStatus> {
    try {
      const { data: user, error } = await supabase
        .from('users')
        .select('account_status, failed_login_attempts, locked_until')
        .eq('id', userId)
        .maybeSingle();

      if (error || !user) {
        return {
          status: 'suspended',
          isLocked: false,
          failedAttempts: 0,
        };
      }

      const isLocked = user.account_status === 'locked' &&
                       user.locked_until &&
                       new Date(user.locked_until) > new Date();

      return {
        status: user.account_status as 'active' | 'password_pending' | 'locked' | 'suspended',
        isLocked,
        lockedUntil: user.locked_until,
        failedAttempts: user.failed_login_attempts || 0,
      };
    } catch (error) {
      console.error('[customAuth] Check account status error:', error);
      return {
        status: 'suspended',
        isLocked: false,
        failedAttempts: 0,
      };
    }
  },

  async setUserContext(userId: string): Promise<boolean> {
    try {
      const { error } = await supabase.rpc('set_session_user', {
        session_user_id: userId,
      });

      if (error) {
        console.error('[customAuth] Set user context error:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('[customAuth] Set user context error:', error);
      return false;
    }
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

      const hasMemberAccess = user.account_type === 'member' || user.account_type === 'both';
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
      // Get base user from session
      const user = await this.getCurrentUserFromSession();

      if (!user) {
        console.log('[customAuth] No authenticated user found');
        return null;
      }

      console.log('[customAuth] Fetching permissions for user:', user.id);

      // Fetch roles and permissions
      const [roles, permissions] = await Promise.all([
        permissionService.getUserRoles(user.id),
        permissionService.getUserPermissions(user.id),
      ]);

      // Calculate primary role (highest priority)
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

      // Construct ExtendedUser object
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
   * // Check current user
   * const isSuperAdmin = await customAuth.isUserSuperAdmin();
   *
   * @example
   * // Check specific user
   * const isSuperAdmin = await customAuth.isUserSuperAdmin(userId);
   */
  async isUserSuperAdmin(userId?: string): Promise<boolean> {
    try {
      let targetUserId = userId;

      // If no userId provided, use current user
      if (!targetUserId) {
        const user = await this.getCurrentUserFromSession();
        if (!user) {
          console.log('[customAuth] No authenticated user found');
          return false;
        }
        targetUserId = user.id;
      }

      console.log('[customAuth] Checking super admin status for user:', targetUserId);

      // Get user roles
      const roles = await permissionService.getUserRoles(targetUserId);

      // Check if any role is super_admin
      const isSuperAdmin = roles.some((role) => role.role === 'super_admin');

      console.log(`[customAuth] User ${targetUserId} is super admin: ${isSuperAdmin}`);

      return isSuperAdmin;
    } catch (error) {
      console.error('[customAuth] isUserSuperAdmin error:', error);
      // Fail closed - return false on error
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
   *
   * @example
   * const roles = await customAuth.getUserRoles(userId);
   * console.log('User roles:', roles);
   */
  async getUserRoles(userId: string): Promise<UserRole[]> {
    try {
      if (!userId) {
        console.error('[customAuth] getUserRoles: userId is required');
        return [];
      }

      console.log('[customAuth] Fetching roles for user:', userId);

      // Delegate to permissionService
      const roles = await permissionService.getUserRoles(userId);

      console.log(`[customAuth] Fetched ${roles.length} roles for user ${userId}`);

      return roles;
    } catch (error) {
      console.error('[customAuth] getUserRoles error:', error);
      // Fail closed - return empty array on error
      return [];
    }
  },
};