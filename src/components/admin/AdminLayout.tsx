import { Navigate, Outlet, Link, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { sessionManager } from '../../lib/sessionManager';
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
import { useAdmin } from '../../contexts/AdminContext';

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

  useEffect(() => {
    const checkAuth = () => {
      try {
        const userData = sessionManager.getUserData();

        if (!userData) {
          setIsAuthenticated(false);
          setIsLoading(false);
          return;
        }

        if (sessionManager.isSessionExpired()) {
          sessionManager.clearSession();
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

    checkAuth();
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

  const handleSignOut = () => {
    sessionManager.clearSession();
    window.location.href = '/signin';
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
          sidebarCollapsed ? 'w-16' : 'w-64'
        }`}
      >
        {/* Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-gray-200">
          {!sidebarCollapsed && (
            <h1 className="text-xl font-bold text-gray-900">Admin Portal</h1>
          )}
          <button
            onClick={toggleSidebar}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? <Menu className="w-5 h-5" /> : <X className="w-5 h-5" />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4">
          <ul className="space-y-1 px-2">
            {menuItems.map((item) => (
              <li key={item.label}>
                <button
                  onClick={() => !item.disabled && toggleSection(item.label)}
                  disabled={item.disabled}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors ${
                    item.disabled
                      ? 'opacity-50 cursor-not-allowed text-gray-400'
                      : 'hover:bg-gray-100 text-gray-700'
                  }`}
                  title={sidebarCollapsed ? item.label : ''}
                >
                  <div className="flex items-center gap-3">
                    <item.icon className="w-5 h-5 flex-shrink-0" />
                    {!sidebarCollapsed && (
                      <span className="font-medium text-sm">{item.label}</span>
                    )}
                  </div>
                  {!sidebarCollapsed && !item.disabled && (
                    expandedSections.includes(item.label) ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )
                  )}
                </button>

                {/* Submenu */}
                {!sidebarCollapsed && expandedSections.includes(item.label) && item.children && (
                  <ul className="mt-1 ml-8 space-y-1">
                    {item.children.map((child) => (
                      <li key={child.path}>
                        <Link
                          to={child.path}
                          className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                            location.pathname === child.path
                              ? 'bg-blue-50 text-blue-700 font-medium'
                              : 'text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          <span>{child.label}</span>
                          {child.badge && (
                            <span className="px-2 py-0.5 text-xs font-medium bg-red-500 text-white rounded-full">
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

        {/* User Info & Sign Out */}
        <div className="border-t border-gray-200 p-4">
          {!sidebarCollapsed ? (
            <>
              <div className="mb-3">
                <p className="text-xs text-gray-500 mb-1">Signed in as</p>
                <p className="text-sm font-medium text-gray-900 truncate">{userEmail}</p>
              </div>
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </>
          ) : (
            <button
              onClick={handleSignOut}
              className="w-full flex items-center justify-center p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="Sign Out"
            >
              <LogOut className="w-5 h-5" />
            </button>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main
        className={`flex-1 transition-all duration-300 ${
          sidebarCollapsed ? 'ml-16' : 'ml-64'
        }`}
      >
        <Outlet />
      </main>
    </div>
  );
}
