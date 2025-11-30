import { supabase } from './supabase';
import { userRolesService, UserRole } from './supabase';

export interface User {
  id: string;
  email: string;
  role?: string;
  roles?: UserRole[];
}

export const authService = {
  // Sign in with email and password
  async signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { data, error };
  },

  // Sign out
  async signOut() {
    const { error } = await supabase.auth.signOut();
    return { error };
  },

  // Get current user
  async getCurrentUser() {
    const { data: { user }, error } = await supabase.auth.getUser();
    return { user, error };
  },

  // Get current session
  async getCurrentSession() {
    const { data: { session }, error } = await supabase.auth.getSession();
    return { session, error };
  },

  // Listen to auth changes
  onAuthStateChange(callback: (event: string, session: any) => void) {
    return supabase.auth.onAuthStateChange(callback);
  },

  // Get current user with roles
  async getCurrentUserWithRoles(): Promise<{ user: User | null; error: any }> {
    try {
      const { user, error } = await this.getCurrentUser();
      
      if (error || !user) {
        return { user: null, error };
      }
      
      // Fetch user roles
      const roles = await userRolesService.getCurrentUserRoles();
      
      return {
        user: {
          ...user,
          roles
        },
        error: null
      };
    } catch (error) {
      return { user: null, error };
    }
  },

  // Check if user has admin role
  async isAdmin(): Promise<boolean> {
    try {
      const { user } = await this.getCurrentUser();
      if (!user) {
        console.log('No authenticated user - not admin');
        return false;
      }

      console.log('Checking admin status for user:', user.id);
      const roles = await userRolesService.getCurrentUserRoles();

      // Check if user has any admin-type role
      const adminRoles = ['super_admin', 'admin', 'editor', 'viewer'];
      const hasAdminRole = roles.some(r => adminRoles.includes(r.role));

      console.log('User roles:', roles.map(r => r.role).join(', '));
      console.log('User has admin access:', hasAdminRole);
      return hasAdminRole;
    } catch (error) {
      console.error('Error checking admin status:', error);
      return false;
    }
  },

  // Check if user has super admin role
  async isSuperAdmin(): Promise<boolean> {
    try {
      const { user } = await this.getCurrentUser();
      if (!user) {
        console.log('No authenticated user - not super admin');
        return false;
      }

      console.log('Checking super admin status for user:', user.id);
      const roles = await userRolesService.getCurrentUserRoles();

      // Check if user has super_admin role
      const hasSuperAdminRole = roles.some(r => r.role === 'super_admin');

      console.log('User has super admin access:', hasSuperAdminRole);
      return hasSuperAdminRole;
    } catch (error) {
      console.error('Error checking super admin status:', error);
      return false;
    }
  },

  // Check if user has specific role
  async hasRole(role: UserRole['role'] | UserRole['role'][]): Promise<boolean> {
    try {
      const roles = await userRolesService.getCurrentUserRoles();
      if (Array.isArray(role)) {
        return roles.some(r => role.includes(r.role));
      }
      return roles.some(r => r.role === role);
    } catch (error) {
      console.error('Error checking role:', error);
      return false;
    }
  }
};