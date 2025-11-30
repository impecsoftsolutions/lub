/**
 * Unified Logout Service
 * Centralizes all logout logic to ensure consistent cleanup across the application
 */

import { memberAuthService } from './memberAuth';
import { customAuth } from './customAuth';
import { sessionManager } from './sessionManager';
import { supabase } from './supabase';

export const logoutService = {
  /**
   * Logout for member users
   * Clears all authentication and redirects to sign in page
   */
  async logoutMember(): Promise<void> {
    try {
      console.log('[logoutService] Starting member logout...');

      // Clear member authentication
      await memberAuthService.signOutMember();

      // Get session token before clearing
      const sessionToken = sessionManager.getSessionToken();

      // Clear custom auth session from database
      if (sessionToken) {
        await customAuth.signOut(sessionToken);
      }

      // Clear all local storage
      localStorage.clear();
      sessionStorage.clear();

      // Clear Supabase session
      await supabase.auth.signOut();

      console.log('[logoutService] Member logout complete');

      // Force full page reload to reinitialize all contexts
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

      // Clear member authentication (admins may have member access too)
      await memberAuthService.signOutMember();

      // Get session token before clearing
      const sessionToken = sessionManager.getSessionToken();

      // Clear custom auth session from database
      if (sessionToken) {
        await customAuth.signOut(sessionToken);
      }

      // Clear all local storage
      localStorage.clear();
      sessionStorage.clear();

      // Clear Supabase session
      await supabase.auth.signOut();

      console.log('[logoutService] Admin logout complete');

      // Force full page reload to reinitialize all contexts
      window.location.href = '/admin/login';
    } catch (error) {
      console.error('[logoutService] Error during admin logout:', error);
      // Even on error, force redirect to ensure user is logged out
      window.location.href = '/admin/login';
    }
  }
};
