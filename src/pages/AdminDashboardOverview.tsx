import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Clock, MapPin, Shield, RefreshCw, AlertCircle, Lock } from 'lucide-react';
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
        <div className="min-h-screen bg-muted flex items-center justify-center">
          <div className="text-center">
            <Lock className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">Access Denied</h2>
            <p className="text-muted-foreground">You don't have permission to view the dashboard.</p>
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
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
          title="Pending Cities"
          value={metrics?.pendingCities ?? '--'}
          icon={MapPin}
          iconColor="text-primary"
          iconBg="bg-primary/5"
          isLoading={isLoading}
          onClick={() => navigate('/admin/pending-cities')}
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


