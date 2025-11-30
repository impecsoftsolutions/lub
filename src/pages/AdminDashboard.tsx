import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { Settings, Users, BarChart3, FileText, LogOut, User, Shield, MapPin, Globe, Building2, LayoutGrid as Layout, Trash2 } from 'lucide-react';
import PaymentSettings from './AdminDashboard/PaymentSettings';
import { logoutService } from '../lib/logoutService';

const AdminDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'payment-settings'>('overview');
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // No auth check needed - handled by AdminLayout
  }, []);

  // Sync activeTab with URL path
  useEffect(() => {
    const path = location.pathname;
    if (path === '/admin/payment-settings') {
      setActiveTab('payment-settings');
    } else {
      setActiveTab('overview');
    }
  }, [location.pathname]);

  const handleSignOut = async () => {
    try {
      // Use unified logout service
      await logoutService.logoutAdmin();
    } catch (error) {
      console.error('[AdminDashboard] Error during logout:', error);
      // logoutService handles redirect even on error
    }
  };

  const handleTabClick = (tab: 'overview' | 'payment-settings') => {
    console.log('[AdminDashboard] Tab clicked:', tab);
    if (tab === 'overview') {
      navigate('/admin');
    } else if (tab === 'payment-settings') {
      navigate('/admin/payment-settings');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Settings className="w-8 h-8 text-blue-600 mr-3" />
              <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
            </div>
            <div className="flex items-center space-x-4">
              {/* Navigation Tabs */}
              <nav className="flex space-x-4">
                <button
                  onClick={() => handleTabClick('overview')}
                  className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                    activeTab === 'overview'
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Overview
                </button>
                <button
                  onClick={() => handleTabClick('payment-settings')}
                  className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                    activeTab === 'payment-settings'
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Payment Settings
                </button>
              </nav>
              
              <button
                onClick={handleSignOut}
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'overview' && (
          <>
            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <Link
                to="/admin/profile-settings"
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center">
                  <User className="w-8 h-8 text-purple-600" />
                  <div className="ml-4">
                    <h3 className="text-lg font-semibold text-gray-900">Organization Profile</h3>
                    <p className="text-sm text-gray-600">Manage logo, contact info & social media</p>
                  </div>
                </div>
              </Link>

              <Link
                to="/admin/registrations"
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center">
                  <Users className="w-8 h-8 text-blue-600" />
                  <div className="ml-4">
                    <h3 className="text-lg font-semibold text-gray-900">Member Registrations</h3>
                    <p className="text-sm text-gray-600">View and manage applications</p>
                  </div>
                </div>
              </Link>

              <Link
                to="/admin/user-management"
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center">
                  <Shield className="w-8 h-8 text-purple-600" />
                  <div className="ml-4">
                    <h3 className="text-lg font-semibold text-gray-900">Admin User Management</h3>
                    <p className="text-sm text-gray-600">Manage admin roles and permissions</p>
                  </div>
                </div>
              </Link>

              <Link
                to="/admin/state-management"
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center">
                  <Globe className="w-8 h-8 text-green-600" />
                  <div className="ml-4">
                    <h3 className="text-lg font-semibold text-gray-900">State Management</h3>
                    <p className="text-sm text-gray-600">Manage states and their status</p>
                  </div>
                </div>
              </Link>

              <Link
                to="/admin/designations-management"
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center">
                  <Building2 className="w-8 h-8 text-purple-600" />
                  <div className="ml-4">
                    <h3 className="text-lg font-semibold text-gray-900">Designations Management</h3>
                    <p className="text-sm text-gray-600">Manage job titles and designations</p>
                  </div>
                </div>
              </Link>

              <Link
                to="/admin/directory-visibility"
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center">
                  <Shield className="w-8 h-8 text-blue-600" />
                  <div className="ml-4">
                    <h3 className="text-lg font-semibold text-gray-900">Directory Visibility</h3>
                    <p className="text-sm text-gray-600">Control field visibility for members</p>
                  </div>
                </div>
              </Link>

              <Link
                to="/admin/city-management"
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center">
                  <MapPin className="w-8 h-8 text-emerald-600" />
                  <div className="ml-4">
                    <h3 className="text-lg font-semibold text-gray-900">City Management</h3>
                    <p className="text-sm text-gray-600">Manage cities and locations</p>
                  </div>
                </div>
              </Link>

              <Link
                to="/admin/pending-cities"
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center">
                  <MapPin className="w-8 h-8 text-amber-600" />
                  <div className="ml-4">
                    <h3 className="text-lg font-semibold text-gray-900">Pending Cities Review</h3>
                    <p className="text-sm text-gray-600">Review and approve new cities</p>
                  </div>
                </div>
              </Link>

              {isSuperAdmin && (
                <Link
                  to="/admin/deleted-members"
                  className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center">
                    <Trash2 className="w-8 h-8 text-red-600" />
                    <div className="ml-4">
                      <h3 className="text-lg font-semibold text-gray-900">Deleted Members</h3>
                      <p className="text-sm text-gray-600">View and restore deleted members</p>
                    </div>
                  </div>
                </Link>
              )}

              <Link
                to="/admin/forms"
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center">
                  <Layout className="w-8 h-8 text-indigo-600" />
                  <div className="ml-4">
                    <h3 className="text-lg font-semibold text-gray-900">Form Configuration</h3>
                    <p className="text-sm text-gray-600">Configure registration form fields</p>
                  </div>
                </div>
              </Link>

              {isSuperAdmin && (
                <Link
                  to="/admin/settings/validation"
                  className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center">
                    <Shield className="w-8 h-8 text-teal-600" />
                    <div className="ml-4">
                      <h3 className="text-lg font-semibold text-gray-900">Validation Settings</h3>
                      <p className="text-sm text-gray-600">Manage validation rules and patterns</p>
                    </div>
                  </div>
                </Link>
              )}

              <button
                onClick={() => handleTabClick('payment-settings')}
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow text-left"
              >
                <div className="flex items-center">
                  <MapPin className="w-8 h-8 text-green-600" />
                  <div className="ml-4">
                    <h3 className="text-lg font-semibold text-gray-900">State Payment Settings</h3>
                    <p className="text-sm text-gray-600">Manage payment settings by state</p>
                  </div>
                </div>
              </button>

              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center">
                  <BarChart3 className="w-8 h-8 text-orange-600" />
                  <div className="ml-4">
                    <h3 className="text-lg font-semibold text-gray-900">Analytics</h3>
                    <p className="text-sm text-gray-600">Coming soon</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center">
                  <FileText className="w-8 h-8 text-purple-600" />
                  <div className="ml-4">
                    <h3 className="text-lg font-semibold text-gray-900">Reports</h3>
                    <p className="text-sm text-gray-600">Coming soon</p>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
        
        {activeTab === 'payment-settings' && (
          <PaymentSettings />
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;