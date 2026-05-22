import { useState, useEffect, useCallback } from 'react';
import { supabase, dashboardService } from '../lib/supabase';
import { sessionManager } from '../lib/sessionManager';

export interface DashboardMetrics {
  approvedMembers: number;
  pendingRegistrations: number;
  pendingCities: number;
  activeAdminUsers: number;
  maleMembers: number;
  femaleMembers: number;
  activeDistrictUnits: number;
  activeCities: number;
}

export interface RecentActivity {
  id: string;
  full_name: string;
  email: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export interface SystemStatus {
  activeStates: number;
  totalDesignations: number;
  formFieldsConfigured: number;
  lastUpdated: Date;
}

export interface DashboardData {
  metrics: DashboardMetrics | null;
  recentActivity: RecentActivity[];
  systemStatus: SystemStatus | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export const useDashboardData = (): DashboardData => {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboardData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const sessionToken = sessionManager.getSessionToken();

      // Fetch dashboard metrics via the server-side RPC (single authenticated call).
      // This ensures pending_registrations matches the sidebar badge count because
      // both now go through the same resolve_custom_session_user_id auth path.
      const [metricsResult, recentActivityResult] = await Promise.all([
        sessionToken
          ? dashboardService.getMetricsWithSession(sessionToken)
          : Promise.resolve(null),
        supabase
          .from('member_registrations')
          .select('id, full_name, email, status, created_at')
          .order('created_at', { ascending: false })
          .limit(10)
      ]);

      if (metricsResult) {
        setMetrics({
          approvedMembers:     metricsResult.approvedMembers,
          pendingRegistrations: metricsResult.pendingRegistrations,
          pendingCities:       metricsResult.pendingCities,
          activeAdminUsers:    metricsResult.activeAdminUsers,
          maleMembers:         metricsResult.maleMembers,
          femaleMembers:       metricsResult.femaleMembers,
          activeDistrictUnits: metricsResult.activeDistrictUnits,
          activeCities:        metricsResult.activeCities,
        });

        setSystemStatus({
          activeStates:         metricsResult.activeStates,
          totalDesignations:    metricsResult.totalDesignations,
          formFieldsConfigured: metricsResult.formFieldsConfigured,
          lastUpdated:          metricsResult.lastUpdated ? new Date(metricsResult.lastUpdated) : new Date(),
        });
      }

      setRecentActivity(recentActivityResult.data || []);
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError('Failed to load dashboard data. Please try refreshing.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  return {
    metrics,
    recentActivity,
    systemStatus,
    isLoading,
    error,
    refresh: fetchDashboardData
  };
};
