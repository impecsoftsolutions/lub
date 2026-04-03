import { Navigate, Outlet, Link, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { sessionManager } from '../../lib/sessionManager';
import { customAuth } from '../../lib/customAuth';
import { logoutService } from '../../lib/logoutService';
import {
  LayoutDashboard,
  Users,
  MapPin,
  Building2,
  Settings,
  Shield,
  BarChart3,
  ChevronDown,
  ChevronRight,
  Menu,
  X,
  LogOut
} from 'lucide-react';
import { useAdmin } from '../../contexts/useAdmin';
import { useOrganisationProfile } from '../../hooks/useOrganisationProfile';

interface MenuItem {
  label: string;
  path?: string;
  icon: React.ComponentType<{ className?: string }>;
  children?: { label: string; path: string; badge?: string }[];
  disabled?: boolean;
}

export function AdminLayout() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userEmail, setUserEmail] = useState('');
  const [expandedSections, setExpandedSections] = useState<string[]>(['Dashboard', 'Members', 'Locations']);
  const location = useLocation();
  const { sidebarCollapsed, toggleSidebar, pendingRegistrationsCount, pendingCitiesCount } = useAdmin();
  const { profile: orgProfile } = useOrganisationProfile();

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

  const menuItems: MenuItem[] = [
    {
      label: 'Dashboard',
      icon: LayoutDashboard,
      children: [
        { label: 'Overview', path: '/admin/dashboard' }
      ]
    },
    {
      label: 'Members',
      icon: Users,
      children: [
        {
          label: 'Registrations',
          path: '/admin/members/registrations',
          badge: pendingRegistrationsCount > 0 ? pendingRegistrationsCount.toString() : undefined
        },
        { label: 'Directory Visibility', path: '/admin/members/visibility' },
        { label: 'Deleted Members', path: '/admin/members/deleted' }
      ]
    },
    {
      label: 'Locations',
      icon: MapPin,
      children: [
        { label: 'States', path: '/admin/locations/states' },
        { label: 'Cities', path: '/admin/locations/cities' },
        {
          label: 'Pending Cities',
          path: '/admin/locations/pending-cities',
          badge: pendingCitiesCount > 0 ? pendingCitiesCount.toString() : undefined
        },
        { label: 'Payment Settings', path: '/admin/locations/payment-settings' }
      ]
    },
    {
      label: 'Organization',
      icon: Building2,
      children: [
        { label: 'Profile', path: '/admin/organization/profile' },
        { label: 'Designations', path: '/admin/organization/designations' }
      ]
    },
    {
      label: 'Settings',
      icon: Settings,
      children: [
        { label: 'Form Configuration', path: '/admin/settings/forms/join-lub' },
        { label: 'Validation Settings', path: '/admin/settings/validation' }
      ]
    },
    {
      label: 'Administration',
      icon: Shield,
      children: [
        { label: 'Users', path: '/admin/administration/users' }
      ]
    },
    {
      label: 'Analytics',
      icon: BarChart3,
      disabled: true,
      children: [
        { label: 'Coming Soon', path: '#' }
      ]
    }
  ];

  const toggleSection = (label: string) => {
    setExpandedSections(prev =>
      prev.includes(label)
        ? prev.filter(s => s !== label)
        : [...prev, label]
    );
  };

  const handleSignOut = async () => {
    await logoutService.logoutAdmin();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/signin" replace />;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 h-screen bg-white border-r border-gray-200 transition-all duration-300 z-30 flex flex-col ${
          sidebarCollapsed ? 'w-16' : 'w-60'
        }`}
      >
        {/* Sidebar Header — blue accent strip */}
        <div className="h-14 flex items-center justify-between px-3 bg-blue-600 flex-shrink-0">
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2.5 min-w-0">
              {orgProfile?.organization_logo_url ? (
                <img
                  src={orgProfile.organization_logo_url}
                  alt="Logo"
                  className="w-7 h-7 rounded object-contain flex-shrink-0 bg-white/20 p-0.5"
                />
              ) : (
                <div className="w-7 h-7 rounded bg-white/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-xs font-bold">
                    {(orgProfile?.organization_name ?? 'A').charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <span className="text-sm font-semibold text-white truncate">
                {orgProfile?.organization_name ?? 'Admin Portal'}
              </span>
            </div>
          )}
          <button
            onClick={toggleSidebar}
            className="p-1.5 hover:bg-white/20 rounded-md transition-colors flex-shrink-0"
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? <Menu className="w-4 h-4 text-white" /> : <X className="w-4 h-4 text-white" />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3">
          <ul className="space-y-0.5 px-2">
            {menuItems.map((item) => (
              <li key={item.label}>
                <button
                  onClick={() => !item.disabled && toggleSection(item.label)}
                  disabled={item.disabled}
                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-md transition-colors ${
                    item.disabled
                      ? 'opacity-40 cursor-not-allowed text-gray-400'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                  title={sidebarCollapsed ? item.label : ''}
                >
                  <div className="flex items-center gap-2.5">
                    <item.icon className="w-4 h-4 flex-shrink-0" />
                    {!sidebarCollapsed && (
                      <span className="text-sm font-medium">{item.label}</span>
                    )}
                  </div>
                  {!sidebarCollapsed && !item.disabled && (
                    expandedSections.includes(item.label) ? (
                      <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                    )
                  )}
                </button>

                {/* Submenu */}
                {!sidebarCollapsed && expandedSections.includes(item.label) && item.children && (
                  <ul className="mt-0.5 ml-6 space-y-0.5">
                    {item.children.map((child) => (
                      <li key={child.path}>
                        <Link
                          to={child.path}
                          className={`flex items-center justify-between px-3 py-1.5 rounded-md text-sm transition-colors ${
                            location.pathname === child.path
                              ? 'bg-blue-50 text-blue-700 font-medium border-l-2 border-blue-600 rounded-l-none'
                              : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
                          }`}
                        >
                          <span>{child.label}</span>
                          {child.badge && (
                            <span className="px-1.5 py-0.5 text-xs font-semibold bg-red-500 text-white rounded-full min-w-[18px] text-center">
                              {child.badge}
                            </span>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </nav>

        {/* Collapsed sign-out (icon only) */}
        {sidebarCollapsed && (
          <div className="border-t border-gray-200 p-3 flex-shrink-0">
            <button
              onClick={handleSignOut}
              className="w-full flex items-center justify-center p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </aside>

      {/* Top header bar */}
      <div
        className={`fixed top-0 right-0 h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 z-20 transition-all duration-300 ${
          sidebarCollapsed ? 'left-16' : 'left-60'
        }`}
      >
        <div />
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500 hidden sm:block">{userEmail}</span>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:block">Sign out</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <main
        className={`flex-1 transition-all duration-300 pt-14 ${
          sidebarCollapsed ? 'ml-16' : 'ml-60'
        }`}
      >
        <Outlet />
      </main>
    </div>
  );
}
