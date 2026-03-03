/**
 * Unified Logout Service
 * Centralizes all logout logic to ensure consistent cleanup across the application
 */

import { memberAuthService } from './memberAuth';

export const logoutService = {
  /**
   * Logout for member users
   * Clears all authentication and redirects to sign in page
   */
  async logoutMember(): Promise<void> {
    try {
      console.log('[logoutService] Starting member logout...');

      await memberAuthService.signOutMember();

      localStorage.clear();
      sessionStorage.clear();

      console.log('[logoutService] Member logout complete');

      window.location.href = '/signin';
    } catch (error) {
      console.error('[logoutService] Error during member logout:', error);
      // Even on error, force redirect to ensure user is logged out
      window.location.href = '/signin';
    }
  },

  /**
   * Logout for admin users
   * Clears all authentication and redirects to admin login page
   */
  async logoutAdmin(): Promise<void> {
    try {
      console.log('[logoutService] Starting admin logout...');

      await memberAuthService.signOutMember();

      localStorage.clear();
      sessionStorage.clear();

      console.log('[logoutService] Admin logout complete');

      window.location.href = '/admin/login';
    } catch (error) {
      console.error('[logoutService] Error during admin logout:', error);
      // Even on error, force redirect to ensure user is logged out
      window.location.href = '/admin/login';
    }
  }
};
