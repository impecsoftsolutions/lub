import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Clock, MapPin, Shield, RefreshCw, AlertCircle, Lock } from 'lucide-react';
import { PermissionGate } from '../components/permissions/PermissionGate';
import { useDashboardData } from '../hooks/useDashboardData';
import DashboardCard from '../components/dashboard/DashboardCard';
import RecentActivityList from '../components/dashboard/RecentActivityList';
import QuickActionsPanel from '../components/dashboard/QuickActionsPanel';
import SystemStatusPanel from '../components/dashboard/SystemStatusPanel';

const AdminDashboardOverview: React.FC = () => {
  const navigate = useNavigate();
  const { metrics, recentActivity, systemStatus, isLoading, error, refresh } = useDashboardData();

  const handleRefresh = async () => {
    await refresh();
  };

  return (
    <PermissionGate
      permission="dashboard.view"
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <Lock className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
            <p className="text-gray-600">You don't have permission to view the dashboard.</p>
          </div>
        </div>
      }
    >
      <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard Overview</h1>
          <p className="text-gray-600 mt-2">Welcome to your admin dashboard</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isLoading}
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Refresh all dashboard data"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-800">{error}</p>
            <button
              onClick={handleRefresh}
              className="text-sm text-red-600 hover:text-red-700 font-medium mt-1"
            >
              Try again
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <DashboardCard
          title="Total Approved Members"
          value={metrics?.approvedMembers ?? '--'}
          icon={Users}
          iconColor="text-blue-600"
          bgColor="bg-blue-100"
          isLoading={isLoading}
          onClick={() => navigate('/admin/registrations')}
          delay={0}
        />

        <DashboardCard
          title="Pending Registrations"
          value={metrics?.pendingRegistrations ?? '--'}
          icon={Clock}
          iconColor="text-amber-600"
          bgColor="bg-amber-100"
          isLoading={isLoading}
          badge={
            metrics?.pendingRegistrations && metrics.pendingRegistrations > 0
              ? {
                  text: `${metrics.pendingRegistrations} new`,
                  color: 'bg-amber-100 text-amber-800'
                }
              : undefined
          }
          onClick={() => navigate('/admin/registrations')}
          delay={100}
        />

        <DashboardCard
          title="Pending Cities"
          value={metrics?.pendingCities ?? '--'}
          icon={MapPin}
          iconColor="text-green-600"
          bgColor="bg-green-100"
          isLoading={isLoading}
          onClick={() => navigate('/admin/pending-cities')}
          delay={200}
        />

        <DashboardCard
          title="Active Admin Users"
          value={metrics?.activeAdminUsers ?? '--'}
          icon={Shield}
          iconColor="text-blue-600"
          bgColor="bg-blue-100"
          isLoading={isLoading}
          onClick={() => navigate('/admin/user-management')}
          delay={300}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-2">
          <RecentActivityList
            activities={recentActivity}
            isLoading={isLoading}
            lastUpdated={systemStatus?.lastUpdated}
          />
        </div>

        <div>
          <QuickActionsPanel
            pendingRegistrations={metrics?.pendingRegistrations ?? 0}
            pendingCities={metrics?.pendingCities ?? 0}
            approvedMembers={metrics?.approvedMembers ?? 0}
            isLoading={isLoading}
          />
        </div>
      </div>

      <SystemStatusPanel
        systemStatus={systemStatus}
        isLoading={isLoading}
        onRefresh={handleRefresh}
      />
      </div>
    </PermissionGate>
  );
};

export default AdminDashboardOverview;
