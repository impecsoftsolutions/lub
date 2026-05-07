import { Navigate, Outlet } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { sessionManager } from '../../lib/sessionManager';
import { customAuth } from '../../lib/customAuth';
import { logoutService } from '../../lib/logoutService';
import { permissionService } from '../../lib/permissionService';
import { hasAdminPanelAccess } from '../../lib/adminAccess';
import { LogOut } from 'lucide-react';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { Separator } from '@/components/ui/separator';

type AuthState =
  | { status: 'loading' }
  | { status: 'unauthenticated' }
  | { status: 'authenticated-unauthorized' }
  | { status: 'authorized'; userEmail: string };

export function AdminLayout() {
  const [authState, setAuthState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    let isMounted = true;

    const checkAuth = async () => {
      try {
        const sessionToken = sessionManager.getSessionToken();

        if (!sessionToken) {
          if (!isMounted) return;
          setAuthState({ status: 'unauthenticated' });
          return;
        }

        if (sessionManager.isSessionExpired()) {
          sessionManager.clearSession();
          if (!isMounted) return;
          setAuthState({ status: 'unauthenticated' });
          return;
        }

        const userData = await customAuth.getCurrentUserFromSession();

        if (!isMounted) return;

        if (!userData) {
          setAuthState({ status: 'unauthenticated' });
          return;
        }

        // 056: admit anyone with at least one admin-domain permission so
        // permissioned non-admins (e.g. role=editor with events.rsvp.view
        // override) can actually reach the admin shell their permissions
        // already authorize them to use. The accountType + portal.admin_access
        // fast-paths are kept as cheap pre-checks; the broader permission
        // sweep runs only when those don't already grant access. Per-page
        // <PermissionGate> + server _with_session RPC checks remain the
        // authoritative authorization for individual modules.
        let hasAdminAccess =
          userData.account_type === 'admin' ||
          userData.account_type === 'both';

        if (!hasAdminAccess) {
          // Fast path: the explicit portal grant.
          hasAdminAccess = await permissionService.hasPermission(userData.id, 'portal.admin_access');
        }

        if (!hasAdminAccess) {
          // Broad path: any admin-domain permission via role/override.
          const userPerms = await permissionService.getUserPermissions(userData.id);
          hasAdminAccess = hasAdminPanelAccess(userData.account_type, userPerms);
        }

        if (!isMounted) return;

        if (hasAdminAccess) {
          setAuthState({ status: 'authorized', userEmail: userData.email || '' });
        } else {
          // Authenticated but lacks admin access — send to member dashboard.
          // Redirecting to /signin here would loop: SignIn re-reads the stored
          // pre-signin route and sends the user right back to /admin/*.
          setAuthState({ status: 'authenticated-unauthorized' });
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        if (!isMounted) return;
        setAuthState({ status: 'unauthenticated' });
      }
    };

    void checkAuth();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSignOut = async () => {
    await logoutService.logoutAdmin();
  };

  if (authState.status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (authState.status === 'unauthenticated') {
    return <Navigate to="/signin" replace />;
  }

  if (authState.status === 'authenticated-unauthorized') {
    return <Navigate to="/dashboard" replace />;
  }

  const userEmail = authState.userEmail;

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        {/* Top header bar */}
        <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
          <SidebarTrigger className="-ml-1 md:hidden" />
          <Separator orientation="vertical" className="h-4 md:hidden" />
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:block">{userEmail}</span>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:block">Sign out</span>
            </button>
          </div>
        </header>
        {/* Page content */}
        <div className="flex-1 overflow-auto p-4 sm:p-6">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
