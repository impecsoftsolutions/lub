import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Clock, MapPin, Shield, RefreshCw, AlertCircle, Lock, UserRound, UserRoundX, Building2, Landmark } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { PermissionGate } from '../components/permissions/PermissionGate';
import { useDashboardData } from '../hooks/useDashboardData';
import DashboardCard from '../components/dashboard/DashboardCard';
import QuickActionsPanel from '../components/dashboard/QuickActionsPanel';
import SystemStatusPanel from '../components/dashboard/SystemStatusPanel';
import { Button } from '@/components/ui/button';

const AdminDashboardOverview: React.FC = () => {
  const navigate = useNavigate();
  const { metrics, systemStatus, isLoading, error, refresh } = useDashboardData();

  const handleRefresh = async () => {
    await refresh();
  };

  return (
    <PermissionGate
      permission="dashboard.view"
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="max-w-md text-center space-y-3">
            <Lock className="w-12 h-12 text-muted-foreground mx-auto" />
            <h2 className="text-lg font-semibold text-foreground">Welcome to the Admin Panel</h2>
            <p className="text-sm text-muted-foreground">
              You don't have access to the dashboard overview, but you can use the sidebar to open
              the modules your account is permitted to access. If you don't see a module you expect
              to see, contact a super-admin to grant it.
            </p>
          </div>
        </div>
      }
    >
      <div>
      <PageHeader
        title="Dashboard"
        subtitle="Overview of your organisation's membership activity"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading}
            title="Refresh all dashboard data"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        }
      />

      {error && (
        <div className="mb-6 bg-destructive/10 border border-destructive/20 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-destructive">{error}</p>
            <Button
              variant="link"
              size="sm"
              onClick={handleRefresh}
              className="text-destructive hover:text-destructive/80 h-auto p-0 mt-1"
            >
              Try again
            </Button>
          </div>
        </div>
      )}

      {/* Row 1 — membership overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <DashboardCard
          title="Total Approved Members"
          value={metrics?.approvedMembers ?? '--'}
          icon={Users}
          iconColor="text-primary"
          iconBg="bg-primary/10"
          isLoading={isLoading}
          onClick={() => navigate('/admin/registrations')}
          delay={0}
        />

        <DashboardCard
          title="Pending Registrations"
          value={metrics?.pendingRegistrations ?? '--'}
          icon={Clock}
          iconColor="text-primary"
          iconBg="bg-muted/50"
          isLoading={isLoading}
          badge={
            metrics?.pendingRegistrations && metrics.pendingRegistrations > 0
              ? {
                  text: `${metrics.pendingRegistrations} new`,
                  color: 'bg-muted text-foreground'
                }
              : undefined
          }
          onClick={() => navigate('/admin/registrations')}
          delay={100}
        />

        <DashboardCard
          title="Male Members"
          value={metrics?.maleMembers ?? '--'}
          icon={UserRound}
          iconColor="text-blue-600 dark:text-blue-400"
          iconBg="bg-blue-50 dark:bg-blue-900/20"
          isLoading={isLoading}
          onClick={() => navigate('/admin/registrations')}
          delay={200}
        />

        <DashboardCard
          title="Female Members"
          value={metrics?.femaleMembers ?? '--'}
          icon={UserRoundX}
          iconColor="text-pink-600 dark:text-pink-400"
          iconBg="bg-pink-50 dark:bg-pink-900/20"
          isLoading={isLoading}
          onClick={() => navigate('/admin/registrations')}
          delay={300}
        />
      </div>

      {/* Row 2 — geography & admin */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <DashboardCard
          title="Pending Cities"
          value={metrics?.pendingCities ?? '--'}
          icon={MapPin}
          iconColor="text-primary"
          iconBg="bg-primary/5"
          isLoading={isLoading}
          onClick={() => navigate('/admin/pending-cities')}
          delay={0}
        />

        <DashboardCard
          title="Active District Units"
          value={metrics?.activeDistrictUnits ?? '--'}
          icon={Building2}
          iconColor="text-amber-600 dark:text-amber-400"
          iconBg="bg-amber-50 dark:bg-amber-900/20"
          isLoading={isLoading}
          delay={100}
        />

        <DashboardCard
          title="Active Cities"
          value={metrics?.activeCities ?? '--'}
          icon={Landmark}
          iconColor="text-emerald-600 dark:text-emerald-400"
          iconBg="bg-emerald-50 dark:bg-emerald-900/20"
          isLoading={isLoading}
          delay={200}
        />

        <DashboardCard
          title="Active Admin Users"
          value={metrics?.activeAdminUsers ?? '--'}
          icon={Shield}
          iconColor="text-primary"
          iconBg="bg-primary/5"
          isLoading={isLoading}
          onClick={() => navigate('/admin/user-management')}
          delay={300}
        />
      </div>

      <div className="mb-6">
        <QuickActionsPanel
          pendingRegistrations={metrics?.pendingRegistrations ?? 0}
          pendingCities={metrics?.pendingCities ?? 0}
          approvedMembers={metrics?.approvedMembers ?? 0}
          isLoading={isLoading}
        />
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


