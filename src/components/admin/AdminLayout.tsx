import { Navigate, Outlet } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { sessionManager } from '../../lib/sessionManager';
import { customAuth } from '../../lib/customAuth';
import { logoutService } from '../../lib/logoutService';
import { LogOut } from 'lucide-react';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { Separator } from '@/components/ui/separator';

export function AdminLayout() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    let isMounted = true;

    const checkAuth = async () => {
      try {
        const sessionToken = sessionManager.getSessionToken();

        if (!sessionToken) {
          if (!isMounted) return;
          setIsAuthenticated(false);
          setIsLoading(false);
          return;
        }

        if (sessionManager.isSessionExpired()) {
          sessionManager.clearSession();
          if (!isMounted) return;
          setIsAuthenticated(false);
          setIsLoading(false);
          return;
        }

        const userData = await customAuth.getCurrentUserFromSession();

        if (!isMounted) return;

        if (!userData) {
          setIsAuthenticated(false);
          setIsLoading(false);
          return;
        }

        const hasAdminAccess =
          userData.account_type === 'admin' ||
          userData.account_type === 'both';

        setIsAuthenticated(hasAdminAccess);
        setUserEmail(userData.email || '');
        setIsLoading(false);
      } catch (error) {
        console.error('Auth check failed:', error);
        setIsAuthenticated(false);
        setIsLoading(false);
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

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/signin" replace />;
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        {/* Top header bar */}
        <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="h-4" />
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
        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
